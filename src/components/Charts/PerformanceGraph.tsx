import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { Question } from '../../lib/mathEngine';
import { Check, X } from 'lucide-react';
import styles from './PerformanceGraph.module.css';

interface HistoryItem {
  question: Question;
  timeTaken: number;
  answerGiven: string;
  isCorrect: boolean;
  timestamp: number;
}

interface PerformanceGraphProps {
  history: HistoryItem[];
}

export default function PerformanceGraph({ history }: PerformanceGraphProps) {
  const [selectedPoint, setSelectedPoint] = useState<any>(null);

  // Prep data: index vs timeTaken (in ms -> seconds)
  const data = history.map((item, index) => ({
    questionIndex: index + 1,
    time: parseFloat((item.timeTaken / 1000).toFixed(2)),
    isCorrect: item.isCorrect,
    label: `${item.question.num1} ${item.question.operation === '*' ? '×' : item.question.operation === '/' ? '÷' : item.question.operation} ${item.question.num2}`,
    correctAnswer: item.question.answer,
    userAnswer: item.answerGiven,
  }));

  const handleChartClick = (chartState: any) => {
    if (!chartState) return;

    let point = null;
    
    // Primary approach: activePayload (standard Recharts)
    if (chartState.activePayload && chartState.activePayload.length > 0) {
      point = chartState.activePayload[0].payload;
    }
    
    // Fallback: use activeTooltipIndex to look up in our data array
    if (!point && (chartState.activeTooltipIndex !== undefined || chartState.activeIndex !== undefined)) {
      const index = chartState.activeTooltipIndex ?? chartState.activeIndex;
      if (index >= 0 && index < data.length) {
        point = data[index];
      }
    }

    if (point) {
      setSelectedPoint(point);
    }
  };

  if (!history || history.length === 0) return null;

  return (
    <div className={styles.graphWrapper}>
      <h3 className={styles.title}>Performance (Click point for details)</h3>
      
      {selectedPoint && (
        <div className={styles.detailsBox}>
          <div className={styles.equation}>
            <span className={styles.equationText}>
              {selectedPoint.label} = {selectedPoint.correctAnswer}
            </span>
          </div>
          <div className={styles.answerSection}>
            <span className={styles.answerLabel}>You answered:</span>
            <span 
              className={styles.userAnswer}
              style={{ color: selectedPoint.isCorrect ? '#4ade80' : '#f87171' }}
            >
              {selectedPoint.userAnswer}
            </span>
            {selectedPoint.isCorrect ? <Check size={18} color="#4ade80" /> : <X size={18} color="#f87171" />}
            <span className={styles.timeLabel}>
              ({selectedPoint.time}s)
            </span>
          </div>
        </div>
      )}

      {/* 
        ResponsiveContainer requires a parent with defined height/width. 
        We use aspect ratio and min-width to prevent 0-size errors in flex containers. 
      */}
      <div className={styles.chartContainer}>
        <ResponsiveContainer width="100%" height="100%" minWidth={100}>
          <LineChart 
            data={data} 
            margin={{ top: 5, right: 20, bottom: 5, left: 0 }} 
            onClick={handleChartClick}
          >
             <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
             <XAxis 
               dataKey="questionIndex" 
               stroke="#a1a1aa" 
               tick={{ fill: '#a1a1aa' }}
               tickLine={{ stroke: '#27272a' }}
               axisLine={{ stroke: '#27272a' }}
             />
             <YAxis 
               stroke="#a1a1aa" 
               tick={{ fill: '#a1a1aa' }}
               tickLine={{ stroke: '#27272a' }}
               axisLine={{ stroke: '#27272a' }}
               unit="s"
             />
             <Tooltip 
               wrapperStyle={{ pointerEvents: 'none' }}
               contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#f4f4f5' }}
               itemStyle={{ color: '#f4f4f5' }}
               formatter={(value: any) => [`${value}s`, 'Time']}
               labelFormatter={(label) => `Question ${label}`}
               cursor={{ stroke: 'var(--text-secondary)', strokeWidth: 1 }}
             />
             <Line 
               type="monotone" 
               dataKey="time" 
               stroke="#3b82f6" 
               strokeWidth={2} 
               dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }}
               activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
               animationDuration={500}
               isAnimationActive={false}
             />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
