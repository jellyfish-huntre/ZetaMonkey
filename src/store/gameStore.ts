import { create } from 'zustand';
import { generateQuestion, checkAnswer, type Question } from '../lib/mathEngine';

interface GameState {
  status: 'idle' | 'playing' | 'finished';
  score: number;
  timeLeft: number;
  duration: number; // usually 120s
  currentQuestion: Question | null;
  gameHistory: Array<{
    question: Question;
    timeTaken: number;
    answerGiven: string;
    isCorrect: boolean;
    timestamp: number;
  }>;
  
  // Actions
  startGame: (duration?: number) => void;
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

  startGame: (duration = 120) => {
    set({
      status: 'playing',
      score: 0,
      timeLeft: duration,
      duration: duration,
      currentQuestion: generateQuestion(),
      gameHistory: [],
    });
  },

  submitAnswer: (answer: string) => {
    const { currentQuestion, score, gameHistory } = get();
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
      currentQuestion: generateQuestion(),
    });
  },

  skipQuestion: () => {
    const { currentQuestion, gameHistory } = get();
    if (!currentQuestion) return;
    
    // Treat skip as incorrect or just skipped? usually just no points, but tracked.
    // We'll mark as incorrect for now or add a 'skipped' status later.
    const timeTaken = Date.now() - currentQuestion.startTime;
    
    set({
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
      currentQuestion: generateQuestion(),
    });
  },

  resetGame: () => {
    set({
      status: 'idle',
      score: 0,
      timeLeft: 120,
      currentQuestion: null,
      gameHistory: [],
    });
  },

  tick: () => {
    const { timeLeft, status } = get();
    if (status !== 'playing') return;

    if (timeLeft <= 1) {
      set({ status: 'finished', timeLeft: 0 });
    } else {
      set({ timeLeft: timeLeft - 1 });
    }
  },

  endGame: () => {
    set({ status: 'finished', timeLeft: 0 });
  },
}));
