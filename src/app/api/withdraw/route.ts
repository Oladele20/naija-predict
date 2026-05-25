// ============================================================
// app/api/withdraw/route.ts
// Creates a withdrawal request. Immediately deducts balance
// to prevent double-spending, then creates a pending record.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { isValidNUBAN, NIGERIAN_BANKS } from '@/lib/banks';

const MIN_WITHDRAWAL = 1000;   // ₦1,000
const MAX_WITHDRAWAL = 5000000; // ₦5,000,000

export async function POST(req: NextRequest) {
  // ── 1. Authenticate user ─────────────────────────────────────
  const authSupabase = await createServerSupabaseClient();
  const { data: { user }, error: authErr } = await authSupabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // ── 2. Parse & validate request body ─────────────────────────
  const body = await req.json();
  const { amount, bankCode, accountNumber } = body;

  if (!amount || !bankCode || !accountNumber) {
    return NextResponse.json({ error: 'amount, bankCode, and accountNumber are required' }, { status: 400 });
  }

  const amountNum = Number(amount);
  if (isNaN(amountNum) || amountNum < MIN_WITHDRAWAL || amountNum > MAX_WITHDRAWAL) {
    return NextResponse.json(
      { error: `Amount must be between ₦${MIN_WITHDRAWAL.toLocaleString()} and ₦${MAX_WITHDRAWAL.toLocaleString()}` },
      { status: 400 }
    );
  }

  if (!isValidNUBAN(accountNumber)) {
    return NextResponse.json({ error: 'Account number must be exactly 10 digits' }, { status: 400 });
  }

  const bank = NIGERIAN_BANKS.find(b => b.code === bankCode);
  if (!bank) {
    return NextResponse.json({ error: 'Invalid bank code' }, { status: 400 });
  }

  const supabase = createAdminSupabaseClient();

  // ── 3. Check user balance ─────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles').select('balance').eq('id', user.id).single();

  if (!profile || Number(profile.balance) < amountNum) {
    return NextResponse.json({ error: 'Insufficient balance' }, { status: 402 });
  }

  // ── 4. Immediately deduct balance (prevents double-spending) ──
  const newBalance = Number(profile.balance) - amountNum;
  await supabase.from('profiles').update({ balance: newBalance }).eq('id', user.id);

  // ── 5. Create withdrawal record ───────────────────────────────
  const { data: withdrawal, error: insertErr } = await supabase
    .from('withdrawals')
    .insert({
      user_id: user.id,
      amount: amountNum,
      bank_code: bankCode,
      bank_name: bank.name,
      account_number: accountNumber,
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertErr || !withdrawal) {
    // Rollback balance deduction if withdrawal creation fails
    await supabase.from('profiles').update({ balance: profile.balance }).eq('id', user.id);
    return NextResponse.json({ error: 'Failed to create withdrawal request' }, { status: 500 });
  }

  // ── 6. Record debit transaction in ledger ─────────────────────
  await supabase.from('transactions').insert({
    user_id: user.id,
    type: 'withdrawal',
    amount: -amountNum,
    balance_after: newBalance,
    description: `Withdrawal request to ${bank.name} ****${accountNumber.slice(-4)}`,
    reference: `WD-${withdrawal.id}`,
    metadata: { withdrawal_id: withdrawal.id, bank_code: bankCode, bank_name: bank.name },
  });

  return NextResponse.json({
    success: true,
    withdrawalId: withdrawal.id,
    newBalance,
    message: 'Withdrawal request submitted. Processing within 24 hours.',
  });
}
