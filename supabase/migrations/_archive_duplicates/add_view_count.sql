-- Add view_count column to articles table
ALTER TABLE articles ADD COLUMN IF NOT EXISTS view_count bigint DEFAULT 0;

-- Create an RPC function to increment the view count atomically
CREATE OR REPLACE FUNCTION increment_view_count(article_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE articles
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = article_id;
END;
$$ LANGUAGE plpgsql;
