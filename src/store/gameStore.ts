import { create } from 'zustand';
import {
  createSeededRandom,
  generateQuestion,
  checkAnswer,
  calculateAnswer,
  type Question,
  type GameSettings,
  type Category,
  type RandomSource,
  DEFAULT_SETTINGS,
  isDefaultSettings,
} from '../lib/mathEngine';
import { categorizeQuestion } from '../lib/mathUtils';
import {
  beginLeaderboardRun,
  prepareLeaderboardRun,
  submitLeaderboardRun,
  type LeaderboardTranscriptAction,
  type PendingLeaderboardRun,
  type PreparedLeaderboardRun,
  type RankedQuestionPrompt,
  type VerifiedLeaderboardResult,
} from '../lib/leaderboardRun';
import { useUserStore } from './userStore';

export type GameMode = 'solo' | 'versus';

export interface GameStartContext {
  mode?: GameMode;
  seed?: number;
  endsAt?: number;
}

const LEADERBOARD_DURATION_MS = 120_000;
export const LEADERBOARD_STANDBY_MIN_VALIDITY_MS = 10 * 60_000;
const LEADERBOARD_ACTIVATION_RECOVERY_MS = 10 * 60_000;
const ACTIVATION_RETRY_DELAYS_MS = [0, 250, 500, 1_000, 2_000, 5_000, 10_000];

interface StandbyLeaderboardRun extends PreparedLeaderboardRun {
  ownerKey: string;
}

interface ActiveLeaderboardRunState extends PendingLeaderboardRun {
  questions: RankedQuestionPrompt[];
  currentIndex: number;
  transcript: LeaderboardTranscriptAction[];
  startedAt: number;
  activationDeadline: number;
  activationStatus: 'pending' | 'active' | 'error';
}

interface GameState {
  status: 'idle' | 'playing' | 'finished';
  score: number;
  timeLeft: number;
  duration: number;
  currentQuestion: Question | null;
  gameHistory: Array<{
    question: Question;
    timeTaken: number;
    answerGiven: string;
    isCorrect: boolean;
    timestamp: number;
    mistakes?: number;
  }>;
  skipsCount: number;
  mistakes: number;
  settings: GameSettings;
  targetCategory: Category | null;
  mode: GameMode;
  seed: number | null;
  endsAt: number | null;
  randomSource: RandomSource;
  leaderboardRun: ActiveLeaderboardRunState | null;
  standbyLeaderboardRun: StandbyLeaderboardRun | null;
  standbyPreparationStatus: 'idle' | 'loading' | 'ready' | 'error';
  queuedRankedStart: boolean;
  leaderboardVerification: 'idle' | 'submitting' | 'verified' | 'error';
  leaderboardResult: VerifiedLeaderboardResult | null;
  startError: string | null;
  
  finishReason: 'time_up' | 'aborted' | null;
  
  // Actions
  startGame: (
    duration?: number,
    settings?: GameSettings,
    targetCategory?: Category,
    context?: GameStartContext,
  ) => Promise<void>;
  startUnrankedGame: (duration?: number, settings?: GameSettings, targetCategory?: Category) => void;
  warmLeaderboardRun: () => Promise<void>;
  invalidateLeaderboardStandby: () => void;
  startPreparedLeaderboardRun: (settings: GameSettings) => boolean;
  activateLeaderboardRun: (runId: string) => Promise<boolean>;
  verifyLeaderboardRun: () => Promise<void>;
  submitAnswer: (answer: string) => void;
  resetGame: () => void;
  tick: () => void;
  skipQuestion: () => void;
  incrementMistakes: () => void;
  endGame: () => void;
}

let standbyPreparationPromise: Promise<void> | null = null;
const activationPromises = new Map<string, Promise<boolean>>();

const leaderboardOwnerKey = () => useUserStore.getState().user?.id ?? 'guest';

const isUsableStandby = (
  standby: StandbyLeaderboardRun | null,
  ownerKey = leaderboardOwnerKey(),
): standby is StandbyLeaderboardRun => Boolean(
  standby
  && standby.ownerKey === ownerKey
  && Date.parse(standby.preparedExpiresAt) - Date.now() >= LEADERBOARD_STANDBY_MIN_VALIDITY_MS
  && standby.questions.length === 300
  && standby.questions.every((question, index) => question.questionIndex === index),
);

const wait = (milliseconds: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, milliseconds);
});

