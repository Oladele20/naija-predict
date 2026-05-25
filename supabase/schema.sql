-- ============================================================
-- NAIJA PREDICT — Complete Supabase Database Schema
-- Run this entire file in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: profiles
-- Extends Supabase auth.users with app-specific data
-- ============================================================
CREATE TABLE public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  full_name    TEXT,
  phone        TEXT,
  avatar_url   TEXT,
  balance      NUMERIC(15, 2) NOT NULL DEFAULT 0.00,   -- NGN balance (kobo-safe precision)
  is_admin     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TABLE: markets
-- Core prediction market entity
-- ============================================================
CREATE TYPE market_category AS ENUM ('sports', 'entertainment', 'politics', 'finance', 'other');
CREATE TYPE market_status AS ENUM ('open', 'closed', 'resolving', 'resolved', 'disputed', 'cancelled');
CREATE TYPE market_outcome AS ENUM ('yes', 'no', 'cancelled');

CREATE TABLE public.markets (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  description         TEXT,
  category            market_category NOT NULL DEFAULT 'other',
  status              market_status NOT NULL DEFAULT 'open',

  -- Pricing (in NGN, stored as fractions 0.00–1.00 representing probability)
  yes_price           NUMERIC(5, 4) NOT NULL DEFAULT 0.5000,  -- e.g. 0.6500 = ₦0.65 per share
  no_price            NUMERIC(5, 4) NOT NULL DEFAULT 0.5000,

  -- Share pool sizes
  yes_shares          NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  no_shares           NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  total_pool          NUMERIC(15, 2) NOT NULL DEFAULT 0.00,   -- Total NGN in market

  -- Resolution
  resolution_deadline TIMESTAMPTZ NOT NULL,
  resolved_at         TIMESTAMPTZ,
  outcome             market_outcome,
  oracle_source       TEXT,         -- e.g. "football-data.org", "manual"
  oracle_event_id     TEXT,         -- external event ID for oracle queries
  oracle_raw_response JSONB,        -- store raw oracle payload for audit

  -- Metadata
  image_url           TEXT,
  tags                TEXT[],
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER markets_updated_at
  BEFORE UPDATE ON public.markets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TABLE: positions
-- User share holdings in a market
-- ============================================================
CREATE TYPE position_side AS ENUM ('yes', 'no');

CREATE TABLE public.positions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  market_id    UUID NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  side         position_side NOT NULL,
  shares       NUMERIC(15, 4) NOT NULL DEFAULT 0.0000,
  avg_price    NUMERIC(5, 4) NOT NULL,                        -- avg cost per share
  total_cost   NUMERIC(15, 2) NOT NULL,                      -- total NGN spent
  payout       NUMERIC(15, 2),                               -- filled on resolution
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, market_id, side)  -- one position per side per market per user
);

CREATE TRIGGER positions_updated_at
  BEFORE UPDATE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TABLE: transactions
-- Immutable ledger of all money movements
-- ============================================================
CREATE TYPE tx_type AS ENUM (
  'deposit',        -- Flutterwave deposit
  'buy_shares',     -- user buys YES/NO shares
  'sell_shares',    -- user sells shares back
  'payout',         -- market resolved, winnings credited
  'refund',         -- cancelled market or failed withdrawal refund
  'withdrawal',     -- user withdrawal (debit)
  'fee'             -- platform fee
);

CREATE TABLE public.transactions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type          tx_type NOT NULL,
  amount        NUMERIC(15, 2) NOT NULL,                   -- positive = credit, negative = debit
  balance_after NUMERIC(15, 2) NOT NULL,
  description   TEXT,
  reference     TEXT UNIQUE,                               -- Flutterwave tx_ref or internal ref
  market_id     UUID REFERENCES public.markets(id),
  position_id   UUID REFERENCES public.positions(id),
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast user history queries
CREATE INDEX idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX idx_transactions_market_id ON public.transactions(market_id);
CREATE INDEX idx_transactions_reference ON public.transactions(reference);

-- ============================================================
-- TABLE: withdrawals
-- Tracks withdrawal requests through approval lifecycle
-- ============================================================
CREATE TYPE withdrawal_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'refunded');

