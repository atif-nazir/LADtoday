-- Fix agent_outputs RLS to allow service_role writes
-- This ensures edge functions can write agent outputs

-- Drop existing restrictive policy if it exists
DROP POLICY IF EXISTS "Admins manage agent_outputs" ON public.agent_outputs;

-- Create service_role policy (edge functions use service_role key)
CREATE POLICY "service_role_full_access" 
  ON public.agent_outputs 
  FOR ALL 
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Re-create admin policy
CREATE POLICY "Admins manage agent_outputs"
  ON public.agent_outputs 
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
