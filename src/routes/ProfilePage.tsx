import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { ArrowLeft, Trophy, Activity, Calendar, LogOut, Crosshair } from 'lucide-react';
import { getCategoryLabel } from '../lib/mathUtils';
import styles from './ProfilePage.module.css';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, highScore, totalGames, fetchHistory, signOut } = useUserStore();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }

    const loadHistory = async () => {
      try {
        const data = await fetchHistory();
        setHistory(data);
      } catch (error) {
        console.error('Error fetching history:', error);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [user, navigate, fetchHistory]);

  if (!user) return null;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/')}>
          <ArrowLeft size={20} /> Back to Game
        </button>
        <button className={styles.signOutBtn} onClick={() => { signOut(); navigate('/'); }}>
          <LogOut size={20} /> Sign Out
        </button>
      </header>

      <main className={styles.content}>
        <section className={styles.hero}>
          <div className={styles.avatar}>
            {(user.user_metadata as any).username?.charAt(0).toUpperCase() || 'U'}
          </div>
          <h1 className={styles.username}>{(user.user_metadata as any).username || 'User'}</h1>
          <p className={styles.userEmail}>{user.email}</p>
        </section>

        <section className={styles.statsGrid}>
          <div className={styles.statCard}>
            <Trophy className={styles.statIcon} size={24} color="#f59e0b" />
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>High Score</span>
              <span className={styles.statValue}>{highScore}</span>
            </div>
          </div>
          <div className={styles.statCard}>
            <Activity className={styles.statIcon} size={24} color="#3b82f6" />
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Total Games</span>
              <span className={styles.statValue}>{totalGames}</span>
            </div>
          </div>
        </section>

        <section className={styles.historySection}>
          <h2 className={styles.sectionTitle}>Match History</h2>
          
          {loading ? (
            <p className={styles.emptyMsg}>Loading history...</p>
          ) : history.length === 0 ? (
            <p className={styles.emptyMsg}>No games played yet. Go set some records!</p>
          ) : (
            <div className={styles.historyTableWrapper}>
              <table className={styles.historyTable}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Score</th>
                    <th>QPM</th>
                    <th>Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((game) => (
                    <tr key={game.id}>
                      <td>
                        <span className={styles.dateCell}>
                          <Calendar size={14} className={styles.inlineIcon} />
                          {new Date(game.created_at).toLocaleDateString()}
                        </span>
                      </td>
                      <td className={styles.scoreCell}>
                        {game.score}
                        {game.target_category && (
                          <div className={styles.targetBadge} title={`Practice: ${getCategoryLabel(game.target_category)}`}>
                            <Crosshair size={10} /> Practice
                          </div>
                        )}
                      </td>
                      <td>{game.qpm}</td>
                      <td>{game.accuracy}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
