-- Table for storing Blaze rounds history
CREATE TABLE public.blaze_rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blaze_id TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL CHECK (color IN ('red', 'black', 'white')),
    number INTEGER NOT NULL,
    round_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for storing prediction signals
CREATE TABLE public.prediction_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    predicted_color TEXT NOT NULL CHECK (predicted_color IN ('red', 'black', 'white')),
    confidence INTEGER NOT NULL,
    reason TEXT NOT NULL,
    protections INTEGER NOT NULL DEFAULT 2,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'win', 'loss')),
    actual_result TEXT CHECK (actual_result IN ('red', 'black', 'white')),
    signal_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.blaze_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_signals ENABLE ROW LEVEL SECURITY;

-- Public read/write policies (no auth required for this bot)
CREATE POLICY "Allow public read blaze_rounds" ON public.blaze_rounds FOR SELECT USING (true);
CREATE POLICY "Allow public insert blaze_rounds" ON public.blaze_rounds FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read prediction_signals" ON public.prediction_signals FOR SELECT USING (true);
CREATE POLICY "Allow public insert prediction_signals" ON public.prediction_signals FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update prediction_signals" ON public.prediction_signals FOR UPDATE USING (true);

-- Index for faster queries
CREATE INDEX idx_blaze_rounds_timestamp ON public.blaze_rounds(round_timestamp DESC);
CREATE INDEX idx_prediction_signals_timestamp ON public.prediction_signals(signal_timestamp DESC);
CREATE INDEX idx_prediction_signals_status ON public.prediction_signals(status);

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger for auto-updating timestamps
CREATE TRIGGER update_prediction_signals_updated_at
BEFORE UPDATE ON public.prediction_signals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();