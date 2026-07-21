import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import {
  getUsernameValidationError,
  sanitizeUsernameForDisplay,
} from '../lib/usernameValidation';
import {
  isAllowedLeaderboardEntry,
} from '../lib/leaderboardValidation';
import type { User, Session } from '@supabase/supabase-js';
import { getCategoryLabel, type Category } from '../lib/mathUtils';
import {
  claimLeaderboardRun,
  type PendingLeaderboardRun,
} from '../lib/leaderboardRun';

export type LeaderboardFilter = 'all-time' | 'daily';
export const weaknessCacheKey = (userId: string, minQuestions = 3) => `${userId}:${minQuestions}`;

export interface WeaknessAnalysisResult {
  category: Category;
  avgTime: number;
  accuracy: number;
  totalQuestions: number;
}

export interface LeaderboardEntry {
  id: string;
  username: string;
  score: number;
  qpm: number;
  accuracy: number;
  created_at: string;
}

interface CachedWeaknessAnalysis {
  data: WeaknessAnalysisResult[];
  fetchedAt: number;
  stale: boolean;
}

interface CachedLeaderboard {
  entries: LeaderboardEntry[];
  fetchedAt: number;
  stale: boolean;
}

export interface FeedbackSubmission {
  type: 'general' | 'bug' | 'feature';
  message: string;
  email?: string;
}

interface UserState {
  highScore: number;
  totalGames: number;
  totalQuestionsAnswered: number;
  theme: 'carbon' | 'classic' | 'nord' | 'light';
  user: User | null;
  session: Session | null;
  pendingLeaderboardRuns: PendingLeaderboardRun[];
  weaknessAnalysisCache: Record<string, CachedWeaknessAnalysis>;
  leaderboardCache: Partial<Record<LeaderboardFilter, CachedLeaderboard>>;
  lastSyncedUserId: string | null;
  unsyncedGuestGames: number;
  unsyncedGuestQuestions: number;
  
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
  recordGame: (score: number, qpm: number, accuracy: number, history: any[], targetCategory?: string | null) => Promise<void>;
  fetchHistory: () => Promise<any[]>;
  fetchWeaknessAnalysis: (minQuestions?: number) => Promise<WeaknessAnalysisResult[]>;
  fetchMistakes: () => Promise<any[]>;
  fetchLeaderboard: (type?: LeaderboardFilter) => Promise<LeaderboardEntry[]>;
  invalidateWeaknessAnalysis: (userId?: string) => void;
  invalidateLeaderboard: () => void;
  submitFeedback: (feedback: FeedbackSubmission) => Promise<void>;
  addPendingLeaderboardRun: (run: PendingLeaderboardRun) => void;
  claimVerifiedLeaderboardRun: (run: PendingLeaderboardRun) => Promise<void>;
  claimPendingLeaderboardRuns: (accessToken: string) => Promise<void>;
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
      pendingLeaderboardRuns: [],
      weaknessAnalysisCache: {},
      leaderboardCache: {},
      lastSyncedUserId: null,
      unsyncedGuestGames: 0,
      unsyncedGuestQuestions: 0,

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
        const { totalGames, totalQuestionsAnswered, unsyncedGuestGames, unsyncedGuestQuestions, user } = get();
        const newTotal = totalGames + 1;
        const newQuestions = (totalQuestionsAnswered || 0) + questionsCount;
        
        const updates: any = {
          totalGames: newTotal,
          totalQuestionsAnswered: newQuestions
        };

        if (!user) {
          updates.unsyncedGuestGames = (unsyncedGuestGames || 0) + 1;
          updates.unsyncedGuestQuestions = (unsyncedGuestQuestions || 0) + questionsCount;
        }
        
        set(updates);
        
