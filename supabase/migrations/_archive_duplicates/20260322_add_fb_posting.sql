-- Add Facebook posting tracking columns to articles
ALTER TABLE articles ADD COLUMN IF NOT EXISTS fb_posted boolean DEFAULT false;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS fb_posted_at timestamptz;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS fb_post_id text;

-- Ensure the auto_fb_post_enabled setting exists
INSERT INTO settings (key, value, updated_at)
VALUES ('auto_fb_post_enabled', true, now())
ON CONFLICT (key) DO NOTHING;

-- Ensure the auto_thumbnail_enabled setting exists
INSERT INTO settings (key, value, updated_at)
VALUES ('auto_thumbnail_enabled', true, now())
ON CONFLICT (key) DO NOTHING;
