import React, { useEffect, useState } from 'react';
import { useUserStore } from '../../store/userStore';
import { useGameStore } from '../../store/gameStore';
import { getCategoryLabel, type Category } from '../../lib/mathUtils';
import { Target, AlertCircle, Clock, CheckCircle2, ChevronRight } from 'lucide-react';
import styles from './WeaknessAnalysis.module.css';

interface Weakness {
  category: Category;
  avgTime: number;
  accuracy: number;
  totalQuestions: number;
}

export const WeaknessAnalysis: React.FC = () => {
  const { fetchWeaknessAnalysis, user } = useUserStore();
  const { startGame, settings } = useGameStore();
  const [weaknesses, setWeaknesses] = useState<Weakness[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAnalysis = async () => {
      if (user) {
        const data = await fetchWeaknessAnalysis();
        setWeaknesses(data);
      }
      setLoading(false);
    };
    loadAnalysis();
  }, [user, fetchWeaknessAnalysis]);

  if (!user) return null;
  if (loading) return <div className={styles.loading}>Analyzing patterns...</div>;
  if (weaknesses.length === 0) return null;

  // Only show top 3 weaknesses or areas needing most help
  const topWeaknesses = weaknesses
    .filter(w => w.accuracy < 95 || w.avgTime > 4000)
    .slice(0, 3);

  if (topWeaknesses.length === 0) return null;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <AlertCircle className={styles.headerIcon} size={20} />
        <h2 className={styles.title}>Areas for Improvement</h2>
      </div>

      <div className={styles.list}>
        {topWeaknesses.map((w) => (
          <div key={w.category} className={styles.card}>
            <div className={styles.cardInfo}>
              <h3 className={styles.categoryName}>{getCategoryLabel(w.category)}</h3>
              <div className={styles.metrics}>
                <div className={styles.metric}>
                  <CheckCircle2 size={14} className={w.accuracy < 80 ? styles.bad : styles.good} />
                  <span>{Math.round(w.accuracy)}% accuracy</span>
                </div>
                <div className={styles.metric}>
                  <Clock size={14} />
                  <span>{(w.avgTime / 1000).toFixed(1)}s avg</span>
                </div>
              </div>
            </div>
            <button 
              className={styles.practiceBtn}
              onClick={() => startGame(120, settings, w.category)}
              title="Start Target Practice"
            >
              <Target size={18} />
              <span>Practice</span>
              <ChevronRight size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
