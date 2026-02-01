import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../../store/userStore';
import { ArrowLeft, Medal, Crown } from 'lucide-react';
import styles from './Leaderboard.module.css';

export default function Leaderboard() {
  const navigate = useNavigate();
  const { fetchLeaderboard } = useUserStore();
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all-time' | 'daily'>('all-time');

  useEffect(() => {
    const loadLeaderboard = async () => {
      setLoading(true);
      try {
        const data = await fetchLeaderboard(filter);
        setEntries(data);
      } catch (error) {
        console.error('Error loading leaderboard:', error);
      } finally {
        setLoading(false);
      }
    };
    loadLeaderboard();
  }, [fetchLeaderboard, filter]);

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0: return <Crown color="#ffd700" size={24} />;
      case 1: return <Medal color="#c0c0c0" size={24} />;
      case 2: return <Medal color="#cd7f32" size={24} />;
      default: return <span className={styles.rankNumber}>{index + 1}</span>;
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/')}>
          <ArrowLeft size={20} /> Back to Game
        </button>
        <h1 className={styles.title}>Global Leaderboard</h1>
      </header>

      <main className={styles.content}>
        <div className={styles.tabs}>
          <button 
            className={`${styles.tab} ${filter === 'all-time' ? styles.activeTab : ''}`}
            onClick={() => setFilter('all-time')}
          >
            All-time
          </button>
          <button 
            className={`${styles.tab} ${filter === 'daily' ? styles.activeTab : ''}`}
            onClick={() => setFilter('daily')}
          >
            Daily (Last 24h)
          </button>
        </div>

        <div className={styles.disclaimer}>
          Only games played with <strong>Standard Settings</strong> and <strong>Zero Skips</strong> qualify for the leaderboard.
        </div>

        {loading ? (
          <div className={styles.loading}>Loading rankings...</div>
        ) : entries.length === 0 ? (
          <div className={styles.empty}>No qualified scores yet. Be the first!</div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.rankCol}>Rank</th>
                  <th>User</th>
                  <th>Score</th>
                  <th>Speed (QPM)</th>
                  <th>Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => (
                  <tr key={entry.id} className={index < 3 ? styles.topThree : ''}>
                    <td className={styles.rankCol}>
                      <div className={styles.rankBox}>{getRankIcon(index)}</div>
                    </td>
                    <td className={styles.userCol}>
                      <span className={styles.username}>{entry.username}</span>
                    </td>
                    <td className={styles.scoreCol}>{entry.score}</td>
                    <td>{entry.qpm}</td>
                    <td>{entry.accuracy}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
