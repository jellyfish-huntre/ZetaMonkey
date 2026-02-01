import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_SETTINGS, type GameSettings } from '../lib/mathEngine';

interface SettingsState {
  settings: GameSettings;
  updateSettings: (newSettings: Partial<GameSettings>) => void;
  resetToDefault: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      updateSettings: (newSettings) => 
        set((state) => ({
          settings: { ...state.settings, ...newSettings }
        })),
      resetToDefault: () => set({ settings: DEFAULT_SETTINGS }),
    }),
    {
      name: 'zetamonkey-settings',
    }
  )
);
