import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Trophy, Activity, Target, Download } from 'lucide-react';
import styles from './LifetimeDashboard.module.css';

interface GameRecord {
  id: string;
  created_at: string;
  score: number;
  qpm: number;
  accuracy: number;
  target_category?: string | null;
}

interface LifetimeDashboardProps {
  history: GameRecord[];
  totalGames: number;
  totalQuestions: number;
  highScore: number;
  onExportCSV: () => void;
}

export default function LifetimeDashboard({ 
  history, 
  totalGames, 
  totalQuestions, 
  highScore,
  onExportCSV 
}: LifetimeDashboardProps) {
  
  const stats = useMemo(() => {
    if (history.length === 0) return {
      avgQpm: 0,
      avgAccuracy: 0,
      highestQpm: 0,
      highestAccuracy: 0,
      lifetimeAvgQpm: 0,
      lifetimeAvgAccuracy: 0,
      recentTrend: []
    };

    const recentGames = history.slice(0, 50).reverse();
    const sumQpmRecent = recentGames.reduce((acc, game) => acc + game.qpm, 0);
    const sumAccuracyRecent = recentGames.reduce((acc, game) => acc + game.accuracy, 0);
    
    const sumQpmTotal = history.reduce((acc, game) => acc + game.qpm, 0);
    const sumAccuracyTotal = history.reduce((acc, game) => acc + game.accuracy, 0);

    const highestQpm = Math.max(...history.map(g => g.qpm));
    const highestAccuracy = Math.max(...history.map(g => g.accuracy));

    const recentTrend = recentGames.map((game, index) => ({
      name: index + 1,
      qpm: game.qpm,
      accuracy: game.accuracy,
      date: new Date(game.created_at).toLocaleDateString()
    }));

    return {
      avgQpm: Math.round(sumQpmRecent / recentGames.length),
      avgAccuracy: Math.round(sumAccuracyRecent / recentGames.length),
      lifetimeAvgQpm: Math.round(sumQpmTotal / history.length),
      lifetimeAvgAccuracy: Math.round(sumAccuracyTotal / history.length),
      highestQpm,
      highestAccuracy,
      recentTrend
    };
  }, [history]);

  return (
    <div className={styles.dashboard}>
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <Activity className={styles.icon} size={16} />
            <span>tests started</span>
          </div>
          <div className={styles.statValue}>{totalGames}</div>
        </div>
        
        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <Target className={styles.icon} size={16} />
            <span>total questions</span>
          </div>
          <div className={styles.statValue}>{totalQuestions}</div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHeader}>
            <Trophy className={styles.icon} size={16} />
            <span>high score</span>
          </div>
          <div className={styles.statValue}>{highScore}</div>
        </div>
      </div>

      <div className={styles.chartSection}>
        <div className={styles.chartHeader}>
          <h3 className={styles.chartTitle}>Recent Performance (Last 50)</h3>
        </div>
        <div className={styles.chartContainer}>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={stats.recentTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
              <XAxis dataKey="name" hide />
              <YAxis yAxisId="left" orientation="left" stroke="var(--accent)" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" stroke="var(--text-secondary)" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} domain={[0, 100]} axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)' }}
                labelStyle={{ display: 'none' }}
              />
              <Line yAxisId="left" type="monotone" dataKey="qpm" stroke="var(--accent)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: 'var(--accent)' }} />
              <Line yAxisId="right" type="monotone" dataKey="accuracy" stroke="var(--text-secondary)" strokeWidth={1} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={styles.detailsGrid}>
        <div className={styles.gridColumn}>
          <div className={styles.gridItem}>
            <div className={styles.gridLabel}>highest qpm</div>
            <div className={styles.gridValue}>{stats.highestQpm}</div>
          </div>
          <div className={styles.gridItem}>
            <div className={styles.gridLabel}>highest accuracy</div>
            <div className={styles.gridValue}>{stats.highestAccuracy}%</div>
          </div>
        </div>

        <div className={styles.gridColumn}>
          <div className={styles.gridItem}>
            <div className={styles.gridLabel}>average qpm</div>
            <div className={styles.gridValue}>{stats.lifetimeAvgQpm}</div>
          </div>
          <div className={styles.gridItem}>
            <div className={styles.gridLabel}>average accuracy</div>
            <div className={styles.gridValue}>{stats.lifetimeAvgAccuracy}%</div>
          </div>
        </div>

        <div className={styles.gridColumn}>
          <div className={styles.gridItem}>
            <div className={styles.gridLabel}>average qpm (recent 50)</div>
            <div className={styles.gridValue}>{stats.avgQpm}</div>
          </div>
          <div className={styles.gridItem}>
            <div className={styles.gridLabel}>avg accuracy (recent 50)</div>
            <div className={styles.gridValue}>{stats.avgAccuracy}%</div>
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <button className={styles.exportBtn} onClick={onExportCSV}>
          <Download size={14} /> Export CSV
        </button>
      </div>
    </div>
  );
}
