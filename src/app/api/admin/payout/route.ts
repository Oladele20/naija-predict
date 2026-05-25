// ============================================================
// app/api/admin/payout/route.ts
// Admin-only route to approve a pending withdrawal.
// Calls Flutterwave Transfers API, then marks withdrawal
// as completed or automatically refunds on failure.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { generateWithdrawalRef } from '@/lib/banks';

export async function POST(req: NextRequest) {
  // ── 1. Authenticate the requesting admin ─────────────────────
  const authSupabase = await createServerSupabaseClient();
  const { data: { user }, error: authErr } = await authSupabase.auth.getUser();

  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify admin status from profiles table
  const supabase = createAdminSupabaseClient(); // uses SUPABASE_SERVICE_ROLE_KEY
  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!adminProfile?.is_admin) {
    return NextResponse.json({ error: 'Forbidden — admin access required' }, { status: 403 });
  }

  // ── 2. Parse request body ─────────────────────────────────────
  const { withdrawalId } = await req.json();
  if (!withdrawalId) {
    return NextResponse.json({ error: 'withdrawalId is required' }, { status: 400 });
  }

  // ── 3. Fetch the withdrawal record ───────────────────────────
  const { data: withdrawal, error: fetchErr } = await supabase
    .from('withdrawals')
    .select('*')
    .eq('id', withdrawalId)
    .single();

  if (fetchErr || !withdrawal) {
    return NextResponse.json({ error: 'Withdrawal not found' }, { status: 404 });
  }

  if (withdrawal.status !== 'pending') {
    return NextResponse.json(
      { error: `Withdrawal is already ${withdrawal.status}` },
      { status: 409 }
    );
  }

  // ── 4. Mark as "processing" to prevent double approval ────────
  await supabase
    .from('withdrawals')
    .update({ status: 'processing', processed_by: user.id })
    .eq('id', withdrawalId);

  // ── 5. Call Flutterwave Transfers API ─────────────────────────
  const flwReference = generateWithdrawalRef(withdrawalId);

  let flwResponse: Record<string, unknown>;
  let flwSuccess = false;
  let flwTransferId: string | null = null;

  try {
    const transferRes = await fetch('https://api.flutterwave.com/v3/transfers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`, // ← Server-only key
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        account_bank: withdrawal.bank_code,
        account_number: withdrawal.account_number,
        amount: withdrawal.amount,
        narration: `NaijaPredict withdrawal - ${withdrawal.account_name ?? 'User'}`,
        currency: 'NGN',
        reference: flwReference,
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/flutterwave-transfer`,
        debit_currency: 'NGN',
      }),
    });

    flwResponse = await transferRes.json();
    flwSuccess =
      (flwResponse.status as string) === 'success' &&
      ['NEW', 'PENDING'].includes((flwResponse.data as Record<string, string>)?.status);

    if (flwSuccess) {
      flwTransferId = String((flwResponse.data as Record<string, unknown>)?.id ?? '');
    }
  } catch (err) {
    flwResponse = { error: String(err) };
  }

  // ── 6. Handle success ─────────────────────────────────────────
  if (flwSuccess) {
    await supabase
      .from('withdrawals')
      .update({
        status: 'completed',
        flw_transfer_id: flwTransferId,
        flw_reference: flwReference,
        processed_at: new Date().toISOString(),
      })
      .eq('id', withdrawalId);

    console.log(`[Payout] ✅ Transfer initiated for withdrawal ${withdrawalId}`);
    return NextResponse.json({ success: true, flwTransferId });
  }

  // ── 7. Handle failure — automatically refund the user ─────────
  console.error('[Payout] ❌ Transfer failed:', flwResponse);

  // Fetch user's current balance before refund
  const { data: userProfile } = await supabase
    .from('profiles')
    .select('balance')
    .eq('id', withdrawal.user_id)
    .single();

  const refundBalance = Number(userProfile?.balance ?? 0) + Number(withdrawal.amount);

  // Refund balance
  await supabase
    .from('profiles')
    .update({ balance: refundBalance })
    .eq('id', withdrawal.user_id);

  // Record refund transaction
  await supabase.from('transactions').insert({
    user_id: withdrawal.user_id,
    type: 'refund',
    amount: withdrawal.amount,
    balance_after: refundBalance,
    description: `Withdrawal refund — transfer failed: ${(flwResponse as Record<string, string>).message ?? 'Unknown error'}`,
    reference: `REFUND-${flwReference}`,
    metadata: { withdrawal_id: withdrawalId, flw_response: flwResponse },
  });

  // Mark withdrawal as failed
  await supabase
    .from('withdrawals')
    .update({
      status: 'failed',
      flw_reference: flwReference,
      failure_reason: (flwResponse as Record<string, string>).message ?? 'Flutterwave transfer failed',
      processed_at: new Date().toISOString(),
    })
    .eq('id', withdrawalId);

  return NextResponse.json(
    { error: 'Transfer failed. User balance has been refunded.', details: flwResponse },
    { status: 502 }
  );
}
