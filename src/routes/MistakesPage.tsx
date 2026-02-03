import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { getCategoryLabel } from '../lib/mathUtils';
import { ArrowLeft, AlertCircle, Clock, Hash } from 'lucide-react';
import styles from './MistakesPage.module.css';

export default function MistakesPage() {
  const { fetchMistakes, user } = useUserStore();
  const [mistakes, setMistakes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    async function loadMistakes() {
      if (user) {
        const data = await fetchMistakes();
        setMistakes(data);
      }
      setLoading(false);
    }
    loadMistakes();
  }, [fetchMistakes, user]);

  if (loading) return <div className={styles.loading}>Loading mistakes...</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/')}>
          <ArrowLeft size={20} /> Back to Game
        </button>
        <h1 className={styles.title}>Recent Mistakes & Corrections</h1>
        <p className={styles.subtitle}>Review problems where you made a mistake or used backspace.</p>
      </header>

      <div className={styles.mistakesList}>
        {mistakes.length === 0 ? (
          <div className={styles.emptyState}>
            <AlertCircle size={48} />
            <p>No mistakes recorded yet. Keep practicing!</p>
          </div>
        ) : (
          mistakes.map((m) => (
            <div key={m.id} className={`${styles.mistakeCard} ${!m.is_correct ? styles.incorrect : ''}`}>
              <div className={styles.problemInfo}>
                <span className={styles.problem}>
                  {m.num1} {m.operation === '*' ? '×' : m.operation === '/' ? '÷' : m.operation} {m.num2}
                </span>
                <span className={styles.label}>{getCategoryLabel(m.category)}</span>
              </div>
              
              <div className={styles.stats}>
                <div className={styles.stat}>
                  <Hash size={14} />
                  <span>{m.mistakes} {m.mistakes === 1 ? 'mistake' : 'mistakes'}</span>
                </div>
                <div className={styles.stat}>
                  <Clock size={14} />
                  <span>{(m.time_taken / 1000).toFixed(2)}s</span>
                </div>
                {!m.is_correct && <span className={styles.statusBadge}>Failed</span>}
              </div>
              
              <div className={styles.timestamp}>
                {new Date(m.created_at).toLocaleString()}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
