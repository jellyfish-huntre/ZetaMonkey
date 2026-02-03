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

  // Group mistakes by timestamp + problem to handle multi-category entries
  const groupedMistakes: any[] = [];
  const seen = new Map<string, any>();

  mistakes.forEach(m => {
    const key = `${m.created_at}_${m.num1}_${m.num2}_${m.operation}`;
    if (seen.has(key)) {
      const existing = seen.get(key);
      if (!existing.categories.includes(m.category)) {
        existing.categories.push(m.category);
      }
    } else {
      const entry = { ...m, categories: [m.category] };
      seen.set(key, entry);
      groupedMistakes.push(entry);
    }
  });

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
        {groupedMistakes.length === 0 ? (
          <div className={styles.emptyState}>
            <AlertCircle size={48} />
            <p>No mistakes recorded yet. Keep practicing!</p>
          </div>
        ) : (
          groupedMistakes.map((m) => (
            <div key={m.id} className={`${styles.mistakeCard} ${!m.is_correct ? styles.incorrect : ''}`}>
              <div className={styles.problemInfo}>
                <span className={styles.problem}>
                  {m.num1} {m.operation === '*' ? '×' : m.operation === '/' ? '÷' : m.operation} {m.num2}
                </span>
                <div className={styles.labels}>
                  {m.categories.map((cat: string) => (
                    <span key={cat} className={styles.label}>{getCategoryLabel(cat)}</span>
                  ))}
                </div>
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
