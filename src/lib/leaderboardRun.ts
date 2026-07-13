import type { Operation } from './mathEngine';

export interface RankedQuestionPrompt {
  questionIndex: number;
  num1: number;
  num2: number;
  operation: Operation;
}

export interface LeaderboardTranscriptAction {
  questionIndex: number;
  type: 'answered' | 'skipped';
  answer?: number;
  elapsedMs: number;
  mistakes: number;
}

export interface PendingLeaderboardRun {
  runId: string;
  runToken: string;
}

export interface VerifiedLeaderboardResult {
  score: number;
  qpm: number;
  accuracy: number;
  skips: number;
  eligible: boolean;
  eligibilityReason: string | null;
  claimed: boolean;
}

interface PrepareResponse {
  ok: true;
  runId: string;
  runToken: string;
  questions: RankedQuestionPrompt[];
}

interface BeginResponse {
  ok: true;
  startsAt: string;
  endsAt: string;
}

interface SubmitResponse extends Omit<VerifiedLeaderboardResult, 'claimed'> {
  ok: true;
}

const request = async <T>(
  body: Record<string, unknown>,
  fallbackMessage: string,
  accessToken?: string | null,
): Promise<T> => {
  const response = await fetch('/api/leaderboard-run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(fallbackMessage);
  return data as T;
};

export const prepareLeaderboardRun = (accessToken?: string | null) =>
  request<PrepareResponse>({ action: 'prepare' }, 'Could not start a ranked game. Please try again.', accessToken);

export const beginLeaderboardRun = (run: PendingLeaderboardRun) =>
  request<BeginResponse>({ action: 'begin', ...run }, 'Could not start a ranked game. Please try again.');

export const submitLeaderboardRun = (
  run: PendingLeaderboardRun,
  transcript: LeaderboardTranscriptAction[],
) => request<SubmitResponse>(
  { action: 'submit', ...run, transcript },
  'Could not verify your score. Please try again.',
);

export const claimLeaderboardRun = (run: PendingLeaderboardRun, accessToken: string) =>
  request<{ ok: true; leaderboardId: string; alreadyClaimed: boolean }>(
    { action: 'claim', ...run },
    'Could not add your score yet. Please try again.',
    accessToken,
  );
