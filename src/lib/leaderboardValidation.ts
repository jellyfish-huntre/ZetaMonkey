export const MAX_LEADERBOARD_SCORE = 300;

const DISQUALIFIED_ENTRY_IDS = new Set([
  '252e2520-328c-4f26-9616-d9a77d2d8fac', // JaneStreetIntern: 1554
  'a507cc54-e066-40e5-8619-c89489240142', // ZETAMONK: 279
]);

interface LeaderboardEntry {
  id: string;
  score: number;
}

export function isAllowedLeaderboardEntry(entry: LeaderboardEntry): boolean {
  return (
    entry.score >= 0 &&
    entry.score <= MAX_LEADERBOARD_SCORE &&
    !DISQUALIFIED_ENTRY_IDS.has(entry.id)
  );
}
