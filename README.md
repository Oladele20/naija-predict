# NaijaPredict 🇳🇬
**Nigeria's P2P Prediction Market — Powered by Supabase & Flutterwave**

> Buy YES or NO shares on Nigerian sports, politics, and entertainment events. Prices move with demand. Payouts in Naira.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Auth & DB | Supabase (PostgreSQL + Realtime) |
| Payments | Flutterwave (deposits, withdrawals) |
| Oracle | football-data.org (sports), manual (others) |

---

## Quick Start

### 1. Clone & Install
```bash
git clone <your-repo>
cd naija-predict
npm install
```

### 2. Set up environment variables
```bash
cp .env.example .env.local
# Fill in all values in .env.local
```

### 3. Set up Supabase
1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the entire contents of `supabase/schema.sql`
3. Enable **Realtime** for the `markets` and `profiles` tables in Table Editor → Replication
4. Copy your project URL and keys into `.env.local`

### 4. Set up Flutterwave
1. Create an account at [flutterwave.com](https://flutterwave.com)
2. Get your **Public Key**, **Secret Key**, and **Encryption Key** from Settings → API
3. In Flutterwave Dashboard → **Webhooks**:
   - Set webhook URL to: `https://your-domain.com/api/webhooks/flutterwave`
   - Set a **Secret Hash** (any random string) — copy it to `FLUTTERWAVE_WEBHOOK_HASH`
4. Copy all keys into `.env.local`

### 5. Run locally
```bash
npm run dev
# App runs at http://localhost:3000
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     USER FLOWS                              │
│                                                             │
│  Sign Up → Dashboard → Browse Markets → Buy YES/NO Shares  │
│                ↓                                            │
│  Deposit (Flutterwave) → Webhook → Auto-credit balance      │
│                ↓                                            │
│  Withdraw → Pending → Admin Approves → Flutterwave Transfer │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  MARKET RESOLUTION FLOW                     │
│                                                             │
│  Deadline passes → Admin triggers resolve                   │
│       ↓                                                     │
│  Oracle queried (football-data.org or manual)               │
│       ↓                              ↓                      │
│  Definitive result           Ambiguous result               │
│       ↓                              ↓                      │
│  Auto-payout winners         Dispute queue                  │
│  (2% platform fee)           Admin manual resolve           │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Files Reference

```
src/
├── app/
│   ├── page.tsx                          # Root redirect
│   ├── auth/login/page.tsx               # Sign in / Sign up
│   ├── dashboard/page.tsx                # Market discovery homepage
│   ├── market/[id]/page.tsx              # Individual market + trading
│   ├── deposit/page.tsx                  # Flutterwave deposit page
│   ├── withdraw/page.tsx                 # Withdrawal request page
│   ├── profile/page.tsx                  # Portfolio & transaction history
│   ├── admin/
│   │   ├── withdrawals/page.tsx          # Admin payout queue
│   │   └── disputes/page.tsx             # Oracle dispute resolution
│   └── api/
│       ├── webhooks/flutterwave/route.ts # ← Flutterwave deposit webhook
│       ├── markets/buy/route.ts          # Buy YES/NO shares
│       ├── markets/resolve/route.ts      # Oracle-triggered auto-resolution
│       ├── markets/resolve-manual/route.ts # Admin manual resolution
│       ├── withdraw/route.ts             # Create withdrawal request
│       └── admin/payout/route.ts         # ← Flutterwave transfer API
├── components/
│   ├── layout/Navbar.tsx                 # Navigation with real-time balance
│   └── markets/
│       ├── MarketCard.tsx                # Market card with probability bar
│       └── TradePanel.tsx                # Buy shares interface
└── lib/
    ├── supabase/
    │   ├── client.ts                     # Browser Supabase client
    │   └── server.ts                     # Server + Admin Supabase clients
    ├── banks.ts                          # Nigerian banks, NGN formatting, tx_ref utils
    ├── market-engine.ts                  # AMM pricing + payout calculation
    └── oracle.ts                         # Oracle service (football-data.org)
```

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `profiles` | User accounts, Naira balance, admin flag |
| `markets` | Prediction markets with AMM state |
| `positions` | User share holdings per market |
| `transactions` | Immutable ledger of all money movements |
| `withdrawals` | Withdrawal lifecycle tracking |
| `disputes` | Admin queue for ambiguous oracle results |

---

## Security Architecture

### Webhook Security
- All Flutterwave webhooks are verified against `FLUTTERWAVE_WEBHOOK_HASH` before processing
- Every deposit is **re-verified** against Flutterwave's `/v3/transactions/{id}/verify` API — we never trust the webhook amount alone
- **Idempotency**: duplicate `tx_ref` values are rejected to prevent double-crediting

### Balance Safety
- Withdrawals immediately deduct user balance before creating the pending record — **zero double-spend risk**
- All balance mutations use the **service role key** in server-side API routes
- Failed Flutterwave transfers **automatically refund** the user's balance

### Admin Security
- All admin API routes (`/api/admin/*`) verify `is_admin = true` from the database
- Supabase RLS policies prevent users from reading others' data
- The `SUPABASE_SERVICE_ROLE_KEY` is **never exposed** to the browser

---

## Making a User Admin

In Supabase SQL Editor:
```sql
UPDATE public.profiles
SET is_admin = true
WHERE email = 'your-admin@email.com';
```

---

## Adding New Markets

In Supabase SQL Editor:
```sql
INSERT INTO public.markets (
  title, description, category, yes_price, no_price,
  resolution_deadline, oracle_source, oracle_event_id, image_url, tags
) VALUES (
  'Will Burna Boy win a Grammy in 2026?',
  'Nigerian Afrobeats artist Burna Boy to win at the 2026 Grammy Awards.',
  'entertainment', 0.45, 0.55,
  '2026-02-05 06:00:00+01',
  'manual', NULL,
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800',
  ARRAY['music', 'Grammy', 'Burna Boy']
);
```

For sports markets using football-data.org, set:
- `oracle_source = 'football-data.org'`
- `oracle_event_id = '<match-id-from-football-data-org>'`

---

## Environment Variables Reference

| Variable | Where to find | Used in |
|----------|--------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API | Client + Server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API | Client + Server |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API | Server only ⚠️ |
| `NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY` | Flutterwave → Settings → API | Client (inline checkout) |
| `FLUTTERWAVE_SECRET_KEY` | Flutterwave → Settings → API | Server only ⚠️ |
| `FLUTTERWAVE_WEBHOOK_HASH` | You set this in Flutterwave Webhooks | Webhook verification |
| `FOOTBALL_DATA_API_KEY` | football-data.org | Oracle service |
| `NEXT_PUBLIC_APP_URL` | Your deployment URL | Callback URLs |

> ⚠️ Variables marked "Server only" must **never** be exposed to the browser.

---

## Deployment (Vercel)

```bash
# Push to GitHub, then connect to Vercel
# Add all environment variables in Vercel Dashboard → Settings → Environment Variables
# Set NEXT_PUBLIC_APP_URL to your Vercel deployment URL
# Update Flutterwave webhook URL to: https://your-app.vercel.app/api/webhooks/flutterwave
```
