// app/market/[id]/page.tsx
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import TradePanel from '@/components/markets/TradePanel';
import MarketDetailClient from './MarketDetailClient';
import { formatNGN, priceToPercent } from '@/lib/banks';
import type { Market, Profile, Position } from '@/types';
import { Clock, Users, Tag, CheckCircle, AlertCircle } from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MarketPage({ params }: PageProps) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { id } = await params;

  const [{ data: market }, { data: profile }, { data: position }] = await Promise.all([
    supabase.from('markets').select('*').eq('id', id).single(),
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('positions').select('*').eq('market_id', id).eq('user_id', user.id).maybeSingle(),
  ]);

  if (!market) notFound();

  const yesPercent = Math.round(market.yes_price * 100);
  const isResolved = market.status === 'resolved';

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left: Market info */}
          <div className="lg:col-span-2 space-y-5">
            {/* Header card */}
            <div className="surface rounded-2xl overflow-hidden">
              {market.image_url && (
                <div className="h-48 relative">
                  <img src={market.image_url} alt={market.title}
                    className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#12121f] via-[#12121f]/40 to-transparent" />
                </div>
              )}
              <div className="p-6">
                {/* Status badge */}
                <div className="flex items-center gap-2 mb-3">
                  {market.status === 'open' && (
                    <span className="flex items-center gap-1.5 text-xs text-accent font-display font-700">
                      <div className="live-dot" /> LIVE
                    </span>
                  )}
                  {isResolved && (
                    <span className={`flex items-center gap-1 text-xs font-700 font-display
                      ${market.outcome === 'yes' ? 'text-[#00d4aa]' : 'text-[#ff4d6d]'}`}>
                      <CheckCircle size={12} />
                      RESOLVED: {market.outcome?.toUpperCase()}
                    </span>
                  )}
                  {market.status === 'disputed' && (
                    <span className="flex items-center gap-1 text-xs text-warning font-700">
                      <AlertCircle size={12} /> Under Review
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-xs badge-${market.category}`}>
                    {market.category}
                  </span>
                </div>

                <h1 className="font-display font-800 text-2xl leading-tight mb-3">
                  {market.title}
                </h1>
                {market.description && (
                  <p className="text-gray-400 text-sm leading-relaxed">{market.description}</p>
                )}

                {/* Tags */}
                {market.tags && market.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {market.tags.map((tag: string) => (
                      <span key={tag}
                        className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1a1a2e] text-xs text-gray-400">
                        <Tag size={9} /> {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Price gauge */}
            <div className="surface rounded-2xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-display font-700 text-base">Current Probabilities</h2>
                <span className="text-xs text-gray-600">Prices update with each trade</span>
              </div>

              {/* Big probability display */}
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div className="surface-2 rounded-xl p-4 border-l-4 border-[#00d4aa]">
                  <p className="text-xs text-gray-500 mb-1">YES</p>
                  <p className="font-display font-800 text-3xl text-[#00d4aa]">
                    {priceToPercent(market.yes_price)}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">{formatNGN(market.yes_price)} / share</p>
                </div>
                <div className="surface-2 rounded-xl p-4 border-l-4 border-[#ff4d6d]">
                  <p className="text-xs text-gray-500 mb-1">NO</p>
                  <p className="font-display font-800 text-3xl text-[#ff4d6d]">
                    {priceToPercent(market.no_price)}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">{formatNGN(market.no_price)} / share</p>
                </div>
              </div>

              {/* Stacked bar */}
              <div className="h-3 rounded-full overflow-hidden flex">
                <div className="bg-[#00d4aa] transition-all duration-700"
                  style={{ width: `${yesPercent}%` }} />
                <div className="bg-[#ff4d6d] flex-1" />
              </div>
            </div>

            {/* Market stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Total Pool', value: formatNGN(market.total_pool), Icon: Users },
                { label: 'YES Shares', value: market.yes_shares.toFixed(0), Icon: Users },
                { label: 'NO Shares', value: market.no_shares.toFixed(0), Icon: Users },
              ].map(({ label, value, Icon }) => (
                <div key={label} className="surface rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-1">{label}</p>
                  <p className="font-display font-700 text-lg">{value}</p>
                </div>
              ))}
            </div>

            {/* Your position */}
            {position && (
              <div className="surface rounded-2xl p-5">
                <h3 className="font-display font-700 text-base mb-3">Your Position</h3>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Side</p>
                    <p className={`font-display font-700 ${position.side === 'yes' ? 'text-[#00d4aa]' : 'text-[#ff4d6d]'}`}>
                      {position.side.toUpperCase()}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Shares</p>
                    <p className="font-display font-700">{Number(position.shares).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Avg Price</p>
                    <p className="font-display font-700">{formatNGN(position.avg_price)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Total Spent</p>
                    <p className="font-display font-700">{formatNGN(position.total_cost)}</p>
                  </div>
                  {position.payout != null && (
                    <div>
                      <p className="text-gray-500 text-xs mb-1">Payout</p>
                      <p className="font-display font-700 text-[#00d4aa]">{formatNGN(position.payout)}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right: Trade panel */}
          <div className="space-y-4">
            {/* Deadline card */}
            <div className="surface rounded-2xl p-4">
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Clock size={14} className="text-warning" />
                <span>Resolves: </span>
                <span className="font-display font-700 text-white text-xs">
                  {new Date(market.resolution_deadline).toLocaleDateString('en-NG', {
                    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                  })}
                </span>
              </div>
            </div>

            {/* Trade panel — client component for real-time updates */}
            <MarketDetailClient market={market} profile={profile} />
          </div>
        </div>
      </main>
    </div>
  );
}
