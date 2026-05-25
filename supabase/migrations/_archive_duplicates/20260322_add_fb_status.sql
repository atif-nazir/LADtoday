-- Drop the boolean column
ALTER TABLE articles DROP COLUMN IF EXISTS fb_posted;

-- Add a more flexible status column: 'queued', 'auto_posted', 'manual_posted', 'skipped'
ALTER TABLE articles ADD COLUMN IF NOT EXISTS fb_status text DEFAULT 'skipped';

-- Clean up any existing articles to be 'skipped' (removing them from the auto queue)
UPDATE articles SET fb_status = 'skipped' WHERE fb_status IS NULL;
