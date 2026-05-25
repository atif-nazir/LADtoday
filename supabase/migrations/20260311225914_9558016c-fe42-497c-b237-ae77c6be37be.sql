
-- Newsletter subscribers table
CREATE TABLE public.subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  subscribed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Enable RLS
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;

-- Anyone can subscribe (insert)
CREATE POLICY "Anyone can subscribe" ON public.subscribers
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Users can view their own subscription
CREATE POLICY "Users can view own subscription" ON public.subscribers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can update their own subscription  
CREATE POLICY "Users can update own subscription" ON public.subscribers
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Admins can view all subscribers
CREATE POLICY "Admins can view all subscribers" ON public.subscribers
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
