
-- Create storage bucket for company logos
INSERT INTO storage.buckets (id, name, public) VALUES ('company-logos', 'company-logos', true);

-- Allow authenticated users to upload logos
CREATE POLICY "Authenticated users can upload logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'company-logos');

-- Allow anyone to view logos (public bucket)
CREATE POLICY "Anyone can view logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'company-logos');

-- Allow authenticated users to update their uploads
CREATE POLICY "Authenticated users can update logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'company-logos');

-- Allow authenticated users to delete logos
CREATE POLICY "Authenticated users can delete logos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'company-logos');
