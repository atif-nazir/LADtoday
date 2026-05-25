
-- Storage bucket for pipeline inputs (PDF, image attachments uploaded by admins on /admin/pipeline)
INSERT INTO storage.buckets (id, name, public)
VALUES ('pipeline-inputs', 'pipeline-inputs', false)
ON CONFLICT (id) DO NOTHING;

-- Admins can upload to this bucket
CREATE POLICY "Admins upload pipeline inputs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'pipeline-inputs' AND public.has_role(auth.uid(), 'admin'));

-- Admins can read their own / any pipeline inputs
CREATE POLICY "Admins read pipeline inputs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'pipeline-inputs' AND public.has_role(auth.uid(), 'admin'));

-- Admins can delete pipeline inputs
CREATE POLICY "Admins delete pipeline inputs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'pipeline-inputs' AND public.has_role(auth.uid(), 'admin'));
