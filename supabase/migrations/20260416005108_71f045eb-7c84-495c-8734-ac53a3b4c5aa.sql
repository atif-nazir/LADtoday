
-- ═══════════════════════════════════════════════════════════
-- ADMIN GOD MODE: Grant unrestricted access to all tables
-- ═══════════════════════════════════════════════════════════

-- categories: Admin full CRUD (currently missing INSERT/UPDATE/DELETE)
CREATE POLICY "Admin god mode categories" ON public.categories
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- settings: Admin DELETE (currently missing)
CREATE POLICY "Admins can delete settings" ON public.settings
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- subscribers: Admin DELETE (currently missing)
CREATE POLICY "Admins can delete subscribers" ON public.subscribers
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- admin_logs: Admin UPDATE (currently missing)
CREATE POLICY "Admins can update logs" ON public.admin_logs
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- profiles: Admin god mode (view all profiles, not just own)
CREATE POLICY "Admin god mode profiles" ON public.profiles
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- user_roles: Admin god mode (manage roles)
CREATE POLICY "Admin god mode user_roles" ON public.user_roles
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- subscribers: Admin INSERT + UPDATE (for admin management)
CREATE POLICY "Admins can manage subscribers" ON public.subscribers
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
