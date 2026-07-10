import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../lib/mathEngine';
import { useGameStore } from './gameStore';

afterEach(() => {
  vi.useRealTimers();
  useGameStore.getState().resetGame();
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
