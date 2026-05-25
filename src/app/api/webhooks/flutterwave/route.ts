// ============================================================
// app/api/webhooks/flutterwave/route.ts
// Listens for Flutterwave charge.completed events.
// Verifies the webhook signature, extracts the user ID from
// tx_ref, and credits the user's Supabase balance.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminSupabaseClient } from '@/lib/supabase/server';
import { extractUserIdFromTxRef } from '@/lib/banks';
import type { FlutterwaveWebhookPayload } from '@/types';

export async function POST(req: NextRequest) {
  // ── 1. Verify the Flutterwave webhook signature ─────────────
  // Flutterwave sends a "verif-hash" header that must match
  // FLUTTERWAVE_WEBHOOK_HASH set in your Flutterwave dashboard.
  const incomingHash = req.headers.get('verif-hash');
  const expectedHash = process.env.FLUTTERWAVE_WEBHOOK_HASH;

  if (!incomingHash || !expectedHash || incomingHash !== expectedHash) {
    console.error('[Webhook] Invalid verif-hash — possible spoofed request.');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── 2. Parse the payload ─────────────────────────────────────
  let payload: FlutterwaveWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Only process successful charge events
  if (payload.event !== 'charge.completed' || payload.data?.status !== 'successful') {
    // Acknowledge the webhook but take no action
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const { tx_ref, amount, currency, id: flwId } = payload.data;

  // ── 3. Validate currency ─────────────────────────────────────
  if (currency !== 'NGN') {
    console.error(`[Webhook] Unexpected currency: ${currency}`);
    return NextResponse.json({ error: 'Currency not supported' }, { status: 400 });
  }

  // ── 4. Extract user ID from tx_ref ───────────────────────────
  // tx_ref format: NP-{userId}-{timestamp}-{random}
  const userId = extractUserIdFromTxRef(tx_ref);
  if (!userId) {
    console.error(`[Webhook] Could not extract userId from tx_ref: ${tx_ref}`);
    return NextResponse.json({ error: 'Invalid tx_ref' }, { status: 400 });
  }

  // ── 5. Idempotency — prevent double-crediting ─────────────────
  const supabase = createAdminSupabaseClient(); // SUPABASE_SERVICE_ROLE_KEY

  const { data: existingTx } = await supabase
    .from('transactions')
    .select('id')
    .eq('reference', tx_ref)
    .maybeSingle();

  if (existingTx) {
    console.log(`[Webhook] Duplicate tx_ref ${tx_ref} — already processed.`);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // ── 6. Re-verify the payment with Flutterwave API ─────────────
  // Never trust the webhook amount alone — always verify with Flutterwave
  const verifyRes = await fetch(
    `https://api.flutterwave.com/v3/transactions/${flwId}/verify`,
    {
      headers: {
        Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`, // ← Server-only key
        'Content-Type': 'application/json',
      },
    }
  );

  const verifyData = await verifyRes.json();
  if (
    verifyData.status !== 'success' ||
    verifyData.data?.status !== 'successful' ||
    verifyData.data?.currency !== 'NGN'
  ) {
    console.error('[Webhook] Flutterwave verification failed:', verifyData);
    return NextResponse.json({ error: 'Payment verification failed' }, { status: 400 });
  }

  const verifiedAmount: number = verifyData.data.amount;

  // ── 7. Credit user balance in a transaction ───────────────────
  // Fetch current balance
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('balance')
    .eq('id', userId)
    .single();

  if (profileErr || !profile) {
    console.error(`[Webhook] Profile not found for userId: ${userId}`, profileErr);
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const newBalance = Number(profile.balance) + verifiedAmount;

  // Update balance
  const { error: updateErr } = await supabase
    .from('profiles')
    .update({ balance: newBalance })
    .eq('id', userId);

  if (updateErr) {
    console.error('[Webhook] Balance update failed:', updateErr);
    return NextResponse.json({ error: 'Balance update failed' }, { status: 500 });
  }

  // Record transaction in ledger
  await supabase.from('transactions').insert({
    user_id: userId,
    type: 'deposit',
    amount: verifiedAmount,
    balance_after: newBalance,
    description: `Flutterwave deposit via ${payload.data.payment_type}`,
    reference: tx_ref,
    metadata: {
      flw_transaction_id: flwId,
      flw_ref: payload.data.flw_ref,
      customer_email: payload.data.customer.email,
    },
  });

  console.log(`[Webhook] ✅ Credited ₦${verifiedAmount} to user ${userId}`);
  return NextResponse.json({ received: true }, { status: 200 });
}
