'use client';
// components/markets/MarketCard.tsx

import Link from 'next/link';
import type { Market } from '@/types';
import { formatNGN, priceToPercent } from '@/lib/banks';
import { Clock, Users, TrendingUp } from 'lucide-react';

interface MarketCardProps {
  market: Market;
  index?: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  sports: 'Sports',
  entertainment: 'Entertainment',
  politics: 'Politics',
  finance: 'Finance',
  other: 'Other',
};

function timeUntil(deadline: string): string {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return 'Ended';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h left`;
  const mins = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

export default function MarketCard({ market, index = 0 }: MarketCardProps) {
  const yesPercent = Math.round(market.yes_price * 100);
  const noPercent  = Math.round(market.no_price * 100);
  const deadline   = timeUntil(market.resolution_deadline);
  const isExpiring = new Date(market.resolution_deadline).getTime() - Date.now() < 86400000;

  return (
    <Link href={`/market/${market.id}`}>
      <div
        className="market-card animate-card surface rounded-2xl overflow-hidden cursor-pointer"
        style={{ animationDelay: `${index * 0.05}s` }}
      >
        {/* Market image */}
        {market.image_url && (
          <div className="relative h-36 overflow-hidden">
            <img
              src={market.image_url}
              alt={market.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#12121f] via-transparent to-transparent" />
            {/* Live indicator */}
            {market.status === 'open' && (
              <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-[#0a0a0f]/80 px-2 py-1 rounded-full">
                <div className="live-dot" />
                <span className="text-xs text-accent font-display font-700">LIVE</span>
              </div>
            )}
            {/* Category badge */}
            <div className={`absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-600 badge-${market.category}`}>
              {CATEGORY_LABELS[market.category]}
            </div>
          </div>
        )}

        <div className="p-4">
          {/* Title */}
          <h3 className="font-display font-700 text-sm leading-snug mb-3 line-clamp-2">
            {market.title}
          </h3>

          {/* Probability bar */}
          <div className="mb-3">
            <div className="prob-bar">
              <div
                className="prob-fill-yes"
                style={{ width: `${yesPercent}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5">
              <div className="flex items-center gap-1">
                <span className="text-xs text-[#00d4aa] font-700">YES</span>
                <span className="text-xs text-[#00d4aa] font-display font-700">{priceToPercent(market.yes_price)}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-[#ff4d6d] font-700">NO</span>
                <span className="text-xs text-[#ff4d6d] font-display font-700">{priceToPercent(market.no_price)}</span>
              </div>
            </div>
          </div>

          {/* Footer stats */}
          <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-[#2d2d4e]">
            <div className="flex items-center gap-1">
              <TrendingUp size={11} />
              <span>{formatNGN(market.total_pool)}</span>
            </div>
            <div className={`flex items-center gap-1 ${isExpiring ? 'text-warning' : ''}`}>
              <Clock size={11} />
              <span>{deadline}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
