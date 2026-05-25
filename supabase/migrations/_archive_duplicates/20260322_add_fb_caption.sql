-- Add Facebook caption field to articles table
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS fb_caption TEXT DEFAULT NULL;
