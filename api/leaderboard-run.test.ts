import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleLeaderboardRun } from './leaderboard-run';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const request = (body: Record<string, unknown>, token?: string) => new Request('https://app.test/api/leaderboard-run', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body),
});

describe('leaderboard run API', () => {
  it('prepares an anonymous batch without exposing answers', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'server-secret');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([
      { run_id: 'run-1', prepared_expires_at: '2026-07-12T12:02:00Z' },
    ])));

    const response = await handleLeaderboardRun(request({ action: 'prepare' }));
    expect(response.status).toBe(200);
    const data = await response.json() as { questions: Array<Record<string, unknown>>; runToken: string };
    expect(data.questions).toHaveLength(300);
    expect(data.questions.every((question) => !('answer' in question))).toBe(true);
    expect(data.runToken.length).toBeGreaterThan(30);
    expect(fetch).toHaveBeenCalledWith(
      'https://project.supabase.co/rest/v1/rpc/prepare_leaderboard_run',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('requires credentials and a transcript for protected actions', async () => {
    expect((await handleLeaderboardRun(request({ action: 'begin' }))).status).toBe(400);
    expect((await handleLeaderboardRun(request({ action: 'submit', runId: 'id', runToken: 'token' }))).status).toBe(400);
    expect((await handleLeaderboardRun(request({ action: 'claim', runId: 'id', runToken: 'token' }))).status).toBe(401);
  });

  it('passes only the transcript and hashed credential to verification', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'server-secret');
    const fetchMock = vi.fn().mockResolvedValue(Response.json([
      { score: 1, qpm: 1, accuracy: 100, skips: 0, eligible: true, eligibility_reason: null },
    ]));
    vi.stubGlobal('fetch', fetchMock);
    const transcript = [{ questionIndex: 0, type: 'answered', answer: 4, elapsedMs: 500, mistakes: 0 }];

    const response = await handleLeaderboardRun(request({
      action: 'submit', runId: 'run-1', runToken: 'raw-token', transcript,
    }));
    expect(response.status).toBe(200);
    const rpcBody = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(rpcBody.p_transcript).toEqual(transcript);
    expect(rpcBody.p_token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rpcBody)).not.toContain('raw-token');
  });
});

