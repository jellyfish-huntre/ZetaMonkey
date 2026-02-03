import { create } from 'zustand';
import { generateQuestion, checkAnswer, type Question, type GameSettings, type Category, DEFAULT_SETTINGS } from '../lib/mathEngine';

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
  
  finishReason: 'time_up' | 'aborted' | null;
  
  // Actions
  startGame: (duration?: number, settings?: GameSettings, targetCategory?: Category) => void;
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
  finishReason: null,

  startGame: (duration = 120, settings = DEFAULT_SETTINGS, targetCategory: Category | null = null) => {
    set({
      status: 'playing',
      score: 0,
      timeLeft: duration,
      duration: duration,
      currentQuestion: generateQuestion(settings, targetCategory || undefined),
      gameHistory: [],
      skipsCount: 0,
      mistakes: 0,
      settings: settings,
      targetCategory: targetCategory,
      finishReason: null,
    });
  },

  incrementMistakes: () => {
    set((state) => ({ mistakes: state.mistakes + 1 }));
  },

  submitAnswer: (answer: string) => {
    const { currentQuestion, score, gameHistory, settings, targetCategory, mistakes } = get();
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
      currentQuestion: generateQuestion(settings, targetCategory || undefined),
    });
  },

  skipQuestion: () => {
    const { currentQuestion, gameHistory, skipsCount, settings, targetCategory, mistakes } = get();
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
      currentQuestion: generateQuestion(settings, targetCategory || undefined),
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
      finishReason: null,
    });
  },

  tick: () => {
    const { timeLeft, status } = get();
    if (status !== 'playing') return;

    if (timeLeft <= 1) {
      set({ status: 'finished', timeLeft: 0, finishReason: 'time_up' });
    } else {
      set({ timeLeft: timeLeft - 1 });
    }
  },

  endGame: () => {
    set({ status: 'finished', timeLeft: 0, finishReason: 'aborted' });
  },
}));
