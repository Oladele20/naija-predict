// app/profile/page.tsx
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import { formatNGN } from '@/lib/banks';
import type { Position, Transaction } from '@/types';
import { TrendingUp, TrendingDown, Clock, CheckCircle } from 'lucide-react';
import Link from 'next/link';

export default async function ProfilePage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const [{ data: profile }, { data: positions }, { data: transactions }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('positions').select('*, markets(id, title, status, outcome, yes_price, no_price)')
      .eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('transactions').select('*')
      .eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
  ]);

  // Portfolio P&L calculation
  const openPositions = (positions ?? []).filter(
    (p: Position & { markets: { status: string } | null }) => p.markets?.status === 'open'
  );
  const totalInvested = (positions ?? []).reduce(
    (sum: number, p: Position) => sum + Number(p.total_cost), 0
  );
  const totalPayouts = (positions ?? []).reduce(
    (sum: number, p: Position) => sum + Number(p.payout ?? 0), 0
  );

  const TX_TYPE_LABELS: Record<string, { label: string; color: string }> = {
    deposit:     { label: 'Deposit', color: 'text-[#00d4aa]' },
    buy_shares:  { label: 'Bought Shares', color: 'text-[#ff4d6d]' },
    sell_shares: { label: 'Sold Shares', color: 'text-[#00d4aa]' },
    payout:      { label: 'Winnings', color: 'text-[#00d4aa]' },
    refund:      { label: 'Refund', color: 'text-[#00d4aa]' },
    withdrawal:  { label: 'Withdrawal', color: 'text-[#ff4d6d]' },
    fee:         { label: 'Fee', color: 'text-gray-500' },
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Profile header */}
        <div className="surface rounded-2xl p-6 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[#00d4aa] flex items-center justify-center
                          font-display font-800 text-2xl text-[#0a0a0f]">
            {profile?.full_name?.charAt(0).toUpperCase() ?? profile?.email?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="font-display font-800 text-2xl">{profile?.full_name ?? 'Trader'}</h1>
            <p className="text-sm text-gray-500">{profile?.email}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500 mb-0.5">Wallet Balance</p>
            <p className="font-display font-800 text-3xl text-accent">
              {formatNGN(profile?.balance ?? 0)}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          {[
            { label: 'Total Invested', value: formatNGN(totalInvested), color: '' },
            { label: 'Total Winnings', value: formatNGN(totalPayouts), color: 'text-[#00d4aa]' },
            { label: 'Open Positions', value: openPositions.length, color: '' },
            { label: 'Net P&L', value: formatNGN(totalPayouts - totalInvested), color: totalPayouts >= totalInvested ? 'text-[#00d4aa]' : 'text-[#ff4d6d]' },
          ].map(({ label, value, color }) => (
            <div key={label} className="surface rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className={`font-display font-700 text-xl ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Positions */}
          <div>
            <h2 className="font-display font-700 text-base mb-3">My Positions</h2>
            <div className="space-y-2">
              {(positions ?? []).length === 0 ? (
                <div className="surface rounded-xl p-8 text-center text-gray-600">
                  <TrendingUp size={32} className="mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No positions yet</p>
                  <Link href="/dashboard" className="text-xs text-accent hover:underline mt-1 block">
                    Browse markets →
                  </Link>
                </div>
              ) : (positions ?? []).map((pos: Position & { markets: { id: string; title: string; status: string; outcome: string | null; yes_price: number; no_price: number } | null }) => {
                const isResolved = pos.markets?.status === 'resolved';
                const won = isResolved && pos.markets?.outcome === pos.side;
                const currentPrice = pos.side === 'yes' ? pos.markets?.yes_price : pos.markets?.no_price;
                const currentValue = (currentPrice ?? 0) * Number(pos.shares);

                return (
                  <Link key={pos.id} href={`/market/${pos.markets?.id}`}>
                    <div className="surface rounded-xl p-4 hover:border-[#3d3d6e] transition-all cursor-pointer">
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-sm font-600 line-clamp-1 flex-1 pr-2">
                          {pos.markets?.title}
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isResolved ? (
                            won
                              ? <CheckCircle size={12} className="text-[#00d4aa]" />
                              : <TrendingDown size={12} className="text-[#ff4d6d]" />
                          ) : (
                            <Clock size={12} className="text-warning" />
                          )}
                          <span className={`text-xs font-700 font-display
                            ${pos.side === 'yes' ? 'text-[#00d4aa]' : 'text-[#ff4d6d]'}`}>
                            {pos.side.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{Number(pos.shares).toFixed(2)} shares @ {formatNGN(pos.avg_price)}</span>
                        <span className={won ? 'text-[#00d4aa]' : ''}>
                          {pos.payout != null ? `Payout: ${formatNGN(pos.payout)}` : `Value: ${formatNGN(currentValue)}`}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Transaction history */}
          <div>
            <h2 className="font-display font-700 text-base mb-3">Transaction History</h2>
            <div className="surface rounded-2xl overflow-hidden">
              {(transactions ?? []).length === 0 ? (
                <div className="p-8 text-center text-gray-600">
                  <p className="text-sm">No transactions yet</p>
                </div>
              ) : (
                <div className="divide-y divide-[#1a1a2e]">
                  {(transactions ?? []).map((tx: Transaction) => {
                    const cfg = TX_TYPE_LABELS[tx.type] ?? { label: tx.type, color: '' };
                    const isCredit = tx.amount > 0;
                    return (
                      <div key={tx.id} className="flex items-center justify-between p-3 hover:bg-[#0a0a0f]/50">
                        <div>
                          <p className="text-xs font-600">{cfg.label}</p>
                          <p className="text-xs text-gray-600 truncate max-w-[200px]">
                            {tx.description}
                          </p>
                          <p className="text-xs text-gray-700">
                            {new Date(tx.created_at).toLocaleDateString('en-NG', {
                              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                            })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`font-display font-700 text-sm ${isCredit ? 'text-[#00d4aa]' : 'text-[#ff4d6d]'}`}>
                            {isCredit ? '+' : ''}{formatNGN(tx.amount)}
                          </p>
                          <p className="text-xs text-gray-600">Bal: {formatNGN(tx.balance_after)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
