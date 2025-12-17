-- Create learned_patterns table for AI learning
CREATE TABLE public.learned_patterns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_type TEXT NOT NULL, -- 'color_sequence', 'streak', 'after_white', etc
  pattern_key TEXT NOT NULL, -- unique identifier for this pattern
  pattern_data JSONB NOT NULL, -- the actual pattern data
  times_seen INTEGER NOT NULL DEFAULT 1,
  times_correct INTEGER NOT NULL DEFAULT 0,
  success_rate DECIMAL(5,2) DEFAULT 0,
  last_result TEXT, -- last actual result for this pattern
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(pattern_type, pattern_key)
);

-- Create white_patterns table for white protection learning
CREATE TABLE public.white_patterns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gap_range TEXT NOT NULL, -- '0-10', '11-20', '21-30', '31+'
  times_seen INTEGER NOT NULL DEFAULT 1,
  times_white_appeared INTEGER NOT NULL DEFAULT 0,
  average_gap_when_appeared DECIMAL(5,2) DEFAULT 0,
  sequence_before_white TEXT[], -- store sequences that preceded white
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(gap_range)
);

-- Enable RLS
ALTER TABLE public.learned_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.white_patterns ENABLE ROW LEVEL SECURITY;

-- Public read/write for the bot (no auth required for this app)
CREATE POLICY "Allow all operations on learned_patterns"
ON public.learned_patterns FOR ALL
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow all operations on white_patterns"
ON public.white_patterns FOR ALL
USING (true)
WITH CHECK (true);

-- Add indexes
CREATE INDEX idx_learned_patterns_type_success ON public.learned_patterns(pattern_type, success_rate DESC);
CREATE INDEX idx_learned_patterns_key ON public.learned_patterns(pattern_key);
CREATE INDEX idx_white_patterns_gap ON public.white_patterns(gap_range);

-- Triggers for updated_at
CREATE TRIGGER update_learned_patterns_updated_at
BEFORE UPDATE ON public.learned_patterns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_white_patterns_updated_at
BEFORE UPDATE ON public.white_patterns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Initialize white patterns with default ranges
INSERT INTO public.white_patterns (gap_range, times_seen, times_white_appeared)
VALUES 
  ('0-10', 0, 0),
  ('11-15', 0, 0),
  ('16-20', 0, 0),
  ('21-25', 0, 0),
  ('26-30', 0, 0),
  ('31+', 0, 0)
ON CONFLICT (gap_range) DO NOTHING;