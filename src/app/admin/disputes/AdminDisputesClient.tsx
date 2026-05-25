'use client';
// app/admin/disputes/AdminDisputesClient.tsx
// Admin manually resolves ambiguous oracle results

import { useState } from 'react';
import toast from 'react-hot-toast';
import { formatNGN } from '@/lib/banks';
import { AlertCircle, CheckCircle, XCircle, TrendingUp, TrendingDown } from 'lucide-react';

interface Dispute {
  id: string;
  market_id: string;
  reason: string;
  oracle_data: Record<string, unknown> | null;
  status: 'open' | 'resolved';
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
  markets: {
    id: string;
    title: string;
    description: string | null;
    total_pool: number;
    yes_shares: number;
    no_shares: number;
    oracle_source: string | null;
  } | null;
}

export default function AdminDisputesClient({ initialDisputes }: { initialDisputes: Dispute[] }) {
  const [disputes, setDisputes] = useState(initialDisputes);
  const [resolving, setResolving] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const handleResolve = async (disputeId: string, marketId: string, outcome: 'yes' | 'no' | 'cancelled') => {
    setResolving(disputeId);
    const toastId = toast.loading('Resolving market…');

    try {
      // 1. Resolve the market via oracle bypass
      const resolveRes = await fetch('/api/markets/resolve-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketId, outcome, disputeId, resolution: notes[disputeId] ?? '' }),
      });
      const data = await resolveRes.json();

      if (!resolveRes.ok) throw new Error(data.error ?? 'Resolution failed');

      toast.success(`✅ Market resolved as ${outcome.toUpperCase()}`, { id: toastId });
      setDisputes(prev =>
        prev.map(d => d.id === disputeId ? { ...d, status: 'resolved', resolution: notes[disputeId] ?? outcome } : d)
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Resolution failed', { id: toastId });
    } finally {
      setResolving(null);
    }
  };

  const openDisputes = disputes.filter(d => d.status === 'open');
  const resolvedDisputes = disputes.filter(d => d.status === 'resolved');

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-[#ff4d6d]/15 border border-[#ff4d6d]/30
                        flex items-center justify-center">
          <AlertCircle size={18} className="text-[#ff4d6d]" />
        </div>
        <div>
          <h1 className="font-display font-800 text-2xl">Dispute Resolution Queue</h1>
          <p className="text-sm text-gray-500">
            Markets where the oracle returned ambiguous results — resolve manually
          </p>
        </div>
      </div>

      {/* Open disputes */}
      {openDisputes.length === 0 ? (
        <div className="surface rounded-2xl p-12 text-center text-gray-600 mb-8">
          <CheckCircle size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-display font-700">No open disputes 🎉</p>
          <p className="text-sm mt-1">All markets have been resolved automatically</p>
        </div>
      ) : (
        <div className="space-y-4 mb-8">
          <h2 className="font-display font-700 text-base text-[#ff4d6d] flex items-center gap-2">
            <AlertCircle size={14} /> Open Disputes ({openDisputes.length})
          </h2>
          {openDisputes.map(dispute => (
            <div key={dispute.id} className="surface rounded-2xl p-6 border-l-4 border-warning">
              {/* Market info */}
              <div className="mb-4">
                <h3 className="font-display font-700 text-lg mb-1">
                  {dispute.markets?.title ?? 'Unknown Market'}
                </h3>
                <p className="text-xs text-gray-500">{dispute.markets?.description}</p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="surface-2 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500">Total Pool</p>
                  <p className="font-display font-700 text-sm">{formatNGN(dispute.markets?.total_pool ?? 0)}</p>
                </div>
                <div className="surface-2 rounded-xl p-3 text-center border-l-2 border-[#00d4aa]">
                  <p className="text-xs text-gray-500">YES Shares</p>
                  <p className="font-display font-700 text-sm text-[#00d4aa]">
                    {(dispute.markets?.yes_shares ?? 0).toFixed(0)}
                  </p>
                </div>
                <div className="surface-2 rounded-xl p-3 text-center border-l-2 border-[#ff4d6d]">
                  <p className="text-xs text-gray-500">NO Shares</p>
                  <p className="font-display font-700 text-sm text-[#ff4d6d]">
                    {(dispute.markets?.no_shares ?? 0).toFixed(0)}
                  </p>
                </div>
              </div>

              {/* Oracle reason */}
              <div className="bg-warning/10 border border-warning/20 rounded-xl p-3 mb-4">
                <p className="text-xs text-warning font-700 mb-1">Oracle Report</p>
                <p className="text-sm text-gray-300">{dispute.reason}</p>
              </div>

              {/* Raw oracle data */}
              {dispute.oracle_data && (
                <details className="mb-4">
                  <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300">
                    View raw oracle data
                  </summary>
                  <pre className="text-xs text-gray-400 bg-[#0a0a0f] rounded-xl p-3 mt-2 overflow-auto max-h-40">
                    {JSON.stringify(dispute.oracle_data, null, 2)}
                  </pre>
                </details>
              )}

              {/* Admin notes */}
              <div className="mb-4">
                <label className="block text-xs text-gray-500 mb-1.5">Resolution notes (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Verified via official BBC Sport source"
                  value={notes[dispute.id] ?? ''}
                  onChange={e => setNotes(prev => ({ ...prev, [dispute.id]: e.target.value }))}
                  className="input-field text-sm"
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => handleResolve(dispute.id, dispute.market_id, 'yes')}
                  disabled={resolving === dispute.id}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#00d4aa]/15 text-[#00d4aa]
                             border border-[#00d4aa]/30 font-display font-700 text-sm hover:bg-[#00d4aa]/25
                             transition-all disabled:opacity-50"
                >
                  <TrendingUp size={14} /> Resolve YES
                </button>
                <button
                  onClick={() => handleResolve(dispute.id, dispute.market_id, 'no')}
                  disabled={resolving === dispute.id}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#ff4d6d]/15 text-[#ff4d6d]
                             border border-[#ff4d6d]/30 font-display font-700 text-sm hover:bg-[#ff4d6d]/25
                             transition-all disabled:opacity-50"
                >
                  <TrendingDown size={14} /> Resolve NO
                </button>
                <button
                  onClick={() => handleResolve(dispute.id, dispute.market_id, 'cancelled')}
                  disabled={resolving === dispute.id}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-500/15 text-gray-400
                             border border-gray-500/30 font-display font-700 text-sm hover:bg-gray-500/25
                             transition-all disabled:opacity-50"
                >
                  <XCircle size={14} /> Cancel & Refund All
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Resolved disputes */}
      {resolvedDisputes.length > 0 && (
        <div>
          <h2 className="font-display font-700 text-base text-gray-500 mb-3">
            Recently Resolved ({resolvedDisputes.length})
          </h2>
          <div className="space-y-2">
            {resolvedDisputes.slice(0, 5).map(d => (
              <div key={d.id} className="surface rounded-xl p-4 flex items-center justify-between opacity-60">
                <p className="text-sm">{d.markets?.title}</p>
                <span className="text-xs text-[#00d4aa] font-700">{d.resolution ?? 'Resolved'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
