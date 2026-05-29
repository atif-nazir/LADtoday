-- Create private storage bucket for pipeline inputs (PDF/image uploads)
-- Used by Scout agent for PDF and image input modes

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pipeline-inputs',
  'pipeline-inputs',
  false,
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: only authenticated admins can insert
CREATE POLICY "admin_insert_pipeline_inputs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'pipeline-inputs'
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- RLS: admins can read their own uploads
CREATE POLICY "admin_read_pipeline_inputs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'pipeline-inputs'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
      )
    )
  );

-- RLS: admins can delete their own uploads
CREATE POLICY "admin_delete_pipeline_inputs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'pipeline-inputs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
