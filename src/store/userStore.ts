import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserState {
  highScore: number;
  totalGames: number;
  totalQuestionsAnswered: number;
  theme: 'dark' | 'light' | 'midnight';
  
  // Actions
  updateHighScore: (score: number) => void;
  incrementGamesTerm: (questionsCount: number) => void;
  setTheme: (theme: 'dark' | 'light' | 'midnight') => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      highScore: 0,
      totalGames: 0,
      totalQuestionsAnswered: 0,
      theme: 'dark',

      updateHighScore: (score) => set((state) => ({
        highScore: Math.max(state.highScore, score)
      })),

      incrementGamesTerm: (questionsCount) => set((state) => ({
        totalGames: state.totalGames + 1,
        totalQuestionsAnswered: state.totalQuestionsAnswered + questionsCount
      })),

      setTheme: (theme) => {
        set({ theme });
        // Update document attribute for CSS
        document.documentElement.setAttribute('data-theme', theme);
      },
    }),
    {
      name: 'zetamonkey-storage',
    }
  )
);
