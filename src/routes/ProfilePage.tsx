import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { ArrowLeft, LogOut } from 'lucide-react';
import LifetimeDashboard from '../components/Profile/LifetimeDashboard';
import styles from './ProfilePage.module.css';

interface Game {
  id: string;
  created_at: string;
  score: number;
  qpm: number;
  accuracy: number;
  target_category?: string | null;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, highScore, totalGames, totalQuestionsAnswered, fetchHistory, signOut } = useUserStore();
  const [history, setHistory] = useState<Game[]>([]);
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

  const handleExportCSV = useCallback(() => {
    if (history.length === 0) return;

    const headers = ['Date', 'Score', 'QPM', 'Accuracy', 'Target Category'];
    const rows = history.map(game => [
      new Date(game.created_at).toLocaleString(),
      game.score,
      game.qpm,
      game.accuracy,
      game.target_category || 'All'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `zetamonkey_history_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [history]);

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

        <LifetimeDashboard 
          history={history}
          totalGames={totalGames}
          totalQuestions={totalQuestionsAnswered}
          highScore={highScore}
          onExportCSV={handleExportCSV}
        />

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
                          {new Date(game.created_at).toLocaleDateString()}
                        </span>
                      </td>
                      <td className={styles.scoreCell}>
                        {game.score}
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
