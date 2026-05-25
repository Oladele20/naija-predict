'use client';
// app/deposit/page.tsx
// Generates a Flutterwave payment link with a unique tx_ref
// containing the user's ID so the webhook can credit them.

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Navbar from '@/components/layout/Navbar';
import { generateTxRef, formatNGN } from '@/lib/banks';
import type { Profile } from '@/types';
import { Wallet, Shield, Zap, ChevronRight, ArrowUpRight } from 'lucide-react';
import toast from 'react-hot-toast';

const QUICK_AMOUNTS = [1000, 2500, 5000, 10000, 25000, 50000];

export default function DepositPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.href = '/auth/login'; return; }
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(data);
    };
    fetchProfile();
  }, []);

  const handleDeposit = () => {
    if (!profile) { toast.error('Please sign in'); return; }
    const amountNum = Number(amount);
    if (!amountNum || amountNum < 100) {
      toast.error('Minimum deposit is ₦100'); return;
    }

    setLoading(true);

    // Generate a unique tx_ref that embeds the user's ID
    // The webhook handler at /api/webhooks/flutterwave extracts this to credit the right account
    const txRef = generateTxRef(profile.id);

    // Build the Flutterwave inline payment config
    const flwConfig = {
      public_key: process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY!,
      tx_ref: txRef,
      amount: amountNum,
      currency: 'NGN',
      payment_options: 'card, banktransfer, ussd, mobilemoney',
      customer: {
        email: profile.email,
        name: profile.full_name ?? profile.email,
      },
      customizations: {
        title: 'NaijaPredict Deposit',
        description: `Fund your NaijaPredict wallet`,
        logo: `${window.location.origin}/logo.png`,
      },
      callback: (response: { status: string }) => {
        if (response.status === 'successful') {
          toast.success('Payment successful! Your balance will update shortly.');
          // Flutterwave will call our webhook — balance updates automatically
        } else {
          toast.error('Payment was not successful. Please try again.');
        }
        setLoading(false);
      },
      onclose: () => { setLoading(false); },
    };

    // Load Flutterwave inline SDK dynamically
    if ((window as unknown as Record<string, unknown>).FlutterwaveCheckout) {
      (window as unknown as Record<string, (config: unknown) => void>).FlutterwaveCheckout(flwConfig);
    } else {
      const script = document.createElement('script');
      script.src = 'https://checkout.flutterwave.com/v3.js';
      script.onload = () => {
        (window as unknown as Record<string, (config: unknown) => void>).FlutterwaveCheckout(flwConfig);
      };
      script.onerror = () => {
        toast.error('Could not load payment gateway. Check your connection.');
        setLoading(false);
      };
      document.body.appendChild(script);
    }
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-lg mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#00d4aa]/15 border border-[#00d4aa]/30
                          flex items-center justify-center mx-auto mb-4">
            <Wallet size={24} className="text-accent" />
          </div>
          <h1 className="font-display font-800 text-3xl mb-2">Add Funds</h1>
          <p className="text-gray-400 text-sm">Deposit Naira to your NaijaPredict wallet instantly</p>
        </div>

        {/* Current balance */}
        {profile && (
          <div className="surface rounded-2xl p-5 mb-6 text-center">
            <p className="text-xs text-gray-500 mb-1">Current Balance</p>
            <p className="font-display font-800 text-3xl text-accent">{formatNGN(profile.balance)}</p>
          </div>
        )}

        {/* Deposit form */}
        <div className="surface rounded-2xl p-6 space-y-5">
          <div>
            <label className="block text-sm font-600 mb-2">Amount to deposit</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-display font-700 text-gray-400 text-lg">₦</span>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                min="100"
                className="input-field pl-9 font-display font-700 text-xl py-4"
              />
            </div>
          </div>

          {/* Quick select */}
          <div>
            <p className="text-xs text-gray-500 mb-2">Quick select</p>
            <div className="grid grid-cols-3 gap-2">
              {QUICK_AMOUNTS.map(q => (
                <button
                  key={q}
                  onClick={() => setAmount(String(q))}
                  className={`py-2.5 rounded-xl text-sm font-display font-700 transition-all border
                    ${amount === String(q)
                      ? 'border-accent text-accent bg-[#00d4aa]/10'
                      : 'border-[#2d2d4e] text-gray-400 hover:border-[#3d3d6e] hover:text-white'
                    }`}
                >
                  ₦{q.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={handleDeposit}
            disabled={loading || !amount || Number(amount) < 100}
            className="btn-primary w-full py-4 flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-[#0a0a0f]/30 border-t-[#0a0a0f] rounded-full animate-spin" />
                Loading payment…
              </span>
            ) : (
              <>
                Pay {amount ? formatNGN(Number(amount)) : ''}
                <ArrowUpRight size={16} />
              </>
            )}
          </button>
        </div>

        {/* Trust badges */}
        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          {[
            { Icon: Shield, label: 'Secure', sub: 'SSL encrypted' },
            { Icon: Zap, label: 'Instant', sub: 'Auto-credited' },
            { Icon: Wallet, label: 'Safe', sub: 'Naira only' },
          ].map(({ Icon, label, sub }) => (
            <div key={label} className="surface rounded-xl p-3">
              <Icon size={16} className="text-accent mx-auto mb-1" />
              <p className="text-xs font-700 font-display">{label}</p>
              <p className="text-xs text-gray-600">{sub}</p>
            </div>
          ))}
        </div>

        {/* How it works */}
        <div className="mt-6 surface rounded-2xl p-5">
          <h3 className="font-display font-700 text-sm mb-3">How deposits work</h3>
          {[
            'Enter your amount and click Pay',
            'Complete payment via card, bank transfer, or USSD',
            'Flutterwave notifies us instantly via webhook',
            'Your balance updates automatically — no manual action needed',
          ].map((step, i) => (
            <div key={i} className="flex items-start gap-3 mb-2 last:mb-0">
              <span className="w-5 h-5 rounded-full bg-[#1a1a2e] text-accent text-xs
                               flex items-center justify-center font-display font-700 shrink-0 mt-0.5">
                {i + 1}
              </span>
              <p className="text-sm text-gray-400">{step}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
