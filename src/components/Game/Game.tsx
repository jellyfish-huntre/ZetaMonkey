import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../store/gameStore';
import { useUserStore } from '../../store/userStore';
import { useSettingsStore } from '../../store/settingsStore';
import { isDefaultSettings, type Operation } from '../../lib/mathEngine';
import { Play, RotateCcw, LogIn, LogOut, User as UserIcon, Trophy, Sliders, Beaker } from 'lucide-react';
import styles from './Game.module.css';
import PerformanceGraph from '../Charts/PerformanceGraph'; 
import AuthModal from '../Auth/AuthModal';
import SettingsModal from '../Settings/SettingsModal';
import { WeaknessAnalysis } from '../Analytics/WeaknessAnalysis';

export default function Game() {
  const { 
    status, 
    score, 
    timeLeft, 
    duration,
    gameHistory,
    currentQuestion, 
    startGame, 
    submitAnswer, 
    resetGame, 
    tick,
    skipQuestion,
    endGame,
    skipsCount,
    settings,
    finishReason,
    targetCategory,
    incrementMistakes
  } = useGameStore();

  const { 
    highScore, 
    totalGames,
    updateHighScore, 
    incrementGamesTerm, 
    theme, 
    user, 
    signOut, 
    recordGame, 
    submitLeaderboardScore 
  } = useUserStore();
  const { settings: currentSettings, updateSettings } = useSettingsStore();
  const navigate = useNavigate();

  const [input, setInput] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);



  // Update stats on finish
  useEffect(() => {
    if (status === 'finished') {
      const isTimeUp = finishReason === 'time_up';
      
      // Only update official lifetime stats if the game was completed fully
      if (isTimeUp) {
        updateHighScore(score);
        incrementGamesTerm(score);
      }
      
      const totalQuestions = gameHistory.length;
      if (totalQuestions === 0) return; // Nothing to record

      const correctCount = gameHistory.filter(h => h.isCorrect).length;
      const totalMistakes = gameHistory.reduce((acc, h) => acc + (h.mistakes || 0), 0);
      const accuracy = Math.round((correctCount / (correctCount + totalMistakes)) * 100) || 0;
      const qpm = Math.round(correctCount / (duration / 60));

      const isEligible = isTimeUp && isDefaultSettings(settings) && skipsCount === 0 && !targetCategory;
      
      if (user) {
        // ALWAYS record the session data if logged in, so Lab metrics reflect the work done
        recordGame(score, qpm, accuracy, gameHistory, targetCategory);

        // Submit to leaderboard only if qualifying and time was up
        if (isEligible && score > 0) {
          submitLeaderboardScore(score, qpm, accuracy);
        }
      } else if (isEligible && score > 0) {
        // Track locally for guests to sync later
        const { addLocalQualifyingGame } = useUserStore.getState();
        addLocalQualifyingGame(score, qpm, accuracy);
      }
    }
  }, [status, score, updateHighScore, incrementGamesTerm, user, gameHistory, duration, recordGame, settings, skipsCount, submitLeaderboardScore, finishReason]);

  // Timer effect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (status === 'playing') {
      interval = setInterval(tick, 1000);
    }
    return () => clearInterval(interval);
  }, [status, tick]);

  // Focus input and clear state on game start
  useEffect(() => {
    if (status === 'playing') {
      setInput('');
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  }, [status]);

  // Handle Input Changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Allow only numbers
    if (!/^-?\d*$/.test(val)) return;
    
    setInput(val);
    
    // Auto-submit if correct (ZetaMac style)
    if (currentQuestion) {
      const numVal = parseInt(val, 10);
      if (!isNaN(numVal) && numVal === currentQuestion.answer) {
        submitAnswer(val);
        setInput('');
      }
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow Space to restart game ANYTIME
      if (e.code === 'Space') {
         // Prevent default scrolling
         e.preventDefault();
         
         // If we are in settings or auth, maybe we shouldn't restart?
         if (showAuth || showSettings) return;

         setInput('');
         startGame(120, currentSettings);
         return;
      }

      if (document.activeElement?.tagName === 'INPUT' && document.activeElement !== inputRef.current) {
         return;
      }
      
      if (e.key === 'Backspace' && status === 'playing') {
        // Check actual input value from ref to avoid stale closure issues
        if (inputRef.current && inputRef.current.value.length > 0) {
           incrementMistakes();
        }
      }

      if (e.key === 'Escape') {
         if (e.shiftKey && status === 'playing') {
           endGame();
         } else {
           resetGame();
         }
      } else if (e.key === 'Enter') {
         if (status === 'playing') {
             skipQuestion();
             setInput('');
         }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, startGame, resetGame, skipQuestion, endGame, currentSettings, showAuth, showSettings]);

  if (status === 'finished') {
    // const totalQuestions = gameHistory.length; (unused now)
    const correctCount = gameHistory.filter(h => h.isCorrect).length;
    // Calculate accuracy based on mistakes: (Questions / (Questions + Mistakes)) * 100
    // Or (Keystrokes Correct / Total Keystrokes)?
    // User wants "backspaces" to lower accuracy.
    const totalMistakes = gameHistory.reduce((acc, h) => acc + (h.mistakes || 0), 0);
    const accuracy = correctCount > 0 
      ? Math.round((correctCount / (correctCount + totalMistakes)) * 100) 
      : 0;
    const qpm = Math.round(correctCount / (duration / 60));
    const isQualifying = isDefaultSettings(settings) && skipsCount === 0;

    return (
      <div className={styles.container}>
        <div className={styles.summary}>
          <div className={styles.gameOverBadge}>Run Complete</div>
          <h1 className={styles.scoreDisplay}>{score}</h1>
          <p className={styles.scoreLabel}>Final Score</p>
          
          <div className={styles.finalStats}>
             <div className={styles.statBox}>
               <span className={styles.label}>Accuracy</span>
               <span className={styles.value}>{accuracy}%</span>
             </div>
             <div className={styles.statBox}>
               <span className={styles.label}>Speed</span>
               <span className={styles.value}>{qpm} <span style={{fontSize: '1rem'}}>QPM</span></span>
             </div>
             <div className={styles.statBox}>
               <span className={styles.label}>Skips</span>
               <span className={styles.value}>{skipsCount}</span>
             </div>
          </div>

          {isQualifying && score > 0 && (
            <div className={styles.qualifyingBadge}>
              <Trophy size={16} /> Qualified for Global Leaderboard
            </div>
          )}

          <PerformanceGraph history={gameHistory} />

          <div className={styles.actions}>
            <button className={styles.btnPrimary} onClick={() => startGame(120, currentSettings)}>
              <RotateCcw size={20} /> Play Again
            </button>
            <button className={styles.btnSecondary} onClick={resetGame}>
               Back to Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'idle') {
    const isClassic = theme === 'classic';

    if (isClassic) {
      const handleClassicToggle = (op: Operation) => {
        const newOps = currentSettings.operations.includes(op)
          ? currentSettings.operations.filter(o => o !== op)
          : [...currentSettings.operations, op];
        if (newOps.length > 0) updateSettings({ operations: newOps });
      };

      const handleClassicRange = (opKey: string, field: 'min' | 'max', value: string) => {
        const num = parseInt(value, 10);
        if (isNaN(num)) return;
        updateSettings({
          ranges: {
            ...currentSettings.ranges,
            [opKey]: { ...(currentSettings.ranges as any)[opKey], [field]: num }
          }
        });
      };

      return (
        <div className={`${styles.container} ${styles.classicHome}`}>
           <header className={styles.topNav}>
              <div className={styles.navLeft}>
                <button className={styles.navLink} onClick={() => navigate('/leaderboard')}>Leaderboard</button>
              </div>
              <div className={styles.navRight}>
                <button className={styles.navLink} onClick={() => setShowSettings(true)}>Options</button>
                {user ? (
                   <div className={styles.userMenu}>
                     <button className={styles.navLink} onClick={() => navigate('/profile')}>{user.user_metadata?.username || 'Profile'}</button>
                     <button className={styles.navLink} onClick={signOut}>Logout</button>
                   </div>
                ) : (
                   <button className={styles.navLink} onClick={() => setShowAuth(true)}>Login</button>
                )}
              </div>
           </header>

           <div className={styles.classicContainer}>
              <h1 className={styles.classicTitle}>Arithmetic Game</h1>
              <p className={styles.classicIntro}>
                The Arithmetic Game is a fast-paced speed drill where you are given two minutes to solve as many arithmetic problems as you can.
              </p>

              <div className={styles.classicSettings}>
                 <div className={styles.classicCheckGroup}>
                    <div className={styles.classicRow}>
                      <input 
                        type="checkbox" 
                        id="add" 
                        checked={currentSettings.operations.includes('+')} 
                        onChange={() => handleClassicToggle('+')} 
                      />
                      <label htmlFor="add">Addition</label>
                    </div>
                    <div className={styles.classicRangeRow}>
                       Range: ( <input type="number" value={currentSettings.ranges.add.min} onChange={e => handleClassicRange('add', 'min', e.target.value)} /> to <input type="number" value={currentSettings.ranges.add.max} onChange={e => handleClassicRange('add', 'max', e.target.value)} /> ) + ( <input type="number" value={currentSettings.ranges.add.min} readOnly /> to <input type="number" value={currentSettings.ranges.add.max} readOnly /> )
                    </div>
                 </div>

                 <div className={styles.classicCheckGroup}>
                    <div className={styles.classicRow}>
                      <input 
                        type="checkbox" 
                        id="sub" 
                        checked={currentSettings.operations.includes('-')} 
                        onChange={() => handleClassicToggle('-')} 
                      />
                      <label htmlFor="sub">Subtraction</label>
                    </div>
                    <div className={styles.classicHint}>Addition problems in reverse.</div>
                 </div>

                 <div className={styles.classicCheckGroup}>
                    <div className={styles.classicRow}>
                      <input 
                        type="checkbox" 
                        id="mult" 
                        checked={currentSettings.operations.includes('*')} 
                        onChange={() => handleClassicToggle('*')} 
                      />
                      <label htmlFor="mult">Multiplication</label>
                    </div>
                    <div className={styles.classicRangeRow}>
                       Range: ( <input type="number" value={currentSettings.ranges.mult.min} onChange={e => handleClassicRange('mult', 'min', e.target.value)} /> to <input type="number" value={currentSettings.ranges.mult.max} onChange={e => handleClassicRange('mult', 'max', e.target.value)} /> ) × ( <input type="number" value={currentSettings.ranges.mult.min} readOnly /> to <input type="number" value={currentSettings.ranges.mult.max} readOnly /> )
                    </div>
                 </div>

                 <div className={styles.classicCheckGroup}>
                    <div className={styles.classicRow}>
                      <input 
                        type="checkbox" 
                        id="div" 
                        checked={currentSettings.operations.includes('/')} 
                        onChange={() => handleClassicToggle('/')} 
                      />
                      <label htmlFor="div">Division</label>
                    </div>
                    <div className={styles.classicHint}>Multiplication problems in reverse.</div>
                 </div>

                 <div className={styles.classicDuration}>
                    Duration: 
                    <select value={currentSettings.duration} onChange={e => updateSettings({ duration: parseInt(e.target.value, 10) })}>
                       <option value={60}>60 seconds</option>
                       <option value={120}>120 seconds</option>
                       <option value={300}>300 seconds</option>
                    </select>
                 </div>

                 <div className={styles.classicStartWrapper}>
                    <button className={styles.classicStartBtn} onClick={() => startGame(currentSettings.duration, currentSettings)}>Start</button>
                 </div>
              </div>
           </div>

           {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
           {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        </div>
      );
    }

    return (
      <div className={styles.container}>
         <header className={styles.topNav}>
            <div className={styles.navLeft}>
              <button className={styles.navLink} onClick={() => navigate('/leaderboard')}>
                <Trophy size={18} /> Leaderboard
              </button>
              <button className={styles.navLink} onClick={() => navigate('/lab')}>
                <Beaker size={18} /> Lab
              </button>
            </div>
            <div className={styles.navRight}>
              <button className={styles.navLink} onClick={() => setShowSettings(true)}>
                <Sliders size={18} /> Options
              </button>
              {user ? (
                 <div className={styles.userMenu}>
                   <button className={styles.iconBtn} onClick={() => navigate('/profile')} title="View Profile">
                     <UserIcon size={18} />
                   </button>
                   <button className={styles.iconBtn} onClick={signOut} title="Sign Out">
                     <LogOut size={18} />
                   </button>
                 </div>
              ) : (
                 <button className={styles.navLink} onClick={() => setShowAuth(true)}>
                   <LogIn size={18} /> Login
                 </button>
              )}
            </div>
         </header>

         <div className={styles.hero}>
            <div className={styles.logo}>ζ</div>
            <h1 className={styles.title}>ZetaMonkey</h1>
            
            <div className={styles.statsRow}>
               <div className={styles.mainStat}>
                  <span className={styles.statLabel}>Personal Best</span>
                  <span className={styles.statNum}>{highScore}</span>
               </div>
               <div className={styles.mainStat}>
                  <span className={styles.statLabel}>Total Games</span>
                  <span className={styles.statNum}>{totalGames}</span>
               </div>
            </div>
            <WeaknessAnalysis />

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
               <button className={styles.btnPrimary} onClick={() => startGame(120, currentSettings)}>
                 <Play size={24} /> Press Space
               </button>
            </div>
         </div>

         {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
         {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      </div>
    );
  }

  // Playing state
  const isClassic = theme === 'classic';

  return (
    <div className={`${styles.container} ${isClassic ? styles.classicMode : ''}`}>
        <div className={styles.header}>
           <div className={styles.gameStats}>
             <div className={styles.stat}>
               <span className={styles.label}>{isClassic ? 'Seconds left:' : 'Time'}</span>
               <span className={styles.value}>{timeLeft}{!isClassic && 's'}</span>
             </div>
             <div className={styles.stat}>
               <span className={styles.label}>{isClassic ? 'Score:' : 'Score'}</span>
               <span className={styles.value}>{score}</span>
             </div>
           </div>
           {!isClassic && (
             <button className={styles.iconBtn} onClick={endGame} title="End Run Prematurely" style={{ marginLeft: 'auto' }}>
               <RotateCcw size={20} />
             </button>
           )}
        </div>

       <div className={styles.questionStrip}>
         <div className={styles.questionContainer}>
            {currentQuestion && (
               <div className={styles.problem}>
                  <span className={styles.num}>{currentQuestion.num1}</span>
                  <span className={styles.op}>{currentQuestion.operation === '*' ? '×' : currentQuestion.operation === '/' ? '÷' : currentQuestion.operation}</span>
                  <span className={styles.num}>{currentQuestion.num2}</span>
                  {isClassic && <span className={styles.op}>=</span>}
               </div>
            )}
            
            <input
              ref={inputRef}
              type="text"
              className={styles.input}
              value={input}
              onChange={handleChange}
              spellCheck={false}
              autoComplete="off"
              autoFocus
            />
         </div>
       </div>
       
       {!isClassic && (
         <div className={styles.footer}>
            <p>Press <b>Esc</b> to quit, <b>Space</b> to restart, <b>Enter</b> to skip.</p>
         </div>
       )}
    </div>
  );
}
