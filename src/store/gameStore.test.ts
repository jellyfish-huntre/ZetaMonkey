import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../lib/mathEngine';
import { useGameStore } from './gameStore';
import { useUserStore } from './userStore';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  useGameStore.getState().resetGame();
  useUserStore.setState({ pendingLeaderboardRuns: [] });
  vi.restoreAllMocks();
});

describe('game timing context', () => {
  it('uses an absolute shared deadline for Versus games', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T12:00:00Z'));
    const endsAt = Date.now() + 120_000;

    useGameStore.getState().startGame(120, DEFAULT_SETTINGS, undefined, {
      mode: 'versus',
      seed: 42,
      endsAt,
    });
    expect(useGameStore.getState()).toMatchObject({
      mode: 'versus',
      timeLeft: 120,
      endsAt,
    });

    vi.advanceTimersByTime(31_000);
    useGameStore.getState().tick();
    expect(useGameStore.getState().timeLeft).toBe(89);

    vi.advanceTimersByTime(89_000);
    useGameStore.getState().tick();
    expect(useGameStore.getState()).toMatchObject({
      status: 'finished',
      timeLeft: 0,
      finishReason: 'time_up',
    });
  });
});

describe('protected solo runs', () => {
  const questions = Array.from({ length: 300 }, (_, questionIndex) => ({
    questionIndex,
    num1: questionIndex + 2,
    num2: 2,
    operation: '+' as const,
  }));

  it('loads the server batch before starting and records a contiguous transcript', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-12T12:00:00Z'));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ ok: true, runId: 'run-1', runToken: 'token', questions }))
      .mockResolvedValueOnce(Response.json({
        ok: true,
        startsAt: '2026-07-12T12:00:00.000Z',
        endsAt: '2026-07-12T12:02:00.000Z',
      }));
    vi.stubGlobal('fetch', fetchMock);

    await useGameStore.getState().startGame(120, DEFAULT_SETTINGS);
    expect(useGameStore.getState()).toMatchObject({
      status: 'playing',
      score: 0,
      currentQuestion: { num1: 2, num2: 2, operation: '+', answer: 4 },
      leaderboardRun: { currentIndex: 0, transcript: [] },
    });

    vi.advanceTimersByTime(500);
    useGameStore.getState().submitAnswer('4');
    useGameStore.getState().skipQuestion();
    expect(useGameStore.getState().leaderboardRun).toMatchObject({
      currentIndex: 2,
      transcript: [
        { questionIndex: 0, type: 'answered', answer: 4, elapsedMs: 500 },
        { questionIndex: 1, type: 'skipped', elapsedMs: 500 },
      ],
    });
    expect(useGameStore.getState().currentQuestion).toMatchObject({ num1: 4, num2: 2 });
  });

  it('fails closed when ranked preparation is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'offline' }, { status: 503 })));
    await useGameStore.getState().startGame(120, DEFAULT_SETTINGS);
    expect(useGameStore.getState()).toMatchObject({
      status: 'idle',
      startError: 'Could not start a ranked game. Please try again.',
      leaderboardRun: null,
    });
  });

  it('does not send answers until verification after time expires', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-12T12:00:00Z'));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ ok: true, runId: 'run-2', runToken: 'token', questions }))
      .mockResolvedValueOnce(Response.json({
        ok: true,
        startsAt: '2026-07-12T12:00:00.000Z',
        endsAt: '2026-07-12T12:02:00.000Z',
      }))
      .mockResolvedValueOnce(Response.json({
        ok: true,
        score: 1,
        qpm: 1,
        accuracy: 100,
        skips: 0,
        eligible: true,
        eligibilityReason: null,
      }));
    vi.stubGlobal('fetch', fetchMock);

    await useGameStore.getState().startGame(120, DEFAULT_SETTINGS);
    useGameStore.getState().submitAnswer('4');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(120_000);
    useGameStore.getState().tick();
    await useGameStore.getState().verifyLeaderboardRun();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const submitted = JSON.parse(fetchMock.mock.calls[2][1].body as string) as { transcript: unknown[] };
    expect(submitted.transcript).toHaveLength(1);
    expect(useGameStore.getState()).toMatchObject({
      leaderboardVerification: 'verified',
      leaderboardResult: { score: 1, eligible: true, claimed: false },
    });
    expect(useUserStore.getState().pendingLeaderboardRuns).toEqual([{ runId: 'run-2', runToken: 'token' }]);
  });

  it('keeps custom-duration games local and unranked', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await useGameStore.getState().startGame(60, DEFAULT_SETTINGS);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useGameStore.getState()).toMatchObject({ status: 'playing', duration: 60, leaderboardRun: null });
  });
});
