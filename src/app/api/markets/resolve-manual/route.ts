// app/api/markets/resolve-manual/route.ts
// Admin-only: manually resolve a disputed market, including cancellations with refunds.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { calculatePayout } from '@/lib/market-engine';

export async function POST(req: NextRequest) {
  // ── 1. Auth & admin check ─────────────────────────────────────
  const authSupabase = await createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminSupabaseClient();
  const { data: adminProfile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single();
  if (!adminProfile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { marketId, outcome, disputeId, resolution } = await req.json();
  if (!marketId || !outcome) {
    return NextResponse.json({ error: 'marketId and outcome are required' }, { status: 400 });
  }
  if (!['yes', 'no', 'cancelled'].includes(outcome)) {
    return NextResponse.json({ error: 'outcome must be yes, no, or cancelled' }, { status: 400 });
  }

  // ── 2. Fetch market ───────────────────────────────────────────
  const { data: market } = await supabase.from('markets').select('*').eq('id', marketId).single();
  if (!market) return NextResponse.json({ error: 'Market not found' }, { status: 404 });
  if (!['resolving', 'disputed', 'closed', 'open'].includes(market.status)) {
    return NextResponse.json({ error: 'Market cannot be manually resolved in its current state' }, { status: 409 });
  }

  const totalPool = Number(market.total_pool);

  // ── 3a. Cancellation — refund everyone ────────────────────────
  if (outcome === 'cancelled') {
    const { data: allPositions } = await supabase
      .from('positions').select('*').eq('market_id', marketId);

    for (const position of allPositions ?? []) {
      const { data: prof } = await supabase
        .from('profiles').select('balance').eq('id', position.user_id).single();
      const refundAmount = Number(position.total_cost);
      const newBalance = Number(prof?.balance ?? 0) + refundAmount;

      await supabase.from('profiles').update({ balance: newBalance }).eq('id', position.user_id);
      await supabase.from('transactions').insert({
        user_id: position.user_id,
        type: 'refund',
        amount: refundAmount,
        balance_after: newBalance,
        description: `Market cancelled: "${market.title}" — full refund`,
        market_id: marketId,
        position_id: position.id,
      });
    }

    await supabase.from('markets').update({
      status: 'cancelled', outcome: 'cancelled', resolved_at: new Date().toISOString(),
    }).eq('id', marketId);

    if (disputeId) {
      await supabase.from('disputes').update({
        status: 'resolved', resolved_by: user.id,
        resolution: resolution || 'Market cancelled — all positions refunded',
        resolved_at: new Date().toISOString(),
      }).eq('id', disputeId);
    }

    return NextResponse.json({ success: true, outcome: 'cancelled', refundedCount: (allPositions ?? []).length });
  }

  // ── 3b. YES or NO resolution — pay out winners ─────────────────
  const { data: winPositions } = await supabase
    .from('positions').select('*').eq('market_id', marketId).eq('side', outcome);

  const totalWinShares = (winPositions ?? []).reduce((sum, p) => sum + Number(p.shares), 0);

  for (const position of winPositions ?? []) {
    const { netPayout, fee } = calculatePayout(Number(position.shares), totalWinShares, totalPool);
    const { data: prof } = await supabase
      .from('profiles').select('balance').eq('id', position.user_id).single();
    const newBalance = Number(prof?.balance ?? 0) + netPayout;

    await supabase.from('profiles').update({ balance: newBalance }).eq('id', position.user_id);
    await supabase.from('positions').update({ payout: netPayout }).eq('id', position.id);
    await supabase.from('transactions').insert({
      user_id: position.user_id, type: 'payout',
      amount: netPayout, balance_after: newBalance,
      description: `Manual resolution payout — ${outcome.toUpperCase()} wins in "${market.title}"`,
      market_id: marketId, position_id: position.id,
      metadata: { gross: netPayout + fee, fee, outcome, resolved_by: user.id },
    });
  }

  await supabase.from('markets').update({
    status: 'resolved', outcome, resolved_at: new Date().toISOString(),
  }).eq('id', marketId);

  if (disputeId) {
    await supabase.from('disputes').update({
      status: 'resolved', resolved_by: user.id,
      resolution: resolution || `Manually resolved as ${outcome.toUpperCase()}`,
      resolved_at: new Date().toISOString(),
    }).eq('id', disputeId);
  }

  return NextResponse.json({
    success: true, outcome,
    winnersCount: (winPositions ?? []).length, totalPool,
  });
}