export const useGameStore = create<GameState>((set, get) => ({
  status: 'idle',
  score: 0,
  timeLeft: 120,
  duration: 120,
  currentQuestion: null,
  gameHistory: [],
  skipsCount: 0,
  mistakes: 0,
  settings: DEFAULT_SETTINGS,
  targetCategory: null,
  mode: 'solo',
  seed: null,
  endsAt: null,
  randomSource: Math.random,
  leaderboardRun: null,
  standbyLeaderboardRun: null,
  standbyPreparationStatus: 'idle',
  queuedRankedStart: false,
  leaderboardVerification: 'idle',
  leaderboardResult: null,
  startError: null,
  finishReason: null,

  warmLeaderboardRun: async () => {
    const ownerKey = leaderboardOwnerKey();
    if (isUsableStandby(get().standbyLeaderboardRun, ownerKey)) {
      if (get().standbyPreparationStatus !== 'ready') set({ standbyPreparationStatus: 'ready' });
      return;
    }
    if (standbyPreparationPromise) return standbyPreparationPromise;

    set({ standbyLeaderboardRun: null, standbyPreparationStatus: 'loading' });
    standbyPreparationPromise = (async () => {
      try {
        const accessToken = useUserStore.getState().session?.access_token;
        const prepared = await prepareLeaderboardRun(accessToken);
        if (leaderboardOwnerKey() !== ownerKey || !isUsableStandby({ ...prepared, ownerKey }, ownerKey)) {
          throw new Error('Could not prepare this run. Please try again.');
        }
        set({
          standbyLeaderboardRun: { ...prepared, ownerKey },
          standbyPreparationStatus: 'ready',
        });
      } catch (error) {
        set({ standbyPreparationStatus: 'error' });
        throw error;
      } finally {
        standbyPreparationPromise = null;
      }
    })();

    return standbyPreparationPromise;
  },

  invalidateLeaderboardStandby: () => {
    set({
      standbyLeaderboardRun: null,
      standbyPreparationStatus: 'idle',
      queuedRankedStart: false,
    });
  },

  startPreparedLeaderboardRun: (settings) => {
    const prepared = get().standbyLeaderboardRun;
    if (!isUsableStandby(prepared)) return false;
    const first = prepared.questions[0];
    if (!first) return false;

    const localStartsAt = Date.now();
    const run: ActiveLeaderboardRunState = {
      runId: prepared.runId,
      runToken: prepared.runToken,
      questions: prepared.questions,
      currentIndex: 0,
      transcript: [],
      startedAt: localStartsAt,
      activationDeadline: localStartsAt + LEADERBOARD_ACTIVATION_RECOVERY_MS,
      activationStatus: 'pending',
    };

    set({
      status: 'playing', score: 0, timeLeft: 120, duration: 120,
      currentQuestion: rankedQuestion(first), gameHistory: [], skipsCount: 0, mistakes: 0,
      settings, targetCategory: null, mode: 'solo', seed: null,
      endsAt: localStartsAt + LEADERBOARD_DURATION_MS,
      randomSource: Math.random, finishReason: null,
      leaderboardRun: run,
      standbyLeaderboardRun: null,
      standbyPreparationStatus: 'idle',
      queuedRankedStart: false,
      leaderboardVerification: 'idle', leaderboardResult: null, startError: null,
    });

    void get().activateLeaderboardRun(run.runId);
    void get().warmLeaderboardRun().catch(() => undefined);
    return true;
  },

  activateLeaderboardRun: async (runId) => {
    const existing = activationPromises.get(runId);
    if (existing) return existing;

    const activation = (async () => {
      let attempt = 0;
      while (true) {
        const run = get().leaderboardRun;
        if (!run || run.runId !== runId) return false;
        if (run.activationStatus === 'active') return true;
        if (Date.now() > run.activationDeadline) {
          set((state) => state.leaderboardRun?.runId === runId ? {
            leaderboardRun: { ...state.leaderboardRun, activationStatus: 'error' },
          } : {});
          return false;
        }

        const delay = ACTIVATION_RETRY_DELAYS_MS[Math.min(attempt, ACTIVATION_RETRY_DELAYS_MS.length - 1)];
        if (delay > 0) await wait(delay);
        const current = get().leaderboardRun;
        if (!current || current.runId !== runId) return false;

        try {
          const begun = await beginLeaderboardRun(
            { runId: current.runId, runToken: current.runToken },
            new Date(current.startedAt).toISOString(),
          );
          const serverDuration = Date.parse(begun.endsAt) - Date.parse(begun.startsAt);
          if (!Number.isFinite(serverDuration) || serverDuration !== LEADERBOARD_DURATION_MS) {
            throw new Error('Could not start this run. Please try again.');
          }
          set((state) => state.leaderboardRun?.runId === runId ? {
            leaderboardRun: { ...state.leaderboardRun, activationStatus: 'active' },
          } : {});
          return true;
        } catch {
          attempt += 1;
        }
      }
    })().finally(() => {
      activationPromises.delete(runId);
    });

    activationPromises.set(runId, activation);
    return activation;
  },

  startGame: async (
    duration = 120,
    settings = DEFAULT_SETTINGS,
    targetCategory: Category | null = null,
    context: GameStartContext = {},
  ) => {
    const isProtectedCandidate = (context.mode ?? 'solo') === 'solo'
      && duration === 120
      && !targetCategory
      && context.seed === undefined
      && isDefaultSettings(settings);

    if (isProtectedCandidate) {
      set({ queuedRankedStart: true, startError: null });
      if (get().startPreparedLeaderboardRun(settings)) return;
      try {
        await get().warmLeaderboardRun();
        if (get().queuedRankedStart) get().startPreparedLeaderboardRun(settings);
        return;
      } catch (error) {
        set({
          queuedRankedStart: false,
          startError: error instanceof Error ? error.message : 'Could not prepare a ranked run.',
        });
        return;
      }
    }

    const randomSource = context.seed === undefined ? Math.random : createSeededRandom(context.seed);
    const endsAt = context.endsAt ?? Date.now() + duration * 1000;
    set({
      status: 'playing', score: 0, timeLeft: duration, duration,
      currentQuestion: generateQuestion(settings, targetCategory || undefined, randomSource),
      gameHistory: [], skipsCount: 0, mistakes: 0, settings, targetCategory,
      mode: context.mode ?? 'solo', seed: context.seed ?? null, endsAt, randomSource,
      finishReason: null, leaderboardRun: null, leaderboardVerification: 'idle',
      leaderboardResult: null, startError: null,
    });
  },

  startUnrankedGame: (duration = 120, settings = DEFAULT_SETTINGS, targetCategory?: Category) => {
    const randomSource = Math.random;
    const endsAt = Date.now() + duration * 1000;

    set({
      status: 'playing',
      score: 0,
      timeLeft: duration,
      duration: duration,
      currentQuestion: generateQuestion(settings, targetCategory || undefined, randomSource),
      gameHistory: [],
      skipsCount: 0,
      mistakes: 0,
      settings: settings,
      targetCategory: targetCategory,
      mode: 'solo',
      seed: null,
      endsAt,
      randomSource,
      finishReason: null,
      leaderboardRun: null,
      queuedRankedStart: false,
      leaderboardVerification: 'idle',
      leaderboardResult: null,
      startError: null,
    });
  },

  verifyLeaderboardRun: async () => {
    const state = get();
    if (!state.leaderboardRun || state.finishReason !== 'time_up'
      || state.leaderboardVerification === 'submitting'
      || state.leaderboardVerification === 'verified') return;
    set({ leaderboardVerification: 'submitting' });
    try {
      const activated = await get().activateLeaderboardRun(state.leaderboardRun.runId);
      if (!activated) throw new Error('Could not verify your score. Please try again.');
      const run = get().leaderboardRun;
      if (!run || run.runId !== state.leaderboardRun.runId) return;
      const verified = await submitLeaderboardRun(run, run.transcript);
      let claimed = false;
      if (verified.eligible) {
        const session = useUserStore.getState().session;
        if (session?.access_token) {
          try {
            await useUserStore.getState().claimVerifiedLeaderboardRun(run);
            claimed = true;
          } catch {
            useUserStore.getState().addPendingLeaderboardRun(run);
          }
        } else {
          useUserStore.getState().addPendingLeaderboardRun(run);
        }
      }
      set({
        leaderboardVerification: 'verified',
        leaderboardResult: { ...verified, claimed },
      });
    } catch (error) {
      set({
        leaderboardVerification: 'error',
        startError: error instanceof Error ? error.message : 'Could not verify this run.',
      });
    }
  },

  incrementMistakes: () => {
    set((state) => ({ mistakes: state.mistakes + 1 }));
  },

  submitAnswer: (answer: string) => {
    const { currentQuestion, score, gameHistory, settings, targetCategory, mistakes, randomSource, leaderboardRun } = get();
    if (!currentQuestion) return;

    const isCorrect = checkAnswer(currentQuestion, answer);
    const timeTaken = Date.now() - currentQuestion.startTime;

    const nextRun = leaderboardRun ? appendRankedAction(leaderboardRun, {
      questionIndex: leaderboardRun.currentIndex,
      type: 'answered',
      answer: Number.parseInt(answer, 10),
      elapsedMs: rankedElapsed(get()),
      mistakes,
    }) : null;
    set({
      score: isCorrect ? score + 1 : score,
      gameHistory: [
        ...gameHistory,
        {
          question: currentQuestion,
          timeTaken,
          answerGiven: answer,
          isCorrect,
          timestamp: Date.now(),
          mistakes,
        },
      ],
      mistakes: 0, // Reset for next question
      currentQuestion: nextRun
        ? nextRankedQuestion(nextRun)
        : generateQuestion(settings, targetCategory || undefined, randomSource),
      ...(nextRun ? { leaderboardRun: nextRun } : {}),
    });
  },

  skipQuestion: () => {
    const { currentQuestion, gameHistory, skipsCount, settings, targetCategory, mistakes, randomSource, leaderboardRun } = get();
    if (!currentQuestion) return;
    
    const timeTaken = Date.now() - currentQuestion.startTime;
    
    const nextRun = leaderboardRun ? appendRankedAction(leaderboardRun, {
      questionIndex: leaderboardRun.currentIndex,
      type: 'skipped',
      elapsedMs: rankedElapsed(get()),
      mistakes,
    }) : null;
    set({
      skipsCount: skipsCount + 1,
      gameHistory: [
        ...gameHistory,
        {
          question: currentQuestion,
          timeTaken,
          answerGiven: 'SKIPPED',
          isCorrect: false,
          timestamp: Date.now(),
          mistakes,
        }
      ],
      mistakes: 0, // Reset for next question
      currentQuestion: nextRun
        ? nextRankedQuestion(nextRun)
        : generateQuestion(settings, targetCategory || undefined, randomSource),
      ...(nextRun ? { leaderboardRun: nextRun } : {}),
    });
  },

  resetGame: () => {
    set({
      status: 'idle',
      score: 0,
      timeLeft: 120,
      currentQuestion: null,
      gameHistory: [],
      skipsCount: 0,
      targetCategory: null,
      mode: 'solo',
      seed: null,
      endsAt: null,
      randomSource: Math.random,
      finishReason: null,
      leaderboardRun: null,
      queuedRankedStart: false,
      leaderboardVerification: 'idle',
      leaderboardResult: null,
      startError: null,
    });
  },

  tick: () => {
    const { status, endsAt } = get();
    if (status !== 'playing') return;

    const timeLeft = endsAt
      ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))
      : Math.max(0, get().timeLeft - 1);

    if (timeLeft === 0) {
      set({ status: 'finished', timeLeft: 0, finishReason: 'time_up' });
    } else {
      set({ timeLeft });
    }
  },

  endGame: () => {
    set({ status: 'finished', timeLeft: 0, finishReason: 'aborted' });
  },
}));

type ActiveLeaderboardRun = NonNullable<GameState['leaderboardRun']>;

const rankedQuestion = (prompt: RankedQuestionPrompt): Question => ({
  id: `ranked-${prompt.questionIndex}`,
  num1: prompt.num1,
  num2: prompt.num2,
  operation: prompt.operation,
  answer: calculateAnswer(prompt.num1, prompt.num2, prompt.operation),
  startTime: Date.now(),
  categories: categorizeQuestion(prompt.num1, prompt.num2, prompt.operation),
});

const appendRankedAction = (
  run: ActiveLeaderboardRun,
  action: LeaderboardTranscriptAction,
): ActiveLeaderboardRun => ({
  ...run,
  currentIndex: run.currentIndex + 1,
  transcript: [...run.transcript, action],
});

const nextRankedQuestion = (run: ActiveLeaderboardRun): Question | null => {
  const prompt = run.questions[run.currentIndex];
  return prompt ? rankedQuestion(prompt) : null;
};

const rankedElapsed = (state: GameState): number =>
  Math.max(0, Math.min(120_000, Date.now() - (state.leaderboardRun?.startedAt ?? Date.now())));
