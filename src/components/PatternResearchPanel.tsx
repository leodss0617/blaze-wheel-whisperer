import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Globe, 
  Search, 
  RefreshCw, 
  Lightbulb, 
  ExternalLink,
  Brain,
  TrendingUp 
} from 'lucide-react';
import { usePatternResearch } from '@/hooks/usePatternResearch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export function PatternResearchPanel() {
  const { isResearching, lastResearch, searchPatterns, loadCachedResearch } = usePatternResearch();
  const [showInsights, setShowInsights] = useState(true);
  const [showStrategies, setShowStrategies] = useState(true);

  // Load cached research on mount
  useEffect(() => {
    loadCachedResearch();
  }, [loadCachedResearch]);

  return (
    <Card className="bg-card/50 backdrop-blur border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            Pesquisa de Padrões
          </CardTitle>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={searchPatterns}
            disabled={isResearching}
            className="h-7 text-xs"
          >
            {isResearching ? (
              <>
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                Pesquisando...
              </>
            ) : (
              <>
                <Search className="h-3 w-3 mr-1" />
                Pesquisar
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {!lastResearch && !isResearching && (
          <div className="text-center py-4 text-muted-foreground">
            <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs">Clique em "Pesquisar" para buscar padrões e estratégias na internet</p>
          </div>
        )}

        {isResearching && (
          <div className="text-center py-4">
            <RefreshCw className="h-8 w-8 mx-auto mb-2 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Buscando padrões e estratégias...</p>
          </div>
        )}

        {lastResearch && !isResearching && (
          <>
            {/* Summary */}
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px]">
                <Lightbulb className="h-2.5 w-2.5 mr-1" />
                {lastResearch.insights.length} insights
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                <TrendingUp className="h-2.5 w-2.5 mr-1" />
                {lastResearch.strategies.length} estratégias
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                <ExternalLink className="h-2.5 w-2.5 mr-1" />
                {lastResearch.sources.length} fontes
              </Badge>
            </div>

            {/* Insights */}
            {lastResearch.insights.length > 0 && (
              <Collapsible open={showInsights} onOpenChange={setShowInsights}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full h-7 text-xs justify-start">
                    <Lightbulb className="h-3 w-3 mr-2 text-yellow-400" />
                    Insights ({lastResearch.insights.length})
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ScrollArea className="h-32 rounded-lg bg-muted/20 p-2">
                    <ul className="space-y-1">
                      {lastResearch.insights.slice(0, 10).map((insight, idx) => (
                        <li key={idx} className="text-[10px] text-muted-foreground">
                          • {insight.slice(0, 150)}...
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Strategies */}
            {lastResearch.strategies.length > 0 && (
              <Collapsible open={showStrategies} onOpenChange={setShowStrategies}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full h-7 text-xs justify-start">
                    <TrendingUp className="h-3 w-3 mr-2 text-green-400" />
                    Estratégias ({lastResearch.strategies.length})
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ScrollArea className="h-32 rounded-lg bg-muted/20 p-2">
                    <ul className="space-y-1">
                      {lastResearch.strategies.slice(0, 10).map((strategy, idx) => (
                        <li key={idx} className="text-[10px] text-muted-foreground">
                          • {strategy.slice(0, 150)}...
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                </CollapsibleContent>
              </Collapsible>
            )}

            {lastResearch.researchedAt && (
              <p className="text-[9px] text-muted-foreground text-center">
                Última pesquisa: {new Date(lastResearch.researchedAt).toLocaleString('pt-BR')}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
