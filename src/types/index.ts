// ============================================================
// types/index.ts — Shared TypeScript types for NaijaPredict
// ============================================================

export type MarketCategory = 'sports' | 'entertainment' | 'politics' | 'finance' | 'other';
export type MarketStatus = 'open' | 'closed' | 'resolving' | 'resolved' | 'disputed' | 'cancelled';
export type MarketOutcome = 'yes' | 'no' | 'cancelled';
export type PositionSide = 'yes' | 'no';
export type TxType = 'deposit' | 'buy_shares' | 'sell_shares' | 'payout' | 'refund' | 'withdrawal' | 'fee';
export type WithdrawalStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  balance: number;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface Market {
  id: string;
  creator_id: string | null;
  title: string;
  description: string | null;
  category: MarketCategory;
  status: MarketStatus;
  yes_price: number;    // 0.00–1.00 representing NGN probability price per share
  no_price: number;
  yes_shares: number;
  no_shares: number;
  total_pool: number;
  resolution_deadline: string;
  resolved_at: string | null;
  outcome: MarketOutcome | null;
  oracle_source: string | null;
  oracle_event_id: string | null;
  oracle_raw_response: Record<string, unknown> | null;
  image_url: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface Position {
  id: string;
  user_id: string;
  market_id: string;
  side: PositionSide;
  shares: number;
  avg_price: number;
  total_cost: number;
  payout: number | null;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: TxType;
  amount: number;
  balance_after: number;
  description: string | null;
  reference: string | null;
  market_id: string | null;
  position_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Withdrawal {
  id: string;
  user_id: string;
  amount: number;
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_name: string | null;
  status: WithdrawalStatus;
  flw_transfer_id: string | null;
  flw_reference: string | null;
  failure_reason: string | null;
  processed_by: string | null;
  processed_at: string | null;
  transaction_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  profiles?: Pick<Profile, 'email' | 'full_name'>;
}

export interface NigerianBank {
  code: string;
  name: string;
}

// Flutterwave webhook payload shape
export interface FlutterwaveWebhookPayload {
  event: string;
  data: {
    id: number;
    tx_ref: string;
    flw_ref: string;
    status: string;
    currency: string;
    amount: number;
    charged_amount: number;
    customer: {
      id: number;
      email: string;
      phone_number: string | null;
      name: string;
    };
    payment_type: string;
    created_at: string;
  };
}
