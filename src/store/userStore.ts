import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface UserState {
  highScore: number;
  totalGames: number;
  totalQuestionsAnswered: number;
  theme: 'dark' | 'light' | 'midnight';
  user: User | null;
  session: Session | null;
  
  // Actions
  updateHighScore: (score: number) => Promise<void>;
  incrementGamesTerm: (questionsCount: number) => Promise<void>;
  setTheme: (theme: 'dark' | 'light' | 'midnight') => Promise<void>;
  
  // Auth Actions
  signIn: (email: string, pass: string) => Promise<void>;
  signUp: (email: string, pass: string, username: string) => Promise<void>;
  signOut: () => Promise<void>;
  checkSession: () => Promise<void>;
  
  // History Actions
  recordGame: (score: number, qpm: number, accuracy: number) => Promise<void>;
  fetchHistory: () => Promise<any[]>;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      highScore: 0,
      totalGames: 0,
      totalQuestionsAnswered: 0,
      theme: 'dark',
      user: null,
      session: null,

      updateHighScore: async (score) => {
        const { highScore, user } = get();
        const newHighScore = Math.max(highScore, score);
        set({ highScore: newHighScore });

        if (user && newHighScore > highScore) {
           const { error } = await supabase
             .from('profiles')
             .upsert({ 
               id: user.id,
               high_score: newHighScore,
               updated_at: new Date().toISOString()
             }, { onConflict: 'id' });
             
           if (error) console.error('Error updating high score:', error);
        }
      },

      incrementGamesTerm: async (questionsCount) => {
        const { totalGames, totalQuestionsAnswered, user } = get();
        const newTotal = totalGames + 1;
        const newQuestions = (totalQuestionsAnswered || 0) + questionsCount;
        
        set({
          totalGames: newTotal,
          totalQuestionsAnswered: newQuestions
        });
        
        if (user) {
          const { error } = await supabase
            .from('profiles')
            .upsert({ 
              id: user.id,
              total_games: newTotal,
              updated_at: new Date().toISOString()
            }, { onConflict: 'id' });
            
          if (error) console.error('Error updating total games:', error);
        }
      },

      setTheme: async (theme) => {
        set({ theme });
        document.documentElement.setAttribute('data-theme', theme);
        const { user } = get();
        if (user) {
           await supabase.from('profiles').upsert({ id: user.id, theme }, { onConflict: 'id' });
        }
      },

      signIn: async (email, password) => {
         const { highScore: localHighScore, theme: localTheme } = get();
         const { data, error } = await supabase.auth.signInWithPassword({ email, password });
         if (error) throw error;
         
         if (data.user && data.session) {
            set({ user: data.user, session: data.session });
            
            // Try to fetch profile
            let { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', data.user.id)
              .single();
              
            // If profile doesn't exist, create it (handles existing users before trigger)
            if (profileError && profileError.code === 'PGRST116') {
               const newProfile = {
                 id: data.user.id,
                 username: data.user.user_metadata.username || email.split('@')[0],
                 high_score: localHighScore,
                 total_games: 0,
                 theme: localTheme
               };
               const { data: created, error: createError } = await supabase
                 .from('profiles')
                 .insert(newProfile)
                 .select()
                 .single();
               
               if (createError) console.error('Error creating profile:', createError);
               profile = created;
            }

            if (profile) {
               const cloudHighScore = profile.high_score || 0;
               const finalHighScore = Math.max(localHighScore, cloudHighScore);
               
               set({
                 highScore: finalHighScore,
                 totalGames: profile.total_games || 0,
                 theme: profile.theme || localTheme
               });
               
               document.documentElement.setAttribute('data-theme', profile.theme || localTheme);

               if (localHighScore > cloudHighScore) {
                 await supabase
                   .from('profiles')
                   .update({ high_score: localHighScore })
                   .eq('id', data.user.id);
               }
            }
         }
      },

      signUp: async (email, password, username) => {
         const { highScore: localHighScore, theme: localTheme } = get();
         const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
               data: { username }
            }
         });
         
         if (error) throw error;
         
         if (data.user && data.session) {
             set({ user: data.user, session: data.session });
             // Ensure profile exists immediately if trigger is slow or not set
             await supabase.from('profiles').upsert({
               id: data.user.id,
               username,
               high_score: localHighScore,
               theme: localTheme,
               total_games: 0
             }, { onConflict: 'id' });
         } else if (data.user && !data.session) {
             throw new Error("Please check your email to confirm your account.");
         }
      },

      signOut: async () => {
         await supabase.auth.signOut();
         set({ user: null, session: null, highScore: 0, totalGames: 0, totalQuestionsAnswered: 0 });
      },

      checkSession: async () => {
         const { data } = await supabase.auth.getSession();
         if (data.session) {
            set({ user: data.session.user, session: data.session });
            
            const { data: profile, error } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', data.session.user.id)
              .single();
              
            if (profile) {
               set({
                 highScore: profile.high_score || 0,
                 totalGames: profile.total_games || 0,
                 theme: profile.theme || 'dark'
               });
               document.documentElement.setAttribute('data-theme', profile.theme || 'dark');
            } else if (error && error.code === 'PGRST116') {
               // Handle missing profile on session check (existing users before trigger)
               const newProfile = {
                 id: data.session.user.id,
                 username: data.session.user.user_metadata?.username || data.session.user.email?.split('@')[0],
                 theme: 'dark',
                 total_games: 0,
                 high_score: 0
               };
               await supabase.from('profiles').upsert(newProfile, { onConflict: 'id' });
            }
         }
      },

      recordGame: async (score, qpm, accuracy) => {
        const { user } = get();
        if (user) {
          const { error } = await supabase.from('games').insert({
            user_id: user.id,
            score,
            qpm,
            accuracy
          });
          
          if (error) {
            console.error('Error recording game:', error);
            // Suggest running the SQL if table is missing
            if (error.code === 'PGRST205' || error.code === '42P01') {
              console.warn('The "games" table might be missing. Please run game_history_schema.sql in Supabase.');
            }
          }
        }
      },

      fetchHistory: async () => {
        const { user } = get();
        if (!user) return [];
        
        const { data, error } = await supabase
          .from('games')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);
          
        if (error) {
          console.error('Error fetching history:', error);
          return [];
        }
        return data || [];
      }
    }),
    {
      name: 'zetamonkey-storage',
      partialize: (state) => ({ 
        highScore: state.highScore, 
        theme: state.theme,
      }), 
    }
  )
);
