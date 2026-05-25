// ============================================================
// app/api/markets/buy/route.ts
// Handles share purchases. Deducts balance, issues shares,
// updates market prices using the AMM engine.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { calculatePurchase, MIN_TRADE_NGN, MAX_TRADE_NGN } from '@/lib/market-engine';

export async function POST(req: NextRequest) {
  // ── 1. Authenticate user ─────────────────────────────────────
  const authSupabase = await createServerSupabaseClient();
  const { data: { user }, error: authErr } = await authSupabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { marketId, side, amountNGN } = await req.json();

  // ── 2. Validate input ─────────────────────────────────────────
  if (!marketId || !side || !amountNGN) {
    return NextResponse.json({ error: 'marketId, side, and amountNGN are required' }, { status: 400 });
  }
  if (!['yes', 'no'].includes(side)) {
    return NextResponse.json({ error: 'side must be "yes" or "no"' }, { status: 400 });
  }
  if (amountNGN < MIN_TRADE_NGN || amountNGN > MAX_TRADE_NGN) {
    return NextResponse.json({ error: `Amount must be between ₦${MIN_TRADE_NGN} and ₦${MAX_TRADE_NGN}` }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();

  // ── 3. Fetch market & validate it's open ─────────────────────
  const { data: market, error: marketErr } = await supabase
    .from('markets')
    .select('*')
    .eq('id', marketId)
    .single();

  if (marketErr || !market) {
    return NextResponse.json({ error: 'Market not found' }, { status: 404 });
  }
  if (market.status !== 'open') {
    return NextResponse.json({ error: 'Market is not open for trading' }, { status: 409 });
  }
  if (new Date(market.resolution_deadline) <= new Date()) {
    return NextResponse.json({ error: 'Market deadline has passed' }, { status: 409 });
  }

  // ── 4. Check user has sufficient balance ─────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('balance')
    .eq('id', user.id)
    .single();

  if (!profile || Number(profile.balance) < amountNGN) {
    return NextResponse.json({ error: 'Insufficient balance' }, { status: 402 });
  }

  // ── 5. Calculate shares & new prices via AMM ─────────────────
  const result = calculatePurchase(
    Number(market.yes_shares),
    Number(market.no_shares),
    side,
    amountNGN
  );

  // ── 6. Deduct balance ─────────────────────────────────────────
  const newBalance = Number(profile.balance) - amountNGN;
  await supabase.from('profiles').update({ balance: newBalance }).eq('id', user.id);

  // ── 7. Upsert position ────────────────────────────────────────
  const { data: existingPosition } = await supabase
    .from('positions')
    .select('*')
    .eq('user_id', user.id)
    .eq('market_id', marketId)
    .eq('side', side)
    .maybeSingle();

  let positionId: string;

  if (existingPosition) {
    const newShares = Number(existingPosition.shares) + result.sharesGranted;
    const newTotalCost = Number(existingPosition.total_cost) + amountNGN;
    const newAvgPrice = newTotalCost / newShares;

    const { data: updatedPos } = await supabase
      .from('positions')
      .update({ shares: newShares, avg_price: newAvgPrice, total_cost: newTotalCost })
      .eq('id', existingPosition.id)
      .select('id')
      .single();

    positionId = updatedPos!.id;
  } else {
    const { data: newPos } = await supabase
      .from('positions')
      .insert({
        user_id: user.id,
        market_id: marketId,
        side,
        shares: result.sharesGranted,
        avg_price: result.avgPricePerShare,
        total_cost: amountNGN,
      })
      .select('id')
      .single();

    positionId = newPos!.id;
  }

  // ── 8. Update market prices & pool ───────────────────────────
  await supabase
    .from('markets')
    .update({
      yes_price: result.newYesPrice,
      no_price: result.newNoPrice,
      yes_shares: result.newYesShares,
      no_shares: result.newNoShares,
      total_pool: Number(market.total_pool) + amountNGN,
    })
    .eq('id', marketId);

  // ── 9. Record transaction ─────────────────────────────────────
  await supabase.from('transactions').insert({
    user_id: user.id,
    type: 'buy_shares',
    amount: -amountNGN,
    balance_after: newBalance,
    description: `Bought ${result.sharesGranted.toFixed(2)} ${side.toUpperCase()} shares in "${market.title}"`,
    market_id: marketId,
    position_id: positionId,
    metadata: { shares: result.sharesGranted, price_per_share: result.avgPricePerShare },
  });

  return NextResponse.json({
    success: true,
    sharesGranted: result.sharesGranted,
    avgPricePerShare: result.avgPricePerShare,
    newBalance,
  });
}
