import { create } from 'zustand';
import { generateQuestion, checkAnswer, type Question, type GameSettings, DEFAULT_SETTINGS } from '../lib/mathEngine';

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
  }>;
  skipsCount: number;
  settings: GameSettings;
  
  finishReason: 'time_up' | 'aborted' | null;
  
  // Actions
  startGame: (duration?: number, settings?: GameSettings) => void;
  submitAnswer: (answer: string) => void;
  resetGame: () => void;
  tick: () => void;
  skipQuestion: () => void;
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
  settings: DEFAULT_SETTINGS,
  finishReason: null,

  startGame: (duration = 120, settings = DEFAULT_SETTINGS) => {
    set({
      status: 'playing',
      score: 0,
      timeLeft: duration,
      duration: duration,
      currentQuestion: generateQuestion(settings),
      gameHistory: [],
      skipsCount: 0,
      settings: settings,
      finishReason: null,
    });
  },

  submitAnswer: (answer: string) => {
    const { currentQuestion, score, gameHistory, settings } = get();
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
        },
      ],
      currentQuestion: generateQuestion(settings),
    });
  },

  skipQuestion: () => {
    const { currentQuestion, gameHistory, skipsCount, settings } = get();
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
        }
      ],
      currentQuestion: generateQuestion(settings),
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
