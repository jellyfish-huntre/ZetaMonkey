import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { useGameStore } from '../store/gameStore';
import { getCategoryLabel, type Category } from '../lib/mathUtils';
import { ArrowLeft, Beaker, CheckCircle2, Clock, Crosshair, HelpCircle, Eye, EyeOff } from 'lucide-react';
import styles from './LabPage.module.css';

const ALL_CATEGORIES: Category[] = [
  'add_basic', 'add_2digit', 'add_3digit',
  'sub_basic', 'sub_2digit', 'sub_3digit',
  
  'mult_2', 'mult_3', 'mult_4', 'mult_5', 'mult_6', 'mult_7', 'mult_8', 'mult_9', 'mult_10', 'mult_11', 'mult_12',
  'mult_2digit', 'mult_3digit',
  
  'div_2', 'div_3', 'div_4', 'div_5', 'div_6', 'div_7', 'div_8', 'div_9', 'div_10', 'div_11', 'div_12',
  'div_long',

  'other'
];

export default function LabPage() {
  const navigate = useNavigate();
  const { fetchWeaknessAnalysis, user } = useUserStore();
  const { startGame, settings } = useGameStore();
  const [stats, setStats] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [hideEmpty, setHideEmpty] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (user) {
        const data = await fetchWeaknessAnalysis(0);
        const statsMap = data.reduce((acc: any, curr: any) => {
          acc[curr.category] = curr;
          return acc;
        }, {});
        setStats(statsMap);
      }
      setLoading(false);
    };
    load();
  }, [user, fetchWeaknessAnalysis]);

  if (loading) return <div className={styles.loading}>Accessing the Lab...</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/')}>
          <ArrowLeft size={20} /> Home
        </button>
        <div className={styles.titleGroup}>
          <Beaker size={24} className={styles.icon} />
          <h1 className={styles.title}>Monkey Lab</h1>
        </div>
        <button 
          className={styles.toggleBtn}
          onClick={() => setHideEmpty(!hideEmpty)}
        >
          {hideEmpty ? <Eye size={18} /> : <EyeOff size={18} />}
          {hideEmpty ? 'Show All' : 'Hide Empty'}
        </button>
      </header>

      <main className={styles.content}>
        <div className={styles.intro}>
          <p>This is a debug view of every question category tracked by ZetaMonkey. From here, you can manually trigger targeted practice for any specific area.</p>
        </div>

        <div className={styles.grid}>
          {ALL_CATEGORIES
            .filter(cat => !hideEmpty || stats[cat])
            .map(cat => {
            const data = stats[cat];
            return (
              <div key={cat} className={`${styles.card} ${data ? styles.hasData : ''}`}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.catTitle}>{getCategoryLabel(cat)}</h3>
                  <code className={styles.catCode}>{cat}</code>
                </div>

                <div className={styles.catStats}>
                  {data ? (
                    <>
                      <div className={styles.stat}>
                        <CheckCircle2 size={14} className={data.accuracy < 70 ? styles.bad : styles.good} />
                        <span>{Math.round(data.accuracy)}%</span>
                      </div>
                      <div className={styles.stat}>
                        <Clock size={14} />
                        <span>{(data.avgTime / 1000).toFixed(2)}s</span>
                      </div>
                      <div className={styles.stat}>
                        <HelpCircle size={14} />
                        <span>{data.totalQuestions}</span>
                      </div>
                    </>
                  ) : (
                    <span className={styles.noData}>No data recorded</span>
                  )}
                </div>

                <button 
                  className={styles.practiceBtn}
                  onClick={() => {
                    startGame(120, settings, cat);
                    navigate('/');
                  }}
                >
                  <Crosshair size={16} /> Target Practice
                </button>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
