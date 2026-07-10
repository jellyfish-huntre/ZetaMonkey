import { create } from 'zustand';
import {
  createSeededRandom,
  generateQuestion,
  checkAnswer,
  type Question,
  type GameSettings,
  type Category,
  type RandomSource,
  DEFAULT_SETTINGS,
} from '../lib/mathEngine';

export type GameMode = 'solo' | 'versus';

export interface GameStartContext {
  mode?: GameMode;
  seed?: number;
  endsAt?: number;
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
  
  finishReason: 'time_up' | 'aborted' | null;
  
  // Actions
  startGame: (
    duration?: number,
    settings?: GameSettings,
    targetCategory?: Category,
    context?: GameStartContext,
  ) => void;
  submitAnswer: (answer: string) => void;
  resetGame: () => void;
  tick: () => void;
  skipQuestion: () => void;
  incrementMistakes: () => void;
  endGame: () => void;
}

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
  finishReason: null,

  startGame: (
    duration = 120,
    settings = DEFAULT_SETTINGS,
    targetCategory: Category | null = null,
    context: GameStartContext = {},
  ) => {
    const randomSource = context.seed === undefined ? Math.random : createSeededRandom(context.seed);
    const endsAt = context.endsAt ?? Date.now() + duration * 1000;

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
      mode: context.mode ?? 'solo',
      seed: context.seed ?? null,
      endsAt,
      randomSource,
      finishReason: null,
    });
  },

  incrementMistakes: () => {
    set((state) => ({ mistakes: state.mistakes + 1 }));
  },

  submitAnswer: (answer: string) => {
    const { currentQuestion, score, gameHistory, settings, targetCategory, mistakes, randomSource } = get();
    if (!currentQuestion) return;

    const isCorrect = checkAnswer(currentQuestion, answer);
    const timeTaken = Date.now() - currentQuestion.startTime;

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
      currentQuestion: generateQuestion(settings, targetCategory || undefined, randomSource),
    });
  },

  skipQuestion: () => {
    const { currentQuestion, gameHistory, skipsCount, settings, targetCategory, mistakes, randomSource } = get();
    if (!currentQuestion) return;
    
    const timeTaken = Date.now() - currentQuestion.startTime;
    
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
      currentQuestion: generateQuestion(settings, targetCategory || undefined, randomSource),
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