CREATE TABLE public.withdrawals (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount           NUMERIC(15, 2) NOT NULL,
  bank_code        TEXT NOT NULL,                        -- Flutterwave bank code e.g. "044"
  bank_name        TEXT NOT NULL,
  account_number   TEXT NOT NULL,                        -- 10-digit NUBAN
  account_name     TEXT,                                 -- filled after name enquiry
  status           withdrawal_status NOT NULL DEFAULT 'pending',
  flw_transfer_id  TEXT,                                 -- Flutterwave transfer ID on success
  flw_reference    TEXT,                                 -- our reference sent to Flutterwave
  failure_reason   TEXT,
  processed_by     UUID REFERENCES public.profiles(id),  -- admin who approved
  processed_at     TIMESTAMPTZ,
  transaction_id   UUID REFERENCES public.transactions(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER withdrawals_updated_at
  BEFORE UPDATE ON public.withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_withdrawals_user_id ON public.withdrawals(user_id);
CREATE INDEX idx_withdrawals_status ON public.withdrawals(status);

-- ============================================================
-- TABLE: disputes
-- Admin queue for ambiguous oracle results
-- ============================================================
CREATE TYPE dispute_status AS ENUM ('open', 'resolved');

CREATE TABLE public.disputes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  market_id     UUID NOT NULL REFERENCES public.markets(id),
  reason        TEXT NOT NULL,
  oracle_data   JSONB,
  status        dispute_status NOT NULL DEFAULT 'open',
  resolved_by   UUID REFERENCES public.profiles(id),
  resolution    TEXT,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.markets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes    ENABLE ROW LEVEL SECURITY;

-- Profiles: users see only their own; admins see all
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Markets: everyone can read open markets; only admins write
CREATE POLICY "Anyone can view markets"
  ON public.markets FOR SELECT
  TO authenticated
  USING (true);

-- Positions: users see only their own
CREATE POLICY "Users see own positions"
  ON public.positions FOR SELECT
  USING (auth.uid() = user_id);

-- Transactions: users see only their own
CREATE POLICY "Users see own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

-- Withdrawals: users see only their own
CREATE POLICY "Users see own withdrawals"
  ON public.withdrawals FOR SELECT
  USING (auth.uid() = user_id);

-- Service role bypasses RLS (used by API routes with SUPABASE_SERVICE_ROLE_KEY)
-- All write operations from API routes use the service role key.

-- ============================================================
-- SEED: Sample markets for development
-- ============================================================
INSERT INTO public.markets (title, description, category, status, yes_price, no_price, resolution_deadline, oracle_source, image_url, tags)
VALUES
  ('Will Super Eagles win the 2026 AFCON?',
   'Nigeria''s national football team to win the Africa Cup of Nations in 2026.',
   'sports', 'open', 0.4200, 0.5800,
   '2026-02-15 23:59:59+01',
   'football-data.org',
   'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800',
   ARRAY['football', 'AFCON', 'Super Eagles']),

  ('Will Asake release an album in Q3 2025?',
   'Nigerian Afrobeats artist Asake to drop a studio album between July and September 2025.',
   'entertainment', 'open', 0.6500, 0.3500,
   '2025-09-30 23:59:59+01',
   'manual',
   'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800',
   ARRAY['music', 'Afrobeats', 'Asake']),

  ('Will Tinubu win a second term in 2027?',
   'President Bola Ahmed Tinubu to win the 2027 Nigerian presidential election.',
   'politics', 'open', 0.5500, 0.4500,
   '2027-03-01 23:59:59+01',
   'manual',
   'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=800',
   ARRAY['politics', 'Nigeria', '2027 elections']),

  ('Will USD/NGN exchange rate exceed ₦2000 by Dec 2025?',
   'The Central Bank of Nigeria official exchange rate to exceed 2000 Naira per US Dollar.',
   'finance', 'open', 0.3000, 0.7000,
   '2025-12-31 23:59:59+01',
   'manual',
   'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800',
   ARRAY['forex', 'economy', 'CBN']);
