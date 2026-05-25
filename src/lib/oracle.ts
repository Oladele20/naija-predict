// ============================================================
// lib/oracle.ts — Oracle service for automatic market resolution
// Queries external APIs to determine real-world outcomes
// ============================================================

export type OracleResult =
  | { status: 'resolved'; outcome: 'yes' | 'no'; confidence: 'high'; rawData: unknown }
  | { status: 'ambiguous'; reason: string; rawData: unknown }
  | { status: 'not_ready'; reason: string }
  | { status: 'error'; error: string };

/**
 * Query the oracle for a market's outcome.
 * Currently supports 'football-data.org' and 'manual' sources.
 *
 * @param oracleSource   e.g. "football-data.org" | "manual"
 * @param oracleEventId  External event/fixture ID
 * @param marketTitle    Human-readable title (used for logging/manual review)
 */
export async function queryOracle(
  oracleSource: string,
  oracleEventId: string,
  marketTitle: string
): Promise<OracleResult> {
  switch (oracleSource) {
    case 'football-data.org':
      return queryFootballDataOrg(oracleEventId);

    case 'manual':
      // Manual markets always go to admin dispute queue
      return {
        status: 'ambiguous',
        reason: `Market "${marketTitle}" is configured for manual resolution. Admin must resolve via dispute queue.`,
        rawData: null,
      };

    default:
      return {
        status: 'error',
        error: `Unknown oracle source: ${oracleSource}`,
      };
  }
}

/**
 * Query football-data.org for a match result.
 * The oracleEventId must be the fixture/match ID from football-data.org.
 * Market question must be "Will [Team] win [Match]?" format.
 */
async function queryFootballDataOrg(matchId: string): Promise<OracleResult> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    return { status: 'error', error: 'FOOTBALL_DATA_API_KEY not configured.' };
  }

  try {
    const res = await fetch(`https://api.football-data.org/v4/matches/${matchId}`, {
      headers: { 'X-Auth-Token': apiKey },
      next: { revalidate: 0 }, // always fresh
    });

    if (!res.ok) {
      return { status: 'error', error: `Football-data API error: ${res.status}` };
    }

    const data = await res.json();
    const match = data;
    const status = match?.status;

    if (status !== 'FINISHED') {
      return {
        status: 'not_ready',
        reason: `Match status is "${status}" — not yet finished.`,
      };
    }

    const homeGoals = match?.score?.fullTime?.home;
    const awayGoals = match?.score?.fullTime?.away;

    if (homeGoals == null || awayGoals == null) {
      return {
        status: 'ambiguous',
        reason: 'Match finished but score data is missing.',
        rawData: data,
      };
    }

    // For Nigeria-centric markets, check if the home or away team is Nigeria/Super Eagles
    // This is a simplification — in production, pass the team ID in oracleEventId
    const homeTeam: string = match?.homeTeam?.name ?? '';
    const awayTeam: string = match?.awayTeam?.name ?? '';
    const nigeriaNames = ['Nigeria', 'Super Eagles'];
    const nigeriaIsHome = nigeriaNames.some(n => homeTeam.includes(n));
    const nigeriaIsAway = nigeriaNames.some(n => awayTeam.includes(n));

    let outcome: 'yes' | 'no';

    if (nigeriaIsHome) {
      outcome = homeGoals > awayGoals ? 'yes' : 'no';
    } else if (nigeriaIsAway) {
      outcome = awayGoals > homeGoals ? 'yes' : 'no';
    } else {
      // Generic: "did home team win?"
      if (homeGoals === awayGoals) {
        return {
          status: 'ambiguous',
          reason: 'Match ended in a draw — ambiguous for a win/loss market.',
          rawData: data,
        };
      }
      outcome = homeGoals > awayGoals ? 'yes' : 'no';
    }

    return { status: 'resolved', outcome, confidence: 'high', rawData: data };
  } catch (err) {
    return { status: 'error', error: String(err) };
  }
}