        if (user) {
          const { error } = await supabase
            .from('profiles')
            .upsert({ 
              id: user.id,
              total_games: newTotal,
              total_questions: newQuestions,
              updated_at: new Date().toISOString()
            }, { onConflict: 'id' });
            
          if (error) console.error('Error updating stats:', error);
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
               await get().claimPendingLeaderboardRuns(data.session.access_token);
            }
         }
      },

      signUp: async (email, password, username) => {
         const normalizedUsername = username.trim();
         const usernameError = getUsernameValidationError(normalizedUsername);
         if (usernameError) throw new Error(usernameError);

         const { highScore: localHighScore, theme: localTheme, totalGames: localTotalGames, totalQuestionsAnswered: localTotalQuestions } = get();
         const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
               data: { username: normalizedUsername }
            }
         });
         
         if (error) throw error;
         
         if (data.user && data.session) {
             set({ user: data.user, session: data.session });
             // Ensure profile exists immediately if trigger is slow or not set
             await supabase.from('profiles').upsert({
               id: data.user.id,
               username: normalizedUsername,
               high_score: localHighScore,
               theme: localTheme,
               total_games: localTotalGames,
               total_questions: localTotalQuestions
             }, { onConflict: 'id' });
                          // Sync data from guest session
              await get().syncGuestData(data.user.id, localTotalGames, localTotalQuestions);
              await get().claimPendingLeaderboardRuns(data.session.access_token);
              set({ lastSyncedUserId: data.user.id });
          } else if (data.user && !data.session) {
             throw new Error("Please check your email to confirm your account.");
         }
      },

      signOut: async () => {
         await supabase.auth.signOut();
         set({ user: null, session: null, highScore: 0, totalGames: 0, totalQuestionsAnswered: 0, lastSyncedUserId: null, unsyncedGuestGames: 0, unsyncedGuestQuestions: 0, weaknessAnalysisCache: {} });
      },

      checkSession: async () => {
         const { data } = await supabase.auth.getSession();
         if (data.session) {
            const wasGuest = !get().user;
            const guestHighScore = get().highScore;
            const guestTheme = get().theme;
            const pendingGuestGames = get().unsyncedGuestGames || 0;
            const pendingGuestQuestions = get().unsyncedGuestQuestions || 0;
            const currentUserId = data.session.user.id;

            set({ user: data.session.user, session: data.session });
            
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', currentUserId)
              .single();
              
            if (profile) {
               if (wasGuest && pendingGuestGames > 0) {
                  // Merge guest stats into profile
                  await get().syncGuestData(currentUserId, pendingGuestGames, pendingGuestQuestions);
                  
                  // Refresh profile after merge
                  const { data: refreshed } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', currentUserId)
                    .single();
                  
                  if (refreshed) {
                    set({
                      highScore: Math.max(guestHighScore, refreshed.high_score || 0),
                      totalGames: refreshed.total_games || 0,
                      totalQuestionsAnswered: refreshed.total_questions || 0,
                      theme: refreshed.theme || guestTheme,
                      lastSyncedUserId: currentUserId,
                      unsyncedGuestGames: 0,
                      unsyncedGuestQuestions: 0
                    });
                  }
               } else {
                  // Standard restore
                  let finalGames = profile.total_games || 0;
                  let finalQuestions = profile.total_questions || 0;

                  // AUTO-REPAIR: If stats are clearly corrupted (over 1M), recalculate from history
                  if (finalGames > 1000000) {
                    const { data: history } = await supabase
                      .from('games')
                      .select('score')
                      .eq('user_id', currentUserId);
                    
                    if (history) {
                      finalGames = history.length;
                      finalQuestions = history.reduce((acc: number, g: any) => acc + (g.score || 0), 0);
                      
                      await supabase
                        .from('profiles')
                        .update({ 
                          total_games: finalGames,
                          total_questions: finalQuestions 
                        })
                        .eq('id', currentUserId);
                    }
                  }

                  set({
                    highScore: profile.high_score || 0,
                    totalGames: finalGames,
                    totalQuestionsAnswered: finalQuestions,
                    theme: profile.theme || 'carbon',
                    lastSyncedUserId: currentUserId,
                    unsyncedGuestGames: 0,
                    unsyncedGuestQuestions: 0
                  });
               }
               document.documentElement.setAttribute('data-theme', get().theme);
            } else {
               // Create profile if missing
               const newProfile = {
                 id: currentUserId,
                 username: data.session.user.user_metadata?.username || data.session.user.email?.split('@')[0],
                 theme: guestTheme,
                 total_games: pendingGuestGames,
                 high_score: guestHighScore,
                 total_questions: pendingGuestQuestions
               };
               await supabase.from('profiles').upsert(newProfile, { onConflict: 'id' });
               set({ unsyncedGuestGames: 0, unsyncedGuestQuestions: 0 });
            }
            await get().claimPendingLeaderboardRuns(data.session.access_token);
         }
      },

      recordGame: async (score, qpm, accuracy, history, targetCategory = null) => {
        const { user } = get();
        if (user) {
          // 1. Record the game summary
          const { data: gameData, error: gameError } = await supabase
            .from('games')
            .insert({
              user_id: user.id,
              score,
              qpm,
              accuracy,
              target_category: targetCategory
            })
            .select()
            .single();
          
          if (gameError) {
            console.error('Error recording game:', gameError);
          }

          // 2. Record individual question responses (only if game was recorded successfully)
          if (gameData && history.length > 0) {
            const responses: any[] = [];
            
            history.forEach(h => {
              // Now that we have multiple categories, we record one entry per category
              // so the weakness analysis can aggregate by category naturally.
              const catArray = h.question.categories || [h.question.category || 'other'];
              
              catArray.forEach((cat: string) => {
                responses.push({
                  user_id: user.id,
                  num1: h.question.num1,
                  num2: h.question.num2,
                  operation: h.question.operation,
                  category: cat,
                  is_correct: h.isCorrect,
                  mistakes: h.mistakes || 0,
                  time_taken: h.timeTaken
                });
              });
            });

            // Insert in batches of 100 to be safe
            for (let i = 0; i < responses.length; i += 100) {
              const batch = responses.slice(i, i + 100);
              const { error: respError } = await supabase
                .from('question_responses')
                .insert(batch);
              if (respError) console.error('Error recording question responses:', respError);
            }
          }

          if (gameData) get().invalidateWeaknessAnalysis(user.id);
        }
      },

      fetchWeaknessAnalysis: async (minQuestions = 3) => {
        const { user } = get();
        if (!user) return [];
        const cacheKey = weaknessCacheKey(user.id, minQuestions);

        // Fetch last 500 responses to identify trends
        const { data, error } = await supabase
          .from('question_responses')
          .select('category, is_correct, time_taken, num1, num2, operation, mistakes')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(500);

        if (error || !data) {
          console.error('Error fetching weakness analysis:', error);
          return get().weaknessAnalysisCache[cacheKey]?.data || [];
        }

        // Aggregate by dynamic traits and categories
        const analysis: Record<string, { count: number; mistakes: number; totalTime: number }> = {};
        
        const addStat = (trait: string, isCorrect: boolean, timeTaken: number, mistakes: number) => {
          if (!analysis[trait]) {
            analysis[trait] = { count: 0, mistakes: 0, totalTime: 0 };
          }
          const s = analysis[trait];
          s.count++;
          // If not correct (gave up), that's a failure.
          // ALSO add any retry mistakes.
          // Effective mistakes = (did they fail safely? 1 : 0) + retry_mistakes
          if (!isCorrect) s.mistakes++;
          s.mistakes += mistakes;
          
          s.totalTime += timeTaken;
        };

        data.forEach(resp => {
          const mistakes = resp.mistakes || 0;
          // Aggregation is now purely by the category column.
          // Since we record multiple rows for multi-category questions, 
          // this naturally populates each specific bucket.
          addStat(resp.category, resp.is_correct, resp.time_taken, mistakes);
        });

        // Convert to array and calculate metrics
        const results = Object.entries(analysis)
          .map(([category, stats]) => ({
            category: category as Category,
            avgTime: stats.totalTime / stats.count,
            accuracy: (stats.count / (stats.count + stats.mistakes)) * 100, // "Effective Accuracy"
            totalQuestions: stats.count
          }))
          .filter(a => {
            // FILTER: Don't show "weaknesses" that aren't actually weaknesses
            if (a.totalQuestions < minQuestions) return false;
            
            // If accuracy is nearly perfect (> 98%) AND speed is good (< 2.5s), it's not a weakness
            if (a.accuracy >= 98 && a.avgTime < 2500) return false;
            
            return true;
          })
          .sort((a, b) => {
            // SORT: Accuracy is the most important (ascending - lowest accuracy first)
            if (Math.abs(a.accuracy - b.accuracy) > 5) { // Only prioritize if > 5% diff
              return a.accuracy - b.accuracy;
            }
            // Then Average Time (descending - highest time first)
            return b.avgTime - a.avgTime;
          });

        // Deduplication: Map categories to their labels and keep only the worst-performing one for identical labels
        // e.g. "mult_11" -> "Multiplying by 11", "* 11" -> "Multiplying by 11"
        // We keep the one with lower accuracy or higher time.
        
        // However, since we can't easily import `getCategoryLabel` here without circular deps or making it pure,
        // we'll rely on the fact that labels are consistent.
        // Actually `mathUtils` is pure, so importing it is fine.
        
        // Wait, I can't assume `getCategoryLabel` is available here, but I can implement a quick check or just use the raw category 
        // string comparison if they were identical. But they aren't ("mult_11" vs "* 11").
        // I'll skip complex label-based dedupe inside the store to avoid import cycles if any.
        // Instead, I'll filter out dynamic traits if the broad category covers it? 
        // No, better to leave it and let the UI handle display dedupe if needed, 
        // OR just perform simple cleanup: if I have "mult_X" and "* X", prefer "mult_X".
        


        // Deduplication: Map categories to their labels and keep only the worst-performing one for identical labels
        const dedupedResults = new Map<string, typeof results[0]>();

        results.forEach(result => {
          const label = getCategoryLabel(result.category);
          
          if (!dedupedResults.has(label)) {
            dedupedResults.set(label, result);
            return;
          }

          const existing = dedupedResults.get(label)!;
          
          // Compare to keep the "worse" one (more needing of improvement)
          // 1. Lower accuracy is worse
          if (result.accuracy < existing.accuracy) {
            dedupedResults.set(label, result);
            return;
          }
          
          // 2. If accuracy is similar (within 1%), higher time is worse
          if (Math.abs(result.accuracy - existing.accuracy) < 1 && result.avgTime > existing.avgTime) {
             dedupedResults.set(label, result);
             return;
          }
          
          // 3. Tie-breaker: Prefer the one with more samples (more reliable data) ?? 
          // Actually, let's just stick to accuracy/time.
        });

        const finalResults = Array.from(dedupedResults.values()).sort((a, b) => {
            // Refinement: Prioritize accuracy < 50%
            const aVeryLowAccuracy = a.accuracy < 50;
            const bVeryLowAccuracy = b.accuracy < 50;
            
            if (aVeryLowAccuracy && !bVeryLowAccuracy) return -1;
            if (!aVeryLowAccuracy && bVeryLowAccuracy) return 1;
            
            // Then by lowest accuracy
            if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
            
            // Then by highest time
            return b.avgTime - a.avgTime;
        });

        set((state) => ({
          weaknessAnalysisCache: {
            ...state.weaknessAnalysisCache,
            [cacheKey]: { data: finalResults, fetchedAt: Date.now(), stale: false },
          },
        }));
        return finalResults;
      },

      fetchMistakes: async () => {
        const { user } = get();
        if (!user) return [];

        const { data, error } = await supabase
          .from('question_responses')
          .select('id, num1, num2, operation, category, is_correct, mistakes, time_taken, created_at')
          .eq('user_id', user.id)
          .or('is_correct.eq.false,mistakes.gt.0')
          .order('created_at', { ascending: false })
          .limit(200);

        if (error) {
          console.error('Error fetching mistakes:', error);
          return [];
        }

        return data || [];
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

      fetchLeaderboard: async (type: LeaderboardFilter = 'all-time') => {
        const { data, error } = await supabase.rpc('get_unique_leaderboard', {
          time_filter: type === 'daily' ? '24 hours' : null
        });
          
        if (error) {
          console.error('Error fetching leaderboard:', error);
          return get().leaderboardCache[type]?.entries || [];
        }

        if (!data) return get().leaderboardCache[type]?.entries || [];

        // Implement tiebreakers:
        // 1. Score (DESC)
        // 2. Accuracy (DESC)
        // 3. Created At (ASC - oldest first)
        const entries = [...data].filter(isAllowedLeaderboardEntry).sort((a, b) => {
          if (b.score !== a.score) {
            return b.score - a.score;
          }
          if (b.accuracy !== a.accuracy) {
            return b.accuracy - a.accuracy;
          }
          // created_at ASC (smaller timestamp = older)
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        }).map((entry) => ({
          ...entry,
          username: sanitizeUsernameForDisplay(entry.username || ''),
        }));
        set((state) => ({
          leaderboardCache: {
            ...state.leaderboardCache,
            [type]: { entries, fetchedAt: Date.now(), stale: false },
          },
        }));
        return entries;
      },

      invalidateWeaknessAnalysis: (userId) => {
        const cacheKey = userId || get().user?.id;
        if (!cacheKey) return;
        set((state) => ({
          weaknessAnalysisCache: Object.fromEntries(
            Object.entries(state.weaknessAnalysisCache).map(([key, value]) => [
              key,
              key.startsWith(`${cacheKey}:`) ? { ...value, stale: true } : value,
            ]),
          ),
        }));
      },

      invalidateLeaderboard: () => {
        set((state) => ({
          leaderboardCache: Object.fromEntries(
            Object.entries(state.leaderboardCache).map(([key, value]) => [
              key,
              value ? { ...value, stale: true } : value,
            ]),
          ) as UserState['leaderboardCache'],
        }));
      },

      submitFeedback: async ({ type, message, email }) => {
        const trimmedMessage = message.trim();
        if (!trimmedMessage) throw new Error('Please enter your feedback.');

        const { user } = get();
        const { error } = await supabase.from('feedback_submissions').insert({
          user_id: user?.id || null,
          feedback_type: type,
          message: trimmedMessage,
          contact_email: email?.trim() || user?.email || null,
        });
        if (error) throw error;
      },

      addPendingLeaderboardRun: (run) => {
        const pending = get().pendingLeaderboardRuns;
        if (pending.some((item) => item.runId === run.runId)) return;
        set({ pendingLeaderboardRuns: [...pending, { runId: run.runId, runToken: run.runToken }] });
      },

      claimVerifiedLeaderboardRun: async (run) => {
        const accessToken = get().session?.access_token;
        if (!accessToken) throw new Error('Authentication required to claim this run.');
        await claimLeaderboardRun(run, accessToken);
        set({ pendingLeaderboardRuns: get().pendingLeaderboardRuns.filter((item) => item.runId !== run.runId) });
        get().invalidateLeaderboard();
      },

      claimPendingLeaderboardRuns: async (accessToken) => {
        const remaining: PendingLeaderboardRun[] = [];
        for (const run of get().pendingLeaderboardRuns) {
          try {
            await claimLeaderboardRun(run, accessToken);
            get().invalidateLeaderboard();
          } catch (error) {
            console.error('Error claiming verified guest leaderboard run:', error);
            remaining.push(run);
          }
        }
        set({ pendingLeaderboardRuns: remaining });
      },

      syncGuestData: async (userId: string, guestGames: number, guestQuestions: number) => {
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

      }
    }),
    {
      name: 'zetamonkey-storage',
      partialize: (state) => ({ 
        highScore: state.highScore, 
        totalGames: state.totalGames,
        totalQuestionsAnswered: state.totalQuestionsAnswered,
        theme: state.theme,
        pendingLeaderboardRuns: state.pendingLeaderboardRuns,
        weaknessAnalysisCache: state.weaknessAnalysisCache,
        leaderboardCache: state.leaderboardCache,
        lastSyncedUserId: state.lastSyncedUserId,
        unsyncedGuestGames: state.unsyncedGuestGames,
        unsyncedGuestQuestions: state.unsyncedGuestQuestions,
      }),
      version: 4,
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Record<string, unknown>;
        delete state.localQualifyingGames;
        if (!state.weaknessAnalysisCache || Object.keys(state.weaknessAnalysisCache as object).some(key => !key.includes(':'))) {
          state.weaknessAnalysisCache = {};
        }
        return {
          ...state,
          pendingLeaderboardRuns: state.pendingLeaderboardRuns || [],
          weaknessAnalysisCache: state.weaknessAnalysisCache || {},
          leaderboardCache: state.leaderboardCache || {},
        };
      },
    }
  )
);
