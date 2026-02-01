import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { Question } from '../../lib/mathEngine';

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
  // Prep data: index vs timeTaken (in ms -> seconds)
  const data = history.map((item, index) => ({
    question: index + 1,
    time: (item.timeTaken / 1000).toFixed(2),
    isCorrect: item.isCorrect,
    label: `${item.question.num1} ${item.question.operation} ${item.question.num2}`,
  }));

  return (
    <div style={{ width: '100%', height: 300, marginTop: '2rem' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
           <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
           <XAxis 
             dataKey="question" 
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
             contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#f4f4f5' }}
             itemStyle={{ color: '#f4f4f5' }}
             formatter={(value: any) => [`${value}s`, 'Time']}
             labelFormatter={(label) => `Question ${label}`}
           />
           <Line 
             type="monotone" 
             dataKey="time" 
             stroke="#3b82f6" 
             strokeWidth={2} 
             dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }}
             activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }}
             animationDuration={500}
           />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
