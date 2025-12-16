import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  ReferenceLine,
  Area,
  AreaChart
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import type { BankrollGoal, DailyProgress } from '@/hooks/useBankrollGoal';

interface BankrollProgressChartProps {
  goal: BankrollGoal | null;
  dailyProgress: DailyProgress[];
  currentProfit: number;
}

export function BankrollProgressChart({ goal, dailyProgress, currentProfit }: BankrollProgressChartProps) {
  const chartData = useMemo(() => {
    if (!goal) return [];

    const data = [];
    const startDate = new Date(goal.startDate);
    const today = new Date();
    
    // Generate data for all days from start to target end
    for (let i = 0; i <= goal.targetDays; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      
      // Expected cumulative value for this day
      const expectedCumulative = goal.dailyTarget * i;
      
      // Find actual progress for this day
      const actualEntry = dailyProgress.find(p => p.date === dateStr);
      
      // Only show actual data up to today
      const isPast = date <= today;
      const isToday = date.toDateString() === today.toDateString();
      
      data.push({
        day: i,
        date: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        expected: expectedCumulative,
        actual: isPast || isToday ? (actualEntry?.cumulative ?? (isToday ? currentProfit : null)) : null,
        target: i === goal.targetDays ? goal.totalNeeded : undefined,
      });
    }

    return data;
  }, [goal, dailyProgress, currentProfit]);

  if (!goal || chartData.length === 0) {
    return null;
  }

  const formatCurrency = (value: number) => `R$ ${value.toFixed(0)}`;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card/95 backdrop-blur border border-primary/30 rounded-lg p-2 shadow-lg">
          <p className="text-xs font-medium mb-1">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-xs" style={{ color: entry.color }}>
              {entry.name === 'expected' ? 'Esperado' : 'Real'}: {formatCurrency(entry.value || 0)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="bg-card/50 backdrop-blur border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Progresso da Meta
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="expectedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis 
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `R$${v}`}
                width={50}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine 
                y={goal.totalNeeded} 
                stroke="hsl(var(--chart-4))"
                strokeDasharray="5 5"
                label={{ 
                  value: 'Meta', 
                  position: 'right',
                  fontSize: 10,
                  fill: 'hsl(var(--chart-4))'
                }}
              />
              <Area
                type="monotone"
                dataKey="expected"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1}
                strokeDasharray="4 4"
                fill="url(#expectedGradient)"
                name="expected"
                connectNulls
              />
              <Area
                type="monotone"
                dataKey="actual"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#actualGradient)"
                name="actual"
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        
        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-2">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-muted-foreground opacity-50" style={{ borderStyle: 'dashed' }} />
            <span className="text-[10px] text-muted-foreground">Esperado</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-primary" />
            <span className="text-[10px] text-muted-foreground">Real</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-chart-4" style={{ borderStyle: 'dashed' }} />
            <span className="text-[10px] text-muted-foreground">Meta</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
