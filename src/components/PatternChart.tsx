import { BlazeRound } from '@/types/blaze';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Activity } from 'lucide-react';

interface PatternChartProps {
  rounds: BlazeRound[];
}

export function PatternChart({ rounds }: PatternChartProps) {
  // Calculate cumulative balance (red = +1, black = -1, white = +14 for betting on red)
  const chartData = rounds.slice(-50).map((round, index) => {
    const previousBalance = index > 0 ? 0 : 0;
    let cumulative = 0;
    
    for (let i = 0; i <= index; i++) {
      const r = rounds.slice(-50)[i];
      if (r.color === 'red') cumulative += 1;
      else if (r.color === 'black') cumulative -= 1;
      else cumulative += 0; // white is neutral
    }
    
    return {
      index: index + 1,
      value: cumulative,
      color: round.color,
    };
  });

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="glass-card p-2 text-xs">
          <p>Rodada: {data.index}</p>
          <p className={data.value >= 0 ? 'text-primary' : 'text-accent'}>
            Balanço: {data.value > 0 ? '+' : ''}{data.value}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="glass-card p-4 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-display font-semibold neon-text">
          Tendência (Vermelho vs Preto)
        </h2>
      </div>

      {rounds.length < 5 ? (
        <div className="h-[200px] flex items-center justify-center text-muted-foreground">
          <p className="text-sm">Dados insuficientes para gráfico</p>
        </div>
      ) : (
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis 
                dataKey="index" 
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                tickLine={false}
              />
              <YAxis 
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: 'hsl(var(--primary))' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-4 flex items-center justify-center gap-6 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-primary rounded" />
          <span>Acima: Vermelho dominante</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-accent rounded" />
          <span>Abaixo: Preto dominante</span>
        </div>
      </div>
    </div>
  );
}
