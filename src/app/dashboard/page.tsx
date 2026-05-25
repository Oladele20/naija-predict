// app/dashboard/page.tsx
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import MarketCard from '@/components/markets/MarketCard';
import type { Market, MarketCategory } from '@/types';
import { Search, Flame, Trophy, Mic2, Landmark, BarChart2 } from 'lucide-react';

const CATEGORIES: { key: string; label: string; Icon: React.ElementType }[] = [
  { key: 'all', label: 'All Markets', Icon: Flame },
  { key: 'sports', label: 'Sports', Icon: Trophy },
  { key: 'entertainment', label: 'Entertainment', Icon: Mic2 },
  { key: 'politics', label: 'Politics', Icon: Landmark },
  { key: 'finance', label: 'Finance', Icon: BarChart2 },
];

interface PageProps {
  searchParams: Promise<{ category?: string; q?: string }>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const supabase = await createServerSupabaseClient();

  // Auth guard
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const params = await searchParams;
  const activeCategory = params.category ?? 'all';
  const searchQuery = params.q ?? '';

  // Fetch markets
  let query = supabase
    .from('markets')
    .select('*')
    .in('status', ['open', 'closed', 'resolved'])
    .order('created_at', { ascending: false });

  if (activeCategory !== 'all') {
    query = query.eq('category', activeCategory as MarketCategory);
  }
  if (searchQuery) {
    query = query.ilike('title', `%${searchQuery}%`);
  }

  const { data: markets } = await query;
  const openMarkets = (markets ?? []).filter((m: Market) => m.status === 'open');
  const otherMarkets = (markets ?? []).filter((m: Market) => m.status !== 'open');

  // Stats
  const totalPool = (markets ?? []).reduce((sum: number, m: Market) => sum + Number(m.total_pool), 0);

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero header */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-3">
            <div className="live-dot" />
            <span className="text-xs text-accent font-display font-700 tracking-widest uppercase">
              Live Markets
            </span>
          </div>
          <h1 className="font-display font-800 text-4xl sm:text-5xl tracking-tight mb-2">
            Predict. Trade. Win.<br />
            <span className="text-accent">In Naira.</span>
          </h1>
          <p className="text-gray-400 text-base max-w-xl">
            Buy YES or NO shares on Nigerian sports, politics, and entertainment events.
            Prices move with demand — trade smart.
          </p>

          {/* Quick stats */}
          <div className="flex flex-wrap gap-6 mt-6 text-sm">
            <div>
              <span className="text-gray-600">Active Markets</span>
              <p className="font-display font-700 text-xl text-white">{openMarkets.length}</p>
            </div>
            <div className="w-px bg-[#2d2d4e]" />
            <div>
              <span className="text-gray-600">Total Pool</span>
              <p className="font-display font-700 text-xl text-accent">
                ₦{(totalPool / 1000).toFixed(0)}k+
              </p>
            </div>
          </div>
        </div>

        {/* Search + Filter bar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          {/* Search */}
          <form className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              name="q"
              defaultValue={searchQuery}
              placeholder="Search markets…"
              className="input-field pl-9 text-sm"
            />
            <input type="hidden" name="category" value={activeCategory} />
          </form>

          {/* Category tabs */}
          <div className="flex gap-1 overflow-x-auto pb-1 sm:pb-0">
            {CATEGORIES.map(({ key, label, Icon }) => (
              <a
                key={key}
                href={`/dashboard?category=${key}${searchQuery ? `&q=${searchQuery}` : ''}`}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-600 whitespace-nowrap transition-all
                  ${activeCategory === key
                    ? 'bg-[#1a1a2e] text-accent border border-[#00d4aa]/30'
                    : 'text-gray-400 hover:text-white hover:bg-[#1a1a2e] border border-transparent'
                  }`}
              >
                <Icon size={12} />
                {label}
              </a>
            ))}
          </div>
        </div>

        {/* Open markets grid */}
        {openMarkets.length > 0 && (
          <section className="mb-12">
            <h2 className="font-display font-700 text-lg mb-4 flex items-center gap-2">
              <div className="live-dot" />
              Open for Trading
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {openMarkets.map((market: Market, i: number) => (
                <MarketCard key={market.id} market={market} index={i} />
              ))}
            </div>
          </section>
        )}

        {/* Resolved/closed markets */}
        {otherMarkets.length > 0 && (
          <section>
            <h2 className="font-display font-700 text-lg mb-4 text-gray-500">Past Markets</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 opacity-60">
              {otherMarkets.map((market: Market, i: number) => (
                <MarketCard key={market.id} market={market} index={i} />
              ))}
            </div>
          </section>
        )}

        {(markets ?? []).length === 0 && (
          <div className="text-center py-24 text-gray-600">
            <BarChart2 size={48} className="mx-auto mb-4 opacity-30" />
            <p className="font-display font-700 text-xl">No markets found</p>
            <p className="text-sm mt-1">Try a different category or search term</p>
          </div>
        )}
      </main>
    </div>
  );
}
