import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Shield, ShieldAlert, ShieldCheck, TrendingUp, Clock } from 'lucide-react';
import type { WhiteProtectionSignal } from '@/hooks/useWhiteProtectionAI';

interface WhiteProtectionPanelProps {
  protection: WhiteProtectionSignal | null;
  whiteStats: {
    roundsSinceLastWhite: number;
    averageGapBetweenWhites: number;
    whitePercentage: number;
  } | null;
  isAnalyzing: boolean;
  currentBetAmount: number;
}

export function WhiteProtectionPanel({
  protection,
  whiteStats,
  isAnalyzing,
  currentBetAmount,
}: WhiteProtectionPanelProps) {
  const protectionAmount = protection?.suggestedAmount 
    ? (currentBetAmount * protection.suggestedAmount / 100)
    : 0;

  const getProtectionColor = () => {
    if (!protection) return 'bg-muted';
    if (protection.shouldProtect && protection.confidence >= 70) return 'bg-amber-500/20 border-amber-500/50';
    if (protection.shouldProtect && protection.confidence >= 50) return 'bg-yellow-500/20 border-yellow-500/50';
    if (protection.shouldProtect) return 'bg-orange-500/20 border-orange-500/50';
    return 'bg-green-500/20 border-green-500/50';
  };

  const getIcon = () => {
    if (!protection) return <Shield className="h-4 w-4 text-muted-foreground" />;
    if (protection.shouldProtect && protection.confidence >= 70) {
      return <ShieldAlert className="h-4 w-4 text-amber-400 animate-pulse" />;
    }
    if (protection.shouldProtect) {
      return <ShieldAlert className="h-4 w-4 text-yellow-400" />;
    }
    return <ShieldCheck className="h-4 w-4 text-green-400" />;
  };

  return (
    <Card className={`backdrop-blur border transition-colors ${getProtectionColor()}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getIcon()}
            <span>Proteção Branco IA</span>
          </div>
          {isAnalyzing && (
            <Badge variant="outline" className="text-[10px] animate-pulse">
              Analisando...
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stats Section */}
        {whiteStats && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Sem branco:</span>
              <span className={`font-bold ${whiteStats.roundsSinceLastWhite >= 18 ? 'text-amber-400' : ''}`}>
                {whiteStats.roundsSinceLastWhite}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Média:</span>
              <span className="font-medium">{whiteStats.averageGapBetweenWhites.toFixed(0)}</span>
            </div>
          </div>
        )}

        {/* Progress Bar - Rounds since last white */}
        {whiteStats && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Probabilidade de branco</span>
              <span>{Math.min(100, Math.round((whiteStats.roundsSinceLastWhite / 30) * 100))}%</span>
            </div>
            <Progress 
              value={Math.min(100, (whiteStats.roundsSinceLastWhite / 30) * 100)} 
              className="h-1.5"
            />
          </div>
        )}

        {/* Protection Recommendation */}
        {protection && (
          <div className={`p-2 rounded-lg border ${
            protection.shouldProtect 
              ? 'bg-amber-500/10 border-amber-500/30' 
              : 'bg-green-500/10 border-green-500/30'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <Badge 
                variant={protection.shouldProtect ? 'default' : 'secondary'}
                className={`text-[10px] ${
                  protection.shouldProtect 
                    ? 'bg-amber-500 hover:bg-amber-600' 
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {protection.shouldProtect ? '⚠️ PROTEGER' : '✓ SEM PROTEÇÃO'}
              </Badge>
              <span className="text-xs font-bold">
                {protection.confidence}%
              </span>
            </div>
            
            <p className="text-[10px] text-muted-foreground leading-tight">
              {protection.reason}
            </p>

            {protection.shouldProtect && protection.suggestedAmount > 0 && (
              <div className="mt-2 pt-2 border-t border-border/50">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground">
                    Sugestão: {protection.suggestedAmount}% da aposta
                  </span>
                  <span className="text-xs font-bold text-amber-400">
                    R$ {protectionAmount.toFixed(2)}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Branco paga 14x = R$ {(protectionAmount * 14).toFixed(2)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Info */}
        <div className="text-[10px] text-muted-foreground border-t border-border pt-2">
          <p>IA analisa padrões históricos para sugerir proteção no branco (14x).</p>
        </div>
      </CardContent>
    </Card>
  );
}
