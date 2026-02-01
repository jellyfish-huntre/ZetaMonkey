import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../store/gameStore';
import { useUserStore } from '../../store/userStore';
import { useSettingsStore } from '../../store/settingsStore';
import { isDefaultSettings } from '../../lib/mathEngine';
import { Play, RotateCcw, Settings, LogIn, LogOut, User as UserIcon, Trophy, Sliders } from 'lucide-react';
import styles from './Game.module.css';
import PerformanceGraph from '../Charts/PerformanceGraph'; 
import AuthModal from '../Auth/AuthModal';
import SettingsModal from '../Settings/SettingsModal';

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
    settings
  } = useGameStore();

  const { 
    highScore, 
    totalGames,
    updateHighScore, 
    incrementGamesTerm, 
    theme, 
    setTheme, 
    user, 
    signOut, 
    checkSession, 
    recordGame, 
    submitLeaderboardScore 
  } = useUserStore();
  const { settings: currentSettings } = useSettingsStore();
  const navigate = useNavigate();

  const [input, setInput] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check auth session
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Initialize theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Update stats on finish
  useEffect(() => {
    if (status === 'finished') {
      updateHighScore(score);
      incrementGamesTerm(score);
      
      const totalQuestions = gameHistory.length;
      const correctCount = gameHistory.filter(h => h.isCorrect).length;
      const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
      const qpm = Math.round(correctCount / (duration / 60));

      // Save game to history if logged in
      if (user) {
        recordGame(score, qpm, accuracy);

        // Submit to leaderboard if qualifying
        const isEligible = isDefaultSettings(settings) && skipsCount === 0;
        if (isEligible && score > 0) {
          submitLeaderboardScore(score, qpm, accuracy);
        }
      }
    }
  }, [status, score, updateHighScore, incrementGamesTerm, user, gameHistory, duration, recordGame, settings, skipsCount, submitLeaderboardScore]);

  // Timer effect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (status === 'playing') {
      interval = setInterval(tick, 1000);
    }
    return () => clearInterval(interval);
  }, [status, tick]);

  // Focus input on game start
  useEffect(() => {
    if (status === 'playing' && inputRef.current) {
      inputRef.current.focus();
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
      // Don't trigger shortcuts if user is typing in settings/auth inputs
      if (document.activeElement?.tagName === 'INPUT') {
        if (e.key === 'Escape' && status === 'playing') {
          // Allow ESC in game
        } else if (e.key === 'Enter' && status === 'playing') {
          // Allow Enter in game
        } else {
          return;
        }
      }

      if (e.code === 'Space' && status !== 'playing') {
        e.preventDefault();
        startGame(120, currentSettings);
      } else if (e.code === 'Space' && status === 'playing' ) {
         e.preventDefault();
         resetGame();
         startGame(120, currentSettings);
      } else if (e.key === 'Escape') {
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
  }, [status, startGame, resetGame, skipQuestion, endGame, currentSettings]);

  if (status === 'finished') {
    const totalQuestions = gameHistory.length;
    const correctCount = gameHistory.filter(h => h.isCorrect).length;
    const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const qpm = Math.round(correctCount / (duration / 60));
    const isQualifying = isDefaultSettings(settings) && skipsCount === 0;

    return (
      <div className={styles.container}>
        <div className={styles.summary} style={{ width: '100%', maxWidth: '800px' }}>
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

          <div className={styles.actions} style={{ marginTop: '2rem' }}>
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
    return (
      <div className={styles.container}>
         <header className={styles.topNav}>
            <div className={styles.navLeft}>
              <button className={styles.navLink} onClick={() => navigate('/leaderboard')}>
                <Trophy size={18} /> Leaderboard
              </button>
            </div>
            <div className={styles.navRight}>
              <button className={styles.navLink} onClick={() => setShowSettings(true)}>
                <Sliders size={18} /> Options
              </button>
              <button className={styles.iconBtn} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle Theme">
                <Settings size={18} />
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

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
               <button className={styles.btnPrimary} onClick={() => startGame(120, currentSettings)}>
                 <Play size={24} /> Start Training (Space)
               </button>
            </div>
         </div>

         {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
         {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      </div>
    );
  }

  // Playing state
  return (
    <div className={styles.container}>
       <div className={styles.header}>
          <div className={styles.stat}>
            <span className={styles.label}>Time</span>
            <span className={styles.value}>{timeLeft}s</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.label}>Score</span>
            <span className={styles.value}>{score}</span>
          </div>
          <button className={styles.iconBtn} onClick={endGame} title="End Run Prematurely" style={{ marginLeft: 'auto' }}>
            <RotateCcw size={20} />
          </button>
       </div>

       <div className={styles.questionContainer}>
          {currentQuestion && (
             <div className={styles.problem}>
                <span className={styles.num}>{currentQuestion.num1}</span>
                <span className={styles.op}>{currentQuestion.operation}</span>
                <span className={styles.num}>{currentQuestion.num2}</span>
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
       
       <div className={styles.footer}>
          <p>Press <b>Esc</b> to quit, <b>Space</b> to restart, <b>Enter</b> to skip.</p>
       </div>
    </div>
  );
}
