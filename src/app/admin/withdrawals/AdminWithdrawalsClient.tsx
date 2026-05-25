'use client';
// app/admin/withdrawals/AdminWithdrawalsClient.tsx

import { useState } from 'react';
import toast from 'react-hot-toast';
import { formatNGN } from '@/lib/banks';
import type { Withdrawal } from '@/types';
import {
  Clock, CheckCircle, XCircle, AlertCircle,
  Shield, RefreshCw, TrendingDown
} from 'lucide-react';

interface Props {
  initialWithdrawals: (Withdrawal & { profiles?: { email: string; full_name: string | null } | null })[];
}

const STATUS_BADGES: Record<string, string> = {
  pending:    'bg-warning/15 text-warning border-warning/30',
  processing: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  completed:  'bg-[#00d4aa]/15 text-[#00d4aa] border-[#00d4aa]/30',
  failed:     'bg-[#ff4d6d]/15 text-[#ff4d6d] border-[#ff4d6d]/30',
  refunded:   'bg-gray-500/15 text-gray-400 border-gray-500/30',
};

export default function AdminWithdrawalsClient({ initialWithdrawals }: Props) {
  const [withdrawals, setWithdrawals] = useState(initialWithdrawals);
  const [approving, setApproving] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('pending');

  const pendingCount = withdrawals.filter(w => w.status === 'pending').length;
  const totalPending = withdrawals
    .filter(w => w.status === 'pending')
    .reduce((sum, w) => sum + Number(w.amount), 0);

  const handleApprove = async (withdrawalId: string) => {
    setApproving(withdrawalId);
    const toastId = toast.loading('Processing withdrawal…');

    try {
      const res = await fetch('/api/admin/payout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ withdrawalId }),
      });
      const data = await res.json();

      if (res.ok) {
        toast.success('✅ Transfer initiated successfully!', { id: toastId });
        setWithdrawals(prev =>
          prev.map(w => w.id === withdrawalId ? { ...w, status: 'completed' } : w)
        );
      } else {
        const msg = data.error ?? 'Transfer failed';
        toast.error(`❌ ${msg} — User has been refunded.`, { id: toastId, duration: 6000 });
        setWithdrawals(prev =>
          prev.map(w => w.id === withdrawalId ? { ...w, status: 'failed' } : w)
        );
      }
    } catch {
      toast.error('Network error. Please retry.', { id: toastId });
    } finally {
      setApproving(null);
    }
  };

  const filtered = statusFilter === 'all'
    ? withdrawals
    : withdrawals.filter(w => w.status === statusFilter);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-warning/15 border border-warning/30
                        flex items-center justify-center">
          <Shield size={18} className="text-warning" />
        </div>
        <div>
          <h1 className="font-display font-800 text-2xl">Withdrawal Queue</h1>
          <p className="text-sm text-gray-500">Review and approve user withdrawal requests</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Pending', value: pendingCount, color: 'text-warning', Icon: Clock },
          { label: 'Total Pending', value: formatNGN(totalPending), color: 'text-warning', Icon: TrendingDown },
          { label: 'Completed', value: withdrawals.filter(w => w.status === 'completed').length, color: 'text-[#00d4aa]', Icon: CheckCircle },
          { label: 'Failed', value: withdrawals.filter(w => w.status === 'failed').length, color: 'text-[#ff4d6d]', Icon: XCircle },
        ].map(({ label, value, color, Icon }) => (
          <div key={label} className="surface rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon size={12} className={color} />
              <p className="text-xs text-gray-500">{label}</p>
            </div>
            <p className={`font-display font-700 text-xl ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {['all', 'pending', 'processing', 'completed', 'failed'].map(status => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-4 py-2 rounded-lg text-xs font-700 capitalize whitespace-nowrap transition-all border
              ${statusFilter === status
                ? 'bg-[#1a1a2e] text-accent border-[#00d4aa]/30'
                : 'text-gray-500 border-transparent hover:text-gray-300'
              }`}
          >
            {status} ({status === 'all' ? withdrawals.length : withdrawals.filter(w => w.status === status).length})
          </button>
        ))}
      </div>

      {/* Withdrawals table */}
      <div className="surface rounded-2xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            <CheckCircle size={40} className="mx-auto mb-3 opacity-20" />
            <p className="font-display font-700">No {statusFilter} withdrawals</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2d2d4e] text-xs text-gray-500 uppercase tracking-wider">
                  <th className="text-left p-4">User</th>
                  <th className="text-left p-4">Amount</th>
                  <th className="text-left p-4">Bank Details</th>
                  <th className="text-left p-4">Requested</th>
                  <th className="text-left p-4">Status</th>
                  <th className="text-left p-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a1a2e]">
                {filtered.map(wd => (
                  <tr key={wd.id} className="hover:bg-[#12121f]/50 transition-colors">
                    <td className="p-4">
                      <p className="text-sm font-600">{wd.profiles?.full_name ?? 'Unknown'}</p>
                      <p className="text-xs text-gray-500">{wd.profiles?.email}</p>
                    </td>
                    <td className="p-4">
                      <p className="font-display font-700 text-[#ff4d6d]">
                        {formatNGN(wd.amount)}
                      </p>
                    </td>
                    <td className="p-4">
                      <p className="text-sm font-600">{wd.bank_name}</p>
                      <p className="text-xs text-gray-500 font-display tracking-widest">
                        {wd.account_number}
                      </p>
                    </td>
                    <td className="p-4 text-xs text-gray-500">
                      {new Date(wd.created_at).toLocaleDateString('en-NG', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-700 border capitalize
                        ${STATUS_BADGES[wd.status] ?? STATUS_BADGES.pending}`}>
                        {wd.status}
                      </span>
                      {wd.failure_reason && (
                        <p className="text-xs text-[#ff4d6d] mt-1 max-w-[150px] truncate" title={wd.failure_reason}>
                          {wd.failure_reason}
                        </p>
                      )}
                    </td>
                    <td className="p-4">
                      {wd.status === 'pending' && (
                        <button
                          onClick={() => handleApprove(wd.id)}
                          disabled={approving === wd.id}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#00d4aa] text-[#0a0a0f]
                                     font-display font-700 text-xs hover:brightness-110 transition-all
                                     disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {approving === wd.id ? (
                            <RefreshCw size={12} className="animate-spin" />
                          ) : (
                            <CheckCircle size={12} />
                          )}
                          {approving === wd.id ? 'Sending…' : 'Approve'}
                        </button>
                      )}
                      {wd.status === 'completed' && wd.flw_transfer_id && (
                        <p className="text-xs text-gray-600 font-display">
                          ID: {wd.flw_transfer_id}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
