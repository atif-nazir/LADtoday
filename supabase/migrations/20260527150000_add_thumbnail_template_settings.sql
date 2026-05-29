-- Add missing columns to scraper_sources and facebook_pages
ALTER TABLE public.scraper_sources 
ADD COLUMN IF NOT EXISTS thumbnail_template TEXT DEFAULT 'classic';

ALTER TABLE public.facebook_pages 
ADD COLUMN IF NOT EXISTS thumbnail_template TEXT DEFAULT 'classic';

ALTER TABLE public.facebook_pages 
ADD COLUMN IF NOT EXISTS default_post_type TEXT DEFAULT 'photo';

-- Create the 'thumbnails' storage bucket if it does not exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('thumbnails', 'thumbnails', true)
ON CONFLICT (id) DO NOTHING;

-- Set up Policies for 'thumbnails' storage bucket
DROP POLICY IF EXISTS "Public read access for thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update thumbnails" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete thumbnails" ON storage.objects;

-- Allow public read access to thumbnails
CREATE POLICY "Public read access for thumbnails"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'thumbnails');

-- Allow admins to insert/upload thumbnails
CREATE POLICY "Admins can upload thumbnails" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'thumbnails' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- Allow admins to update thumbnails
CREATE POLICY "Admins can update thumbnails" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'thumbnails' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- Allow admins to delete thumbnails
CREATE POLICY "Admins can delete thumbnails" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'thumbnails' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- Create the 'pipeline-inputs' storage bucket if it does not exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('pipeline-inputs', 'pipeline-inputs', false)
ON CONFLICT (id) DO NOTHING;

-- Set up Policies for 'pipeline-inputs' storage bucket
DROP POLICY IF EXISTS "Admins upload pipeline inputs" ON storage.objects;
DROP POLICY IF EXISTS "Admins read pipeline inputs" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete pipeline inputs" ON storage.objects;

-- Admins can upload to this bucket
CREATE POLICY "Admins upload pipeline inputs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'pipeline-inputs' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- Admins can read their own / any pipeline inputs
CREATE POLICY "Admins read pipeline inputs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'pipeline-inputs' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- Admins can delete pipeline inputs
CREATE POLICY "Admins delete pipeline inputs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'pipeline-inputs' AND public.has_role(auth.uid(), 'admin'::public.app_role));
