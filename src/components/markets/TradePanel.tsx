'use client';
// components/markets/TradePanel.tsx

import { useState } from 'react';
import toast from 'react-hot-toast';
import { formatNGN, priceToPercent } from '@/lib/banks';
import { MIN_TRADE_NGN } from '@/lib/market-engine';
import type { Market, Profile } from '@/types';
import { TrendingUp, TrendingDown, Info } from 'lucide-react';

interface TradePanelProps {
  market: Market;
  profile: Profile | null;
  onTradeComplete: () => void;
}

export default function TradePanel({ market, profile, onTradeComplete }: TradePanelProps) {
  const [side, setSide] = useState<'yes' | 'no'>('yes');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const amountNum = Number(amount);
  const price = side === 'yes' ? market.yes_price : market.no_price;
  const estimatedShares = amountNum > 0 ? (amountNum / price).toFixed(2) : '0';
  const potentialPayout = amountNum > 0 ? (amountNum / price) * 1 : 0; // 1 NGN per share if correct

  const QUICK_AMOUNTS = [500, 1000, 5000, 10000];

  const handleBuy = async () => {
    if (!profile) { toast.error('Please sign in to trade'); return; }
    if (!amountNum || amountNum < MIN_TRADE_NGN) {
      toast.error(`Minimum trade is ${formatNGN(MIN_TRADE_NGN)}`);
      return;
    }
    if (amountNum > profile.balance) {
      toast.error('Insufficient balance — please deposit funds');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/markets/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketId: market.id, side, amountNGN: amountNum }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error ?? 'Trade failed');

      toast.success(`✅ Bought ${data.sharesGranted.toFixed(2)} ${side.toUpperCase()} shares!`);
      setAmount('');
      onTradeComplete();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Trade failed');
    } finally {
      setLoading(false);
    }
  };

  const isOpen = market.status === 'open';

  return (
    <div className="surface rounded-2xl p-5 space-y-4">
      <h3 className="font-display font-700 text-base">Place a Trade</h3>

      {!isOpen && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 text-sm text-warning">
          This market is {market.status} — trading is disabled.
        </div>
      )}

      {/* Side selector */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setSide('yes')}
          disabled={!isOpen}
          className={`p-3 rounded-xl border-2 transition-all font-display font-700 text-sm flex items-center justify-center gap-2
            ${side === 'yes'
              ? 'border-[#00d4aa] bg-[#00d4aa]/15 text-[#00d4aa]'
              : 'border-[#2d2d4e] text-gray-400 hover:border-[#3d3d6e]'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <TrendingUp size={14} />
          YES · {priceToPercent(market.yes_price)}
        </button>
        <button
          onClick={() => setSide('no')}
          disabled={!isOpen}
          className={`p-3 rounded-xl border-2 transition-all font-display font-700 text-sm flex items-center justify-center gap-2
            ${side === 'no'
              ? 'border-[#ff4d6d] bg-[#ff4d6d]/15 text-[#ff4d6d]'
              : 'border-[#2d2d4e] text-gray-400 hover:border-[#3d3d6e]'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <TrendingDown size={14} />
          NO · {priceToPercent(market.no_price)}
        </button>
      </div>

      {/* Amount input */}
      <div>
        <label className="block text-xs text-gray-500 mb-1.5">Amount (₦)</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-display font-700">₦</span>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0"
            disabled={!isOpen}
            className="input-field pl-8 font-display font-700 text-lg disabled:opacity-40"
          />
        </div>

        {/* Quick amount buttons */}
        <div className="grid grid-cols-4 gap-1.5 mt-2">
          {QUICK_AMOUNTS.map(q => (
            <button
              key={q}
              onClick={() => setAmount(String(q))}
              disabled={!isOpen}
              className="text-xs py-1.5 rounded-lg bg-[#1a1a2e] text-gray-400 hover:text-white hover:bg-[#2d2d4e] transition-all disabled:opacity-40"
            >
              ₦{q >= 1000 ? `${q / 1000}k` : q}
            </button>
          ))}
        </div>
      </div>

      {/* Trade estimate */}
      {amountNum > 0 && (
        <div className="surface-2 rounded-xl p-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Estimated shares</span>
            <span className="font-display font-700">{estimatedShares}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Price per share</span>
            <span className="font-display font-700">{formatNGN(price)}</span>
          </div>
          <div className="flex justify-between border-t border-[#2d2d4e] pt-2">
            <span className="text-gray-400 flex items-center gap-1">
              <Info size={11} /> If correct
            </span>
            <span className={`font-display font-700 ${side === 'yes' ? 'text-[#00d4aa]' : 'text-[#ff4d6d]'}`}>
              {formatNGN(potentialPayout * 0.98)}
            </span>
          </div>
        </div>
      )}

      {/* Balance display */}
      {profile && (
        <p className="text-xs text-gray-600 text-right">
          Balance: <span className="text-gray-400">{formatNGN(profile.balance)}</span>
        </p>
      )}

      {/* CTA */}
      <button
        onClick={handleBuy}
        disabled={!isOpen || loading || !amountNum || amountNum < MIN_TRADE_NGN}
        className={`w-full py-3 rounded-xl font-display font-700 text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed
          ${side === 'yes'
            ? 'bg-[#00d4aa] text-[#0a0a0f] hover:brightness-110'
            : 'bg-[#ff4d6d] text-white hover:brightness-110'
          }`}
      >
        {loading ? 'Processing…' : `Buy ${side.toUpperCase()} for ${amountNum > 0 ? formatNGN(amountNum) : '—'}`}
      </button>

      {!profile && (
        <a href="/auth/login" className="block text-center text-xs text-accent hover:underline">
          Sign in to trade
        </a>
      )}
    </div>
  );
}
