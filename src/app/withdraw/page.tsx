'use client';
// app/withdraw/page.tsx
// User withdrawal page. Immediately deducts balance on submission
// and creates a pending withdrawal record for admin approval.

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Navbar from '@/components/layout/Navbar';
import { NIGERIAN_BANKS, formatNGN, isValidNUBAN } from '@/lib/banks';
import type { Profile, Withdrawal } from '@/types';
import toast from 'react-hot-toast';
import { ArrowDownLeft, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  pending:    { label: 'Pending', color: 'text-warning', Icon: Clock },
  processing: { label: 'Processing', color: 'text-blue-400', Icon: AlertCircle },
  completed:  { label: 'Completed', color: 'text-[#00d4aa]', Icon: CheckCircle },
  failed:     { label: 'Failed', color: 'text-[#ff4d6d]', Icon: XCircle },
  refunded:   { label: 'Refunded', color: 'text-gray-400', Icon: AlertCircle },
};

export default function WithdrawPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [amount, setAmount] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { window.location.href = '/auth/login'; return; }

    const [{ data: prof }, { data: wds }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('withdrawals').select('*').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(20),
    ]);
    setProfile(prof);
    setWithdrawals(wds ?? []);
  };

  useEffect(() => { fetchData(); }, []);

  const amountNum = Number(amount);
  const isFormValid =
    amountNum >= 1000 &&
    amountNum <= (profile?.balance ?? 0) &&
    bankCode !== '' &&
    isValidNUBAN(accountNumber);

  const handleWithdraw = async () => {
    if (!profile || !isFormValid) return;
    setLoading(true);
    try {
      const res = await fetch('/api/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountNum, bankCode, accountNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Withdrawal failed');

      toast.success('Withdrawal request submitted! Processing within 24 hours.');
      setAmount('');
      setBankCode('');
      setAccountNumber('');
      await fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Withdrawal failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#ff4d6d]/10 border border-[#ff4d6d]/30
                          flex items-center justify-center mx-auto mb-4">
            <ArrowDownLeft size={24} className="text-[#ff4d6d]" />
          </div>
          <h1 className="font-display font-800 text-3xl mb-2">Withdraw Funds</h1>
          <p className="text-gray-400 text-sm">Send Naira directly to your Nigerian bank account</p>
        </div>

        {/* Balance */}
        {profile && (
          <div className="surface rounded-2xl p-5 mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Available Balance</p>
              <p className="font-display font-800 text-2xl text-accent">{formatNGN(profile.balance)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-600">Min withdrawal</p>
              <p className="text-sm font-700 text-gray-400">₦1,000</p>
            </div>
          </div>
        )}

        {/* Withdrawal form */}
        <div className="surface rounded-2xl p-6 space-y-4 mb-8">
          {/* Amount */}
          <div>
            <label className="block text-sm font-600 mb-1.5">Withdrawal Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-display font-700 text-gray-400 text-lg">₦</span>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                min="1000"
                max={profile?.balance ?? 0}
                className="input-field pl-9 font-display font-700 text-xl py-4"
              />
            </div>
            {amountNum > 0 && amountNum < 1000 && (
              <p className="text-xs text-danger mt-1">Minimum withdrawal is ₦1,000</p>
            )}
            {amountNum > (profile?.balance ?? 0) && (
              <p className="text-xs text-danger mt-1">Amount exceeds your balance</p>
            )}
          </div>

          {/* Bank selection */}
          <div>
            <label className="block text-sm font-600 mb-1.5">Bank</label>
            <select
              value={bankCode}
              onChange={e => setBankCode(e.target.value)}
              className="input-field"
            >
              <option value="">Select your bank…</option>
              {NIGERIAN_BANKS.map(bank => (
                <option key={bank.code} value={bank.code}>{bank.name}</option>
              ))}
            </select>
          </div>

          {/* Account number */}
          <div>
            <label className="block text-sm font-600 mb-1.5">Account Number</label>
            <input
              type="text"
              value={accountNumber}
              onChange={e => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="0123456789"
              maxLength={10}
              className="input-field font-display font-700 tracking-widest text-lg"
            />
            {accountNumber.length > 0 && accountNumber.length < 10 && (
              <p className="text-xs text-warning mt-1">
                Account number must be exactly 10 digits ({accountNumber.length}/10)
              </p>
            )}
          </div>

          {/* Warning */}
          <div className="bg-warning/10 border border-warning/20 rounded-xl p-3 text-xs text-warning/80">
            ⚠️ Your balance will be deducted immediately. Funds reach your bank within 24 hours after admin approval.
          </div>

          <button
            onClick={handleWithdraw}
            disabled={loading || !isFormValid}
            className="w-full py-4 rounded-xl font-display font-700 bg-[#ff4d6d] text-white
                       hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Submitting…
              </span>
            ) : (
              `Request Withdrawal${amountNum >= 1000 ? ` of ${formatNGN(amountNum)}` : ''}`
            )}
          </button>
        </div>

        {/* Withdrawal history */}
        {withdrawals.length > 0 && (
          <div>
            <h2 className="font-display font-700 text-base mb-3">Withdrawal History</h2>
            <div className="space-y-2">
              {withdrawals.map(wd => {
                const cfg = STATUS_CONFIG[wd.status] ?? STATUS_CONFIG.pending;
                const StatusIcon = cfg.Icon;
                return (
                  <div key={wd.id} className="surface rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <StatusIcon size={16} className={cfg.color} />
                      <div>
                        <p className="text-sm font-600">{wd.bank_name}</p>
                        <p className="text-xs text-gray-500">****{wd.account_number.slice(-4)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-display font-700 text-sm">{formatNGN(wd.amount)}</p>
                      <p className={`text-xs ${cfg.color}`}>{cfg.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
