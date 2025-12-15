import { useState, useEffect } from 'react';
import { Download, Smartphone, Check, Share, Plus, MoreVertical, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function Install() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Detect device
    const userAgent = navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));
    setIsAndroid(/android/.test(userAgent));

    // Listen for install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Listen for app installed
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        {/* Logo & Title */}
        <div className="text-center">
          <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-accent/20 to-primary/20 flex items-center justify-center neon-border">
            <Flame className="h-12 w-12 text-accent" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold">
            <span className="danger-text">BLAZE</span>
            <span className="text-foreground"> PRO</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Sistema Inteligente de Análise
          </p>
        </div>

        {/* Install Status */}
        {isInstalled ? (
          <div className="glass-card p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/20 flex items-center justify-center">
              <Check className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-primary mb-2">App Instalado!</h2>
            <p className="text-sm text-muted-foreground mb-4">
              O Blaze Pro já está instalado no seu dispositivo.
            </p>
            <Button onClick={() => navigate('/')} className="w-full">
              Abrir App
            </Button>
          </div>
        ) : (
          <>
            {/* Install Button (Android/Chrome) */}
            {deferredPrompt && (
              <div className="glass-card p-6">
                <Button 
                  onClick={handleInstall} 
                  className="w-full h-14 text-lg"
                  size="lg"
                >
                  <Download className="h-5 w-5 mr-2" />
                  Instalar App
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-3">
                  Clique para adicionar à tela inicial
                </p>
              </div>
            )}

            {/* iOS Instructions */}
            {isIOS && !deferredPrompt && (
              <div className="glass-card p-6 space-y-4">
                <h2 className="text-lg font-semibold text-center mb-4">
                  Como instalar no iPhone/iPad
                </h2>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary">1</span>
                    </div>
                    <div>
                      <p className="text-sm">Toque no botão de compartilhar</p>
                      <div className="mt-2 p-2 rounded bg-muted/50 inline-flex items-center gap-2">
                        <Share className="h-4 w-4" />
                        <span className="text-xs">Compartilhar</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary">2</span>
                    </div>
                    <div>
                      <p className="text-sm">Role e toque em "Adicionar à Tela de Início"</p>
                      <div className="mt-2 p-2 rounded bg-muted/50 inline-flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        <span className="text-xs">Adicionar à Tela de Início</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary">3</span>
                    </div>
                    <p className="text-sm">Toque em "Adicionar" para confirmar</p>
                  </div>
                </div>
              </div>
            )}

            {/* Android Manual Instructions */}
            {isAndroid && !deferredPrompt && (
              <div className="glass-card p-6 space-y-4">
                <h2 className="text-lg font-semibold text-center mb-4">
                  Como instalar no Android
                </h2>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary">1</span>
                    </div>
                    <div>
                      <p className="text-sm">Toque no menu do navegador</p>
                      <div className="mt-2 p-2 rounded bg-muted/50 inline-flex items-center gap-2">
                        <MoreVertical className="h-4 w-4" />
                        <span className="text-xs">Menu</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary">2</span>
                    </div>
                    <div>
                      <p className="text-sm">Toque em "Adicionar à tela inicial" ou "Instalar app"</p>
                      <div className="mt-2 p-2 rounded bg-muted/50 inline-flex items-center gap-2">
                        <Download className="h-4 w-4" />
                        <span className="text-xs">Instalar app</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary">3</span>
                    </div>
                    <p className="text-sm">Confirme a instalação</p>
                  </div>
                </div>
              </div>
            )}

            {/* Desktop Instructions */}
            {!isIOS && !isAndroid && !deferredPrompt && (
              <div className="glass-card p-6 space-y-4">
                <h2 className="text-lg font-semibold text-center mb-4">
                  Como instalar no computador
                </h2>
                <p className="text-sm text-muted-foreground text-center">
                  Procure pelo ícone de instalação na barra de endereços do navegador (Chrome/Edge) 
                  ou acesse este site pelo celular para melhor experiência.
                </p>
              </div>
            )}
          </>
        )}

        {/* Features */}
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold mb-4 text-center">Por que instalar?</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 rounded-lg bg-muted/30">
              <Smartphone className="h-5 w-5 mx-auto mb-2 text-primary" />
              <p className="text-xs text-muted-foreground">Acesso rápido</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/30">
              <Download className="h-5 w-5 mx-auto mb-2 text-primary" />
              <p className="text-xs text-muted-foreground">Funciona offline</p>
            </div>
          </div>
        </div>

        {/* Back to app */}
        <Button 
          variant="ghost" 
          onClick={() => navigate('/')}
          className="w-full"
        >
          Voltar para o app
        </Button>
      </div>
    </div>
  );
}
