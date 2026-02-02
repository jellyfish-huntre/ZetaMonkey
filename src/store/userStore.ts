import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface UserState {
  highScore: number;
  totalGames: number;
  totalQuestionsAnswered: number;
  theme: 'carbon' | 'classic' | 'nord' | 'light';
  user: User | null;
  session: Session | null;
  localQualifyingGames: Array<{ score: number; qpm: number; accuracy: number; timestamp: number }>;
  lastSyncedUserId: string | null;
  
  // Actions
  updateHighScore: (score: number) => Promise<void>;
  incrementGamesTerm: (questionsCount: number) => Promise<void>;
  setTheme: (theme: 'carbon' | 'classic' | 'nord' | 'light') => Promise<void>;
  
  // Auth Actions
  signIn: (email: string, pass: string) => Promise<void>;
  signUp: (email: string, pass: string, username: string) => Promise<void>;
  signOut: () => Promise<void>;
  checkSession: () => Promise<void>;
  
  // History Actions
  recordGame: (score: number, qpm: number, accuracy: number) => Promise<void>;
  fetchHistory: () => Promise<any[]>;

  fetchLeaderboard: (type?: 'all-time' | 'daily') => Promise<any[]>;
  submitLeaderboardScore: (score: number, qpm: number, accuracy: number) => Promise<void>;
  addLocalQualifyingGame: (score: number, qpm: number, accuracy: number) => void;
  syncGuestData: (userId: string, guestGames: number, guestQuestions: number) => Promise<void>;
}

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      highScore: 0,
      totalGames: 0,
      totalQuestionsAnswered: 0,
      theme: 'carbon',
      user: null,
      session: null,
      localQualifyingGames: [],
      lastSyncedUserId: null,

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
         const { highScore: localHighScore, theme: localTheme, totalGames: localTotalGames, totalQuestionsAnswered: localTotalQuestions } = get();
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
                 totalQuestionsAnswered: profile.total_questions || 0,
                  theme: profile.theme || localTheme,
                  lastSyncedUserId: data.user.id
               });
               
               document.documentElement.setAttribute('data-theme', profile.theme || localTheme);

               if (localHighScore > cloudHighScore) {
                 await supabase
                   .from('profiles')
                   .update({ high_score: localHighScore })
                   .eq('id', data.user.id);
               }
               
               // Sync data from guest session (use captured local guest stats)
               await get().syncGuestData(data.user.id, localTotalGames, localTotalQuestions);
            }
         }
      },

      signUp: async (email, password, username) => {
         const { highScore: localHighScore, theme: localTheme, totalGames: localTotalGames, totalQuestionsAnswered: localTotalQuestions } = get();
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
               total_games: localTotalGames,
               total_questions: localTotalQuestions
             }, { onConflict: 'id' });
                          // Sync data from guest session
              await get().syncGuestData(data.user.id, localTotalGames, localTotalQuestions);
              set({ lastSyncedUserId: data.user.id });
          } else if (data.user && !data.session) {
             throw new Error("Please check your email to confirm your account.");
         }
      },

      signOut: async () => {
         await supabase.auth.signOut();
         set({ user: null, session: null, highScore: 0, totalGames: 0, totalQuestionsAnswered: 0, lastSyncedUserId: null });
      },

      checkSession: async () => {
         const { data } = await supabase.auth.getSession();
         if (data.session) {
            // Capture current user state before potential updates
            const wasGuest = !get().user;
            const guestTotalGames = get().totalGames;
            const guestTotalQuestions = get().totalQuestionsAnswered;
            const guestHighScore = get().highScore;
            const guestTheme = get().theme;
            const lastSyncedId = get().lastSyncedUserId;
            const currentUserId = data.session.user.id;

            set({ user: data.session.user, session: data.session });
            
            const { data: profile, error } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', currentUserId)
              .single();
              
            if (profile) {
               // If we were a guest (user was null in store), sync local stats to cloud
               // BUT only if we haven't already synced for this user (check lastSyncedUserId)
               // This prevents double-counting on page reloads
               if (wasGuest && lastSyncedId !== currentUserId) {
                  await get().syncGuestData(currentUserId, guestTotalGames, guestTotalQuestions);
                  // After syncing, update the store with the *new* profile data (which now includes synced guest data)
                  const { data: updatedProfile } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', currentUserId)
                    .single();
                  if (updatedProfile) {
                    set({
                      highScore: Math.max(guestHighScore, updatedProfile.high_score || 0),
                      totalGames: updatedProfile.total_games || 0,
                      totalQuestionsAnswered: updatedProfile.total_questions || 0,
                      theme: updatedProfile.theme || guestTheme,
                      lastSyncedUserId: currentUserId
                    });
                    document.documentElement.setAttribute('data-theme', updatedProfile.theme || guestTheme);
                  }
               } else {
                  // User was already logged in OR just reloaded page
                  // Just refresh store from cloud to be safe
                  set({
                    highScore: profile.high_score || 0,
                    totalGames: profile.total_games || 0,
                    totalQuestionsAnswered: profile.total_questions || 0,
                    theme: profile.theme || 'carbon',
                    lastSyncedUserId: currentUserId
                  });
                  document.documentElement.setAttribute('data-theme', profile.theme || 'carbon');
               }
            } else if (error && error.code === 'PGRST116') {
               // Handle missing profile on session check (existing users before trigger)
               const newProfile = {
                 id: data.session.user.id,
                 username: data.session.user.user_metadata?.username || data.session.user.email?.split('@')[0],
                 theme: guestTheme,
                 total_games: guestTotalGames,
                 high_score: guestHighScore,
                 total_questions: guestTotalQuestions
               };
               await supabase.from('profiles').upsert(newProfile, { onConflict: 'id' });
               
               // Clear guest markers (effectively synced by upsert)
               set({ user: data.session.user, session: data.session });
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
      },

      fetchLeaderboard: async (type: 'all-time' | 'daily' = 'all-time') => {
        const { data, error } = await supabase.rpc('get_unique_leaderboard', {
          time_filter: type === 'daily' ? '24 hours' : null
        });
          
        if (error) {
          console.error('Error fetching leaderboard:', error);
          return [];
        }
        return data || [];
      },

      submitLeaderboardScore: async (score, qpm, accuracy) => {
        const { user } = get();
        if (!user) return;

        const { error } = await supabase.from('leaderboard').insert({
          user_id: user.id,
          username: user.user_metadata.username || user.email?.split('@')[0],
          score,
          qpm,
          accuracy
        });

        if (error) {
          console.error('Error submitting leaderboard score:', error);
        }
      },
      addLocalQualifyingGame: (score, qpm, accuracy) => {
        const { localQualifyingGames } = get();
        set({
          localQualifyingGames: [
            ...localQualifyingGames,
            { score, qpm, accuracy, timestamp: Date.now() }
          ]
        });
      },

      syncGuestData: async (userId: string, guestGames: number, guestQuestions: number) => {
        const { localQualifyingGames } = get();
        
        // 1. Sync stats (add INCREMENTS to cloud)
        const { data: profile } = await supabase
          .from('profiles')
          .select('total_games, total_questions, high_score, theme')
          .eq('id', userId)
          .single();

        if (profile) {
          // Sanitize insanely high numbers (bug fix)
          const cloudGames = (profile.total_games || 0) > 1000000 ? 0 : (profile.total_games || 0);
          const cloudQuestions = (profile.total_questions || 0) > 5000000 ? 0 : (profile.total_questions || 0);

          const newTotalGames = cloudGames + guestGames;
          const newTotalQuestions = cloudQuestions + guestQuestions;
          
          await supabase
            .from('profiles')
            .update({ 
               total_games: newTotalGames,
               total_questions: newTotalQuestions
            })
            .eq('id', userId);
            
          set({ 
            totalGames: newTotalGames,
            totalQuestionsAnswered: newTotalQuestions,
            highScore: profile.high_score || 0,
            theme: profile.theme || 'carbon'
          });
          document.documentElement.setAttribute('data-theme', profile.theme || 'carbon');
        }

        // 2. Sync leaderboard scores
        if (localQualifyingGames.length > 0) {
          for (const game of localQualifyingGames) {
            await get().submitLeaderboardScore(game.score, game.qpm, game.accuracy);
            await get().recordGame(game.score, game.qpm, game.accuracy);
          }
          set({ localQualifyingGames: [] });
        }
      }
    }),
    {
      name: 'zetamonkey-storage',
      partialize: (state) => ({ 
        highScore: state.highScore, 
        totalGames: state.totalGames,
        totalQuestionsAnswered: state.totalQuestionsAnswered,
        theme: state.theme,
        localQualifyingGames: state.localQualifyingGames,
        lastSyncedUserId: state.lastSyncedUserId,
      }), 
    }
  )
);
