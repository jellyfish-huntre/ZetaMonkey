import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../lib/mathEngine';
import { useGameStore } from './gameStore';
import { useUserStore } from './userStore';

const questions = Array.from({ length: 300 }, (_, questionIndex) => ({
  questionIndex,
  num1: questionIndex + 2,
  num2: 2,
  operation: '+' as const,
}));

const prepared = (runNumber: number) => Response.json({
  ok: true,
  runId: `run-${runNumber}`,
  runToken: `token-${runNumber}`,
  preparedExpiresAt: '2026-07-12T12:15:00.000Z',
  questions,
});

const begun = () => Response.json({
  ok: true,
  startsAt: '2026-07-12T12:00:00.000Z',
  endsAt: '2026-07-12T12:02:00.000Z',
  activatedAt: '2026-07-12T12:00:00.050Z',
});

const bodyFor = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string) as Record<string, unknown>;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  useGameStore.getState().resetGame();
  useGameStore.getState().invalidateLeaderboardStandby();
  useUserStore.setState({ user: null, session: null, pendingLeaderboardRuns: [] });
  vi.restoreAllMocks();
});

describe('game timing context', () => {
  it('uses an absolute shared deadline for Versus games', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T12:00:00Z'));
    const endsAt = Date.now() + 120_000;

    void useGameStore.getState().startGame(120, DEFAULT_SETTINGS, undefined, {
      mode: 'versus',
      seed: 42,
      endsAt,
    });
    expect(useGameStore.getState()).toMatchObject({ mode: 'versus', timeLeft: 120, endsAt });

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
  it('warms one batch, starts synchronously, and replenishes the standby while playing', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-12T12:00:00Z'));
    let prepareCount = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as { action: string };
      if (body.action === 'prepare') return prepared(++prepareCount);
      if (body.action === 'begin') return begun();
      throw new Error(`Unexpected action: ${body.action}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await useGameStore.getState().warmLeaderboardRun();
    expect(useGameStore.getState()).toMatchObject({
      status: 'idle',
      standbyPreparationStatus: 'ready',
      standbyLeaderboardRun: { runId: 'run-1' },
    });

    const startPromise = useGameStore.getState().startGame(120, DEFAULT_SETTINGS);
    expect(useGameStore.getState()).toMatchObject({
      status: 'playing',
      currentQuestion: { num1: 2, num2: 2, operation: '+', answer: 4 },
      leaderboardRun: { runId: 'run-1', currentIndex: 0, activationStatus: 'pending' },
      standbyLeaderboardRun: null,
    });
    await startPromise;
    await vi.waitFor(() => expect(useGameStore.getState()).toMatchObject({
      leaderboardRun: { runId: 'run-1', activationStatus: 'active' },
      standbyLeaderboardRun: { runId: 'run-2' },
    }));

    vi.advanceTimersByTime(500);
    useGameStore.getState().submitAnswer('4');
    useGameStore.getState().skipQuestion();
    expect(useGameStore.getState().leaderboardRun).toMatchObject({
      currentIndex: 2,
      transcript: [
        { questionIndex: 0, type: 'answered', answer: 4, elapsedMs: expect.any(Number) },
        { questionIndex: 1, type: 'skipped', elapsedMs: expect.any(Number) },
      ],
    });
    expect(useGameStore.getState().leaderboardRun?.transcript[0].elapsedMs).toBeGreaterThanOrEqual(500);
  });

  it('queues Space on the current screen until the first background batch arrives', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-12T12:00:00Z'));
    let releaseFirstPrepare: ((response: Response) => void) | undefined;
    let prepareCount = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as { action: string };
      if (body.action === 'prepare') {
        prepareCount += 1;
        if (prepareCount === 1) return new Promise<Response>((resolve) => { releaseFirstPrepare = resolve; });
        return prepared(prepareCount);
      }
      if (body.action === 'begin') return begun();
      throw new Error(`Unexpected action: ${body.action}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const startPromise = useGameStore.getState().startGame(120, DEFAULT_SETTINGS);
    expect(useGameStore.getState()).toMatchObject({ status: 'idle', queuedRankedStart: true });
    releaseFirstPrepare?.(prepared(1));
    await startPromise;
    expect(useGameStore.getState()).toMatchObject({
      status: 'playing',
      queuedRankedStart: false,
      leaderboardRun: { runId: 'run-1' },
    });
  });

  it('uses the ready replacement immediately when Space restarts a run', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-12T12:00:00Z'));
    let prepareCount = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as { action: string };
      if (body.action === 'prepare') return prepared(++prepareCount);
      if (body.action === 'begin') return begun();
      throw new Error(`Unexpected action: ${body.action}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await useGameStore.getState().warmLeaderboardRun();
    await useGameStore.getState().startGame(120, DEFAULT_SETTINGS);
    await vi.waitFor(() => expect(useGameStore.getState().standbyLeaderboardRun?.runId).toBe('run-2'));

    const restart = useGameStore.getState().startGame(120, DEFAULT_SETTINGS);
    expect(useGameStore.getState()).toMatchObject({
      status: 'playing',
      score: 0,
      leaderboardRun: { runId: 'run-2', currentIndex: 0 },
    });
    await restart;
    await vi.waitFor(() => expect(useGameStore.getState().standbyLeaderboardRun?.runId).toBe('run-3'));
  });

  it('retries activation without interrupting gameplay', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-12T12:00:00Z'));
    let prepareCount = 0;
    let beginCount = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as { action: string };
      if (body.action === 'prepare') return prepared(++prepareCount);
      if (body.action === 'begin') {
        beginCount += 1;
        return beginCount === 1
          ? Response.json({ error: 'temporary' }, { status: 503 })
          : begun();
      }
      throw new Error(`Unexpected action: ${body.action}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await useGameStore.getState().warmLeaderboardRun();
    await useGameStore.getState().startGame(120, DEFAULT_SETTINGS);
    expect(useGameStore.getState()).toMatchObject({ status: 'playing', leaderboardRun: { activationStatus: 'pending' } });
    await vi.advanceTimersByTimeAsync(250);
    await vi.waitFor(() => expect(useGameStore.getState().leaderboardRun?.activationStatus).toBe('active'));
    expect(beginCount).toBe(2);
  });

  it('fails closed when ranked preparation is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'offline' }, { status: 503 })));
    await useGameStore.getState().startGame(120, DEFAULT_SETTINGS);
    expect(useGameStore.getState()).toMatchObject({
      status: 'idle',
      queuedRankedStart: false,
      startError: 'Could not start a ranked game. Please try again.',
      leaderboardRun: null,
    });
  });

  it('does not send answers until verification after time expires', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-12T12:00:00Z'));
    let prepareCount = 0;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as { action: string };
      if (body.action === 'prepare') return prepared(++prepareCount);
      if (body.action === 'begin') return begun();
      if (body.action === 'submit') return Response.json({
        ok: true,
        score: 1,
        qpm: 1,
        accuracy: 100,
        skips: 0,
        eligible: true,
        eligibilityReason: null,
      });
      throw new Error(`Unexpected action: ${body.action}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await useGameStore.getState().warmLeaderboardRun();
    await useGameStore.getState().startGame(120, DEFAULT_SETTINGS);
    await vi.waitFor(() => expect(useGameStore.getState().leaderboardRun?.activationStatus).toBe('active'));
    useGameStore.getState().submitAnswer('4');
    expect(fetchMock.mock.calls.map(bodyFor).map((body) => body.action)).not.toContain('submit');

    vi.advanceTimersByTime(120_000);
    useGameStore.getState().tick();
    await useGameStore.getState().verifyLeaderboardRun();
    const submittedCall = fetchMock.mock.calls.find((call) => bodyFor(call).action === 'submit');
    expect(submittedCall).toBeDefined();
    expect(bodyFor(submittedCall!).transcript).toHaveLength(1);
    expect(useGameStore.getState()).toMatchObject({
      leaderboardVerification: 'verified',
      leaderboardResult: { score: 1, eligible: true, claimed: false },
    });
    expect(useUserStore.getState().pendingLeaderboardRuns).toEqual([{ runId: 'run-1', runToken: 'token-1' }]);
  });

  it('keeps custom-duration games local and unranked', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await useGameStore.getState().startGame(60, DEFAULT_SETTINGS);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useGameStore.getState()).toMatchObject({ status: 'playing', duration: 60, leaderboardRun: null });
  });
});
