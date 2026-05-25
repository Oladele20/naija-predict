// ============================================================
// lib/market-engine.ts — Automated Market Maker (LMSR-lite)
// Prices fluctuate based on share demand using a simplified
// constant-product model (like Uniswap but for prediction shares)
// ============================================================

/**
 * Calculate the new YES/NO prices after a purchase.
 * Uses a simplified LMSR (Logarithmic Market Scoring Rule) approach.
 *
 * @param yesShares  Current total YES shares outstanding
 * @param noShares   Current total NO shares outstanding
 * @param side       Which side the user is buying
 * @param amount     NGN amount being spent
 * @returns New prices and shares granted
 */
export function calculatePurchase(
  yesShares: number,
  noShares: number,
  side: 'yes' | 'no',
  amountNGN: number
): {
  sharesGranted: number;
  newYesPrice: number;
  newNoPrice: number;
  newYesShares: number;
  newNoShares: number;
  avgPricePerShare: number;
} {
  // Liquidity parameter — higher = less price impact per trade
  const b = Math.max(yesShares + noShares, 100);

  // Current price via Sigmoid/softmax of shares
  const currentYesPrice = Math.exp(yesShares / b) / (Math.exp(yesShares / b) + Math.exp(noShares / b));
  const currentNoPrice  = 1 - currentYesPrice;

  const currentPrice = side === 'yes' ? currentYesPrice : currentNoPrice;

  // Shares granted = amount / effective price (with slippage)
  // Slippage factor prevents buying infinite shares at a fixed price
  const slippageFactor = 1 + (amountNGN / (b * 10));
  const effectivePrice = Math.min(currentPrice * slippageFactor, 0.99);
  const sharesGranted = amountNGN / effectivePrice;

  // New share counts
  const newYesShares = side === 'yes' ? yesShares + sharesGranted : yesShares;
  const newNoShares  = side === 'no'  ? noShares  + sharesGranted : noShares;

  // Recalculate prices from new share counts
  const bNew = Math.max(newYesShares + newNoShares, 100);
  const newYesPrice = Math.exp(newYesShares / bNew) / (Math.exp(newYesShares / bNew) + Math.exp(newNoShares / bNew));
  const newNoPrice  = 1 - newYesPrice;

  return {
    sharesGranted: Math.round(sharesGranted * 10000) / 10000,
    newYesPrice: Math.round(newYesPrice * 10000) / 10000,
    newNoPrice:  Math.round(newNoPrice  * 10000) / 10000,
    newYesShares,
    newNoShares,
    avgPricePerShare: Math.round(effectivePrice * 10000) / 10000,
  };
}

/**
 * Calculate the payout for a winning position.
 * Winning side shares pay out proportionally from the total pool.
 * Platform takes a 2% fee.
 *
 * @param userShares     How many shares the user holds
 * @param totalWinShares Total shares on the winning side across all users
 * @param totalPool      Total NGN in the market pool
 */
export function calculatePayout(
  userShares: number,
  totalWinShares: number,
  totalPool: number
): { grossPayout: number; fee: number; netPayout: number } {
  if (totalWinShares === 0) return { grossPayout: 0, fee: 0, netPayout: 0 };
  const PLATFORM_FEE_RATE = 0.02; // 2%
  const grossPayout = (userShares / totalWinShares) * totalPool;
  const fee = grossPayout * PLATFORM_FEE_RATE;
  const netPayout = grossPayout - fee;
  return {
    grossPayout: Math.round(grossPayout * 100) / 100,
    fee: Math.round(fee * 100) / 100,
    netPayout: Math.round(netPayout * 100) / 100,
  };
}

/** Minimum trade amount in NGN */
export const MIN_TRADE_NGN = 100;
/** Maximum trade amount per transaction */
export const MAX_TRADE_NGN = 1_000_000;
