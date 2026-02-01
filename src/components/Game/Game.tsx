import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../store/gameStore';
import { useUserStore } from '../../store/userStore';
import { Play, RotateCcw, Settings, LogIn, LogOut, User as UserIcon } from 'lucide-react';
import styles from './Game.module.css';
import PerformanceGraph from '../Charts/PerformanceGraph'; // Import graph
import AuthModal from '../Auth/AuthModal';

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
    endGame
  } = useGameStore();

  const { highScore, updateHighScore, incrementGamesTerm, theme, setTheme, user, signOut, checkSession, recordGame } = useUserStore();
  const navigate = useNavigate();

  const [input, setInput] = useState('');
  const [showAuth, setShowAuth] = useState(false);
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
      
      // Save game to history if logged in
      if (user) {
        const totalQuestions = gameHistory.length;
        const correctCount = gameHistory.filter(h => h.isCorrect).length;
        const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
        const qpm = Math.round(correctCount / (duration / 60));
        
        recordGame(score, qpm, accuracy);
      }
    }
  }, [status, score, updateHighScore, incrementGamesTerm, user, gameHistory, duration, recordGame]);

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
      if (e.code === 'Space' && status !== 'playing' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        startGame();
      } else if (e.code === 'Space' && status === 'playing' ) {
         e.preventDefault();
         resetGame();
         startGame();
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
  }, [status, startGame, resetGame, skipQuestion, endGame]);

  if (status === 'finished') {
    const totalQuestions = gameHistory.length;
    const correctCount = gameHistory.filter(h => h.isCorrect).length;
    const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const speed = Math.round(correctCount / (duration / 60)); // QPM based on total duration (usually 2 mins)
    
    // Note: duration is in seconds, so correct / (sec/60) = correct / min

    return (
      <div className={styles.container}>
        <div className={styles.summary} style={{ width: '100%', maxWidth: '800px' }}>
          <h1 className={styles.title}>Session Complete</h1>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem', width: '100%', marginBottom: '2rem' }}>
             <div className={styles.statBox}>
               <span className={styles.label}>Score</span>
               <span className={styles.value}>{score}</span>
             </div>
             <div className={styles.statBox}>
               <span className={styles.label}>Accuracy</span>
               <span className={styles.value}>{accuracy}%</span>
             </div>
              <div className={styles.statBox}>
               <span className={styles.label}>Speed</span>
               <span className={styles.value}>{speed} <span style={{fontSize: '1rem'}}>QPM</span></span>
             </div>
          </div>

          <PerformanceGraph history={gameHistory} />

          <div className={styles.actions} style={{ marginTop: '2rem' }}>
            <button className={styles.btnPrimary} onClick={() => startGame()}>
              <RotateCcw size={20} /> Play Again
            </button>
            <button className={styles.btnSecondary} onClick={resetGame}>
               Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'idle') {
    return (
      <div className={styles.container}>
         <div className={styles.topRight}>
            <button className={styles.iconBtn} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle Theme">
              <Settings size={20} />
            </button>
            {user ? (
               <div className={styles.userMenu}>
                 <button className={styles.iconBtn} onClick={() => navigate('/profile')} title="View Profile">
                   <UserIcon size={20} />
                 </button>
                 <span className={styles.username}>{(user.user_metadata as any).username || 'User'}</span>
                 <button className={styles.iconBtn} onClick={signOut} title="Sign Out">
                   <LogOut size={20} />
                 </button>
               </div>
            ) : (
               <button className={styles.iconBtn} onClick={() => setShowAuth(true)} title="Login">
                 <LogIn size={20} />
               </button>
            )}
         </div>
         <div className={styles.hero}>
            <h1 className={styles.title}>ZetaMonkey</h1>
            <p className={styles.subtitle}>Arithmetic Training for the Modern Mind</p>
            
            <div style={{ display: 'flex', gap: '2rem', justifyContent: 'center', marginBottom: '2rem' }}>
               <div className={styles.statBox}>
                  <span className={styles.label} style={{ fontSize: '0.75rem' }}>High Score</span>
                  <span className={styles.value} style={{ fontSize: '1.5rem' }}>{highScore}</span>
               </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
               <button className={styles.btnPrimary} onClick={() => startGame()}>
                 <Play size={20} /> Start Game
               </button>
            </div>
         </div>
         {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
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
            autoFocus
          />
       </div>
       
       <div className={styles.footer}>
          <p>Press <b>Esc</b> to quit, <b>Space</b> to restart, <b>Enter</b> to skip.</p>
       </div>
    </div>
  );
}
