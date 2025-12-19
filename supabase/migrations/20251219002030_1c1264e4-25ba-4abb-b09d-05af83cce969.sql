-- Create bet_history table to track all bets and learn from patterns
CREATE TABLE public.bet_history (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    round_id TEXT,
    predicted_color TEXT NOT NULL,
    actual_color TEXT,
    gale_level INTEGER NOT NULL DEFAULT 0,
    bet_amount NUMERIC NOT NULL,
    potential_profit NUMERIC NOT NULL,
    actual_profit NUMERIC,
    result TEXT DEFAULT 'pending', -- 'win', 'loss', 'pending'
    bankroll_before NUMERIC NOT NULL,
    bankroll_after NUMERIC,
    confidence INTEGER NOT NULL,
    strategy TEXT,
    pattern_data JSONB DEFAULT '{}',
    session_id TEXT NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.bet_history ENABLE ROW LEVEL SECURITY;

-- Allow public access (no auth needed)
CREATE POLICY "Allow public insert bet_history"
ON public.bet_history
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow public read bet_history"
ON public.bet_history
FOR SELECT
USING (true);

CREATE POLICY "Allow public update bet_history"
ON public.bet_history
FOR UPDATE
USING (true);

-- Create bankroll_sessions table to track sessions and learning
CREATE TABLE public.bankroll_sessions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    initial_bankroll NUMERIC NOT NULL,
    target_amount NUMERIC NOT NULL,
    current_bankroll NUMERIC NOT NULL,
    base_bet NUMERIC NOT NULL,
    max_gales INTEGER NOT NULL DEFAULT 2,
    total_bets INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    total_profit NUMERIC NOT NULL DEFAULT 0,
    best_patterns JSONB DEFAULT '[]',
    learned_adjustments JSONB DEFAULT '{}',
    status TEXT DEFAULT 'active', -- 'active', 'completed', 'stopped'
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS for bankroll_sessions
ALTER TABLE public.bankroll_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on bankroll_sessions"
ON public.bankroll_sessions
FOR ALL
USING (true)
WITH CHECK (true);

-- Create betting_analytics table for learning insights
CREATE TABLE public.betting_analytics (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    hour_of_day INTEGER NOT NULL,
    day_of_week INTEGER NOT NULL,
    color TEXT NOT NULL,
    gale_level INTEGER NOT NULL,
    result TEXT NOT NULL,
    confidence INTEGER NOT NULL,
    pattern_type TEXT,
    win_rate NUMERIC DEFAULT 0,
    sample_size INTEGER DEFAULT 1
);

-- Enable RLS
ALTER TABLE public.betting_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on betting_analytics"
ON public.betting_analytics
FOR ALL
USING (true)
WITH CHECK (true);

-- Create trigger for updated_at on bankroll_sessions
CREATE TRIGGER update_bankroll_sessions_updated_at
    BEFORE UPDATE ON public.bankroll_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.bet_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bankroll_sessions;