-- Create a new public bucket for news images
INSERT INTO storage.buckets (id, name, public)
VALUES ('news-images', 'news-images', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Allow public access to view images
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'news-images' );

-- Policy: Allow everyone to upload (Simplified for internal tool)
CREATE POLICY "Everyone Upload"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'news-images' );

-- Policy: Allow everyone to update
CREATE POLICY "Everyone Update"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'news-images' );

-- Policy: Allow everyone to delete
CREATE POLICY "Everyone Delete"
ON storage.objects FOR DELETE
USING ( bucket_id = 'news-images' );
