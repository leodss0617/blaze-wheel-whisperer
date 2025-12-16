import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { 
  Settings, 
  Key, 
  Clock, 
  AlertTriangle, 
  CheckCircle2,
  RefreshCw,
  Shield,
  Bell,
  Volume2,
  VolumeX,
  Target,
  Wallet,
  Bot,
  Save,
  RotateCcw,
  ExternalLink,
  Copy,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface SettingsPanelProps {
  predictionInterval: number;
  onIntervalChange: (value: number) => void;
  baseBet: number;
  setBaseBet: (value: number) => void;
  useAI: boolean;
  setUseAI: (value: boolean) => void;
}

interface TokenInfo {
  isValid: boolean;
  expiresAt: Date | null;
  timeRemaining: string;
  username?: string;
  balance?: number;
}

export function SettingsPanel({
  predictionInterval,
  onIntervalChange,
  baseBet,
  setBaseBet,
  useAI,
  setUseAI,
}: SettingsPanelProps) {
  const { toast } = useToast();
  
  // Token state
  const [tokenInfo, setTokenInfo] = useState<TokenInfo>({
    isValid: false,
    expiresAt: null,
    timeRemaining: 'Desconhecido',
  });
  const [showToken, setShowToken] = useState(false);
  const [newToken, setNewToken] = useState('');
  const [isCheckingToken, setIsCheckingToken] = useState(false);
  
  // Settings state
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('blaze-settings');
    return saved ? JSON.parse(saved) : {
      soundEnabled: true,
      soundVolume: 70,
      autoRenewToken: true,
      renewWarningMinutes: 30,
      maxGales: 2,
      targetProfit: 100,
      stopLoss: 50,
      notifyOnSignal: true,
      notifyOnWin: true,
      notifyOnLoss: true,
    };
  });

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('blaze-settings', JSON.stringify(settings));
  }, [settings]);

  // Decode JWT and check expiration
  const decodeToken = useCallback((token: string): { exp?: number; id?: number; uuid?: string } | null => {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(atob(parts[1]));
      return payload;
    } catch {
      return null;
    }
  }, []);

  // Check token status
  const checkTokenStatus = useCallback(async () => {
    setIsCheckingToken(true);
    try {
      const { data, error } = await supabase.functions.invoke('blaze-auto-bet', {
        body: { action: 'check_balance' },
      });

      if (error || !data?.success) {
        setTokenInfo({
          isValid: false,
          expiresAt: null,
          timeRemaining: 'Token inválido',
        });
        return;
      }

      // Get token expiration from stored token info
      const storedExpiry = localStorage.getItem('blaze-token-expiry');
      let expiresAt: Date | null = null;
      let timeRemaining = 'Verificando...';

      if (storedExpiry) {
        expiresAt = new Date(parseInt(storedExpiry));
        const now = new Date();
        const diff = expiresAt.getTime() - now.getTime();
        
        if (diff <= 0) {
          timeRemaining = 'Expirado';
        } else {
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          timeRemaining = `${hours}h ${minutes}min`;
        }
      }

      setTokenInfo({
        isValid: true,
        expiresAt,
        timeRemaining,
        username: data.data?.username,
        balance: data.balance,
      });
    } catch (error) {
      console.error('Error checking token:', error);
      setTokenInfo({
        isValid: false,
        expiresAt: null,
        timeRemaining: 'Erro ao verificar',
      });
    } finally {
      setIsCheckingToken(false);
    }
  }, []);

  // Check token on mount and periodically
  useEffect(() => {
    checkTokenStatus();
    const interval = setInterval(checkTokenStatus, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [checkTokenStatus]);

  // Auto-renewal warning
  useEffect(() => {
    if (!settings.autoRenewToken || !tokenInfo.expiresAt) return;

    const checkRenewal = () => {
      const now = new Date();
      const diff = tokenInfo.expiresAt!.getTime() - now.getTime();
      const minutesRemaining = diff / (1000 * 60);

      if (minutesRemaining <= settings.renewWarningMinutes && minutesRemaining > 0) {
        toast({
          title: '⚠️ Token expirando!',
          description: `Seu token expira em ${Math.round(minutesRemaining)} minutos. Renove agora!`,
          variant: 'destructive',
        });
      }
    };

    checkRenewal();
    const interval = setInterval(checkRenewal, 300000); // Check every 5 minutes
    return () => clearInterval(interval);
  }, [tokenInfo.expiresAt, settings.autoRenewToken, settings.renewWarningMinutes, toast]);

  // Update new token
  const handleTokenUpdate = useCallback(() => {
    if (!newToken.trim()) {
      toast({
        title: '❌ Erro',
        description: 'Insira um token válido',
        variant: 'destructive',
      });
      return;
    }

    const decoded = decodeToken(newToken);
    if (!decoded || !decoded.exp) {
      toast({
        title: '❌ Token inválido',
        description: 'O token não possui formato JWT válido',
        variant: 'destructive',
      });
      return;
    }

    // Save expiry to localStorage
    localStorage.setItem('blaze-token-expiry', (decoded.exp * 1000).toString());
    
    toast({
      title: '✅ Token salvo!',
      description: 'Atualize o secret BLAZE_AUTH_TOKEN nas configurações do projeto',
    });
    
    // Copy to clipboard
    navigator.clipboard.writeText(newToken);
    setNewToken('');
    checkTokenStatus();
  }, [newToken, decodeToken, toast, checkTokenStatus]);

  const updateSetting = (key: string, value: any) => {
    setSettings((prev: typeof settings) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-4">
      {/* Token Management */}
      <Card className="neon-border bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Key className="h-5 w-5 text-blaze-gold" />
            Token de Autenticação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Token Status */}
          <div className={`p-3 rounded-lg border ${
            tokenInfo.isValid 
              ? 'bg-primary/10 border-primary/30' 
              : 'bg-destructive/10 border-destructive/30'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {tokenInfo.isValid ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                )}
                <span className="font-medium">
                  {tokenInfo.isValid ? 'Token Válido' : 'Token Inválido'}
                </span>
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={checkTokenStatus}
                disabled={isCheckingToken}
              >
                <RefreshCw className={`h-4 w-4 ${isCheckingToken ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            
            {tokenInfo.isValid && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Usuário:</span>
                  <span className="ml-1 font-medium">{tokenInfo.username || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Saldo:</span>
                  <span className="ml-1 font-medium text-blaze-gold">
                    R$ {(typeof tokenInfo.balance === 'number' ? tokenInfo.balance : 0).toFixed(2)}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Expira em:</span>
                  <span className={`ml-1 font-medium ${
                    tokenInfo.timeRemaining === 'Expirado' ? 'text-destructive' : ''
                  }`}>
                    {tokenInfo.timeRemaining}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* New Token Input */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Novo Token JWT</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showToken ? 'text' : 'password'}
                  placeholder="eyJhbGciOiJIUzI1NiIs..."
                  value={newToken}
                  onChange={(e) => setNewToken(e.target.value)}
                  className="pr-10 text-xs"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <Button onClick={handleTokenUpdate} size="sm">
                <Save className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Cole o novo token aqui. Será copiado para a área de transferência.
            </p>
          </div>

          {/* Auto Renewal */}
          <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Alerta de renovação</span>
            </div>
            <Switch
              checked={settings.autoRenewToken}
              onCheckedChange={(v) => updateSetting('autoRenewToken', v)}
            />
          </div>

          {settings.autoRenewToken && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Alertar {settings.renewWarningMinutes} min antes de expirar
              </Label>
              <Slider
                value={[settings.renewWarningMinutes]}
                onValueChange={([v]) => updateSetting('renewWarningMinutes', v)}
                min={5}
                max={60}
                step={5}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prediction Settings */}
      <Card className="neon-border bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Configurações de Previsão
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* AI Toggle */}
          <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              <span className="text-sm">IA Ativa</span>
            </div>
            <Switch checked={useAI} onCheckedChange={setUseAI} />
          </div>

          {/* Prediction Interval */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <Label className="text-muted-foreground">Intervalo entre previsões</Label>
              <span className="font-medium">{predictionInterval} rodadas</span>
            </div>
            <Slider
              value={[predictionInterval]}
              onValueChange={([v]) => onIntervalChange(v)}
              min={1}
              max={10}
              step={1}
            />
          </div>

          {/* Max Gales */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <Label className="text-muted-foreground">Máximo de Gales</Label>
              <span className="font-medium">{settings.maxGales}</span>
            </div>
            <Slider
              value={[settings.maxGales]}
              onValueChange={([v]) => updateSetting('maxGales', v)}
              min={0}
              max={3}
              step={1}
            />
          </div>
        </CardContent>
      </Card>

      {/* Bankroll Settings */}
      <Card className="neon-border bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Wallet className="h-5 w-5 text-blaze-gold" />
            Configurações de Banca
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Base Bet */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Aposta Base (R$)</Label>
            <Input
              type="number"
              min={0.1}
              step={0.1}
              value={baseBet}
              onChange={(e) => setBaseBet(parseFloat(e.target.value) || 0)}
              className="h-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Target Profit */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Meta (R$)</Label>
              <Input
                type="number"
                min={1}
                value={settings.targetProfit}
                onChange={(e) => updateSetting('targetProfit', parseFloat(e.target.value) || 0)}
                className="h-9"
              />
            </div>
            
            {/* Stop Loss */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Stop Loss (R$)</Label>
              <Input
                type="number"
                min={1}
                value={settings.stopLoss}
                onChange={(e) => updateSetting('stopLoss', parseFloat(e.target.value) || 0)}
                className="h-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card className="neon-border bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Bell className="h-5 w-5 text-accent" />
            Notificações e Sons
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Sound Toggle */}
          <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
            <div className="flex items-center gap-2">
              {settings.soundEnabled ? (
                <Volume2 className="h-4 w-4 text-accent" />
              ) : (
                <VolumeX className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm">Sons ativados</span>
            </div>
            <Switch
              checked={settings.soundEnabled}
              onCheckedChange={(v) => updateSetting('soundEnabled', v)}
            />
          </div>

          {settings.soundEnabled && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <Label className="text-muted-foreground">Volume</Label>
                <span className="font-medium">{settings.soundVolume}%</span>
              </div>
              <Slider
                value={[settings.soundVolume]}
                onValueChange={([v]) => updateSetting('soundVolume', v)}
                min={0}
                max={100}
                step={10}
              />
            </div>
          )}

          <Separator />

          {/* Notification Types */}
          <div className="space-y-2">
            <div className="flex items-center justify-between py-1">
              <span className="text-sm">Notificar sinais</span>
              <Switch
                checked={settings.notifyOnSignal}
                onCheckedChange={(v) => updateSetting('notifyOnSignal', v)}
              />
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm">Notificar vitórias</span>
              <Switch
                checked={settings.notifyOnWin}
                onCheckedChange={(v) => updateSetting('notifyOnWin', v)}
              />
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm">Notificar perdas</span>
              <Switch
                checked={settings.notifyOnLoss}
                onCheckedChange={(v) => updateSetting('notifyOnLoss', v)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reset Button */}
      <Button
        variant="outline"
        className="w-full"
        onClick={() => {
          if (confirm('Tem certeza que deseja resetar todas as configurações?')) {
            localStorage.removeItem('blaze-settings');
            localStorage.removeItem('blaze-prediction-interval');
            localStorage.removeItem('blaze-base-bet');
            localStorage.removeItem('blaze-total-profit');
            localStorage.removeItem('autobet-config');
            window.location.reload();
          }
        }}
      >
        <RotateCcw className="h-4 w-4 mr-2" />
        Resetar Todas as Configurações
      </Button>
    </div>
  );
}
