// ============================================================
// app/api/markets/resolve/route.ts
// Admin-triggered market resolution. Queries the oracle and
// either auto-resolves with payouts or sends to dispute queue.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { queryOracle } from '@/lib/oracle';
import { calculatePayout } from '@/lib/market-engine';

export async function POST(req: NextRequest) {
  // ── 1. Authenticate admin ─────────────────────────────────────
  const authSupabase = await createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminSupabaseClient();
  const { data: adminProfile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single();
  if (!adminProfile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { marketId } = await req.json();
  if (!marketId) return NextResponse.json({ error: 'marketId required' }, { status: 400 });

  // ── 2. Fetch market ───────────────────────────────────────────
  const { data: market } = await supabase
    .from('markets').select('*').eq('id', marketId).single();

  if (!market) return NextResponse.json({ error: 'Market not found' }, { status: 404 });
  if (!['open', 'closed'].includes(market.status)) {
    return NextResponse.json({ error: 'Market is not in a resolvable state' }, { status: 409 });
  }

  // ── 3. Freeze market (escrow state: status → "resolving") ─────
  await supabase.from('markets').update({ status: 'resolving' }).eq('id', marketId);

  // ── 4. Query Oracle ───────────────────────────────────────────
  const oracleResult = await queryOracle(
    market.oracle_source ?? 'manual',
    market.oracle_event_id ?? '',
    market.title
  );

  // ── 5. Handle oracle outcomes ─────────────────────────────────

  // 5a. Not ready yet — revert to closed, wait for next trigger
  if (oracleResult.status === 'not_ready') {
    await supabase.from('markets').update({ status: 'closed' }).eq('id', marketId);
    return NextResponse.json({ message: oracleResult.reason, status: 'not_ready' });
  }

  // 5b. Error or ambiguous → dispute queue
  if (oracleResult.status === 'ambiguous' || oracleResult.status === 'error') {
    await supabase.from('markets').update({ status: 'disputed' }).eq('id', marketId);
    await supabase.from('disputes').insert({
      market_id: marketId,
      reason: oracleResult.status === 'ambiguous' ? oracleResult.reason : oracleResult.error,
      oracle_data: oracleResult.status === 'ambiguous' ? oracleResult.rawData as Record<string,unknown> : null,
    });
    return NextResponse.json({ message: 'Sent to dispute queue', status: 'disputed' });
  }

  // 5c. Definitive outcome → auto-resolve & pay out
  const outcome = oracleResult.outcome;

  // Fetch all winning positions
  const { data: positions } = await supabase
    .from('positions')
    .select('*')
    .eq('market_id', marketId)
    .eq('side', outcome);

  const totalWinShares = positions?.reduce((sum, p) => sum + Number(p.shares), 0) ?? 0;
  const totalPool = Number(market.total_pool);

  // Process payouts for each winner
  if (positions && positions.length > 0) {
    for (const position of positions) {
      const { netPayout, fee } = calculatePayout(Number(position.shares), totalWinShares, totalPool);

      // Fetch user's current balance
      const { data: profile } = await supabase
        .from('profiles').select('balance').eq('id', position.user_id).single();

      const newBalance = Number(profile?.balance ?? 0) + netPayout;

      // Credit winnings
      await supabase.from('profiles').update({ balance: newBalance }).eq('id', position.user_id);

      // Update position with payout
      await supabase.from('positions').update({ payout: netPayout }).eq('id', position.id);

      // Record transaction
      await supabase.from('transactions').insert({
        user_id: position.user_id,
        type: 'payout',
        amount: netPayout,
        balance_after: newBalance,
        description: `Payout for winning ${outcome.toUpperCase()} position in "${market.title}"`,
        market_id: marketId,
        position_id: position.id,
        metadata: { gross_payout: netPayout + fee, fee, outcome },
      });
    }
  }

  // ── 6. Mark market as resolved ────────────────────────────────
  await supabase.from('markets').update({
    status: 'resolved',
    outcome,
    resolved_at: new Date().toISOString(),
    oracle_raw_response: oracleResult.rawData as Record<string, unknown>,
  }).eq('id', marketId);

  return NextResponse.json({
    success: true,
    outcome,
    winnersCount: positions?.length ?? 0,
    totalPool,
  });
}
