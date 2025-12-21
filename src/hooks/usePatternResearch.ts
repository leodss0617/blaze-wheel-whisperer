import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ResearchResult {
  success: boolean;
  insights: string[];
  strategies: string[];
  sources: string[];
  researchedAt?: string;
}

export function usePatternResearch() {
  const [isResearching, setIsResearching] = useState(false);
  const [lastResearch, setLastResearch] = useState<ResearchResult | null>(null);
  const [researchHistory, setResearchHistory] = useState<ResearchResult[]>([]);
  const { toast } = useToast();

  // Fetch patterns from internet
  const searchPatterns = useCallback(async (): Promise<ResearchResult> => {
    setIsResearching(true);
    
    try {
      console.log('Starting pattern research...');
      
      const { data, error } = await supabase.functions.invoke('pattern-research');

      if (error) {
        console.error('Research error:', error);
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || 'Research failed');
      }

      const result: ResearchResult = {
        success: true,
        insights: data.insights || [],
        strategies: data.strategies || [],
        sources: data.sources || [],
        researchedAt: new Date().toISOString(),
      };

      setLastResearch(result);
      setResearchHistory(prev => [result, ...prev.slice(0, 9)]);

      toast({
        title: "Pesquisa Concluída",
        description: `Encontrados ${result.insights.length} insights e ${result.strategies.length} estratégias`,
      });

      return result;
    } catch (e) {
      console.error('Error in pattern research:', e);
      toast({
        title: "Erro na Pesquisa",
        description: e instanceof Error ? e.message : "Não foi possível pesquisar padrões",
        variant: "destructive",
      });
      return {
        success: false,
        insights: [],
        strategies: [],
        sources: [],
      };
    } finally {
      setIsResearching(false);
    }
  }, [toast]);

  // Load cached research from database
  const loadCachedResearch = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('learned_patterns')
        .select('pattern_data, updated_at')
        .eq('pattern_key', 'web_research:latest')
        .maybeSingle();

      if (data?.pattern_data) {
        const patternData = data.pattern_data as Record<string, unknown>;
        const result: ResearchResult = {
          success: true,
          insights: (patternData.insights as string[]) || [],
          strategies: (patternData.strategies as string[]) || [],
          sources: (patternData.sources as string[]) || [],
          researchedAt: patternData.researchedAt as string,
        };
        setLastResearch(result);
        return result;
      }
    } catch (e) {
      console.error('Error loading cached research:', e);
    }
    return null;
  }, []);

  return {
    isResearching,
    lastResearch,
    researchHistory,
    searchPatterns,
    loadCachedResearch,
  };
}
