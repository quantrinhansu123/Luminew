-- Drop strict policies if they exist
DROP POLICY IF EXISTS "Authenticated can insert news" ON public.news;
DROP POLICY IF EXISTS "Creator can update news" ON public.news;
DROP POLICY IF EXISTS "Enable insert for all" ON public.news;
DROP POLICY IF EXISTS "Enable update for all" ON public.news;
DROP POLICY IF EXISTS "Enable delete for all" ON public.news;


-- Add permissive policies (Allows anyone to Read/Write)
-- Essential for internal tools where Auth states might vary locally
CREATE POLICY "Enable insert for all" ON public.news FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for all" ON public.news FOR UPDATE USING (true);
CREATE POLICY "Enable delete for all" ON public.news FOR DELETE USING (true);
