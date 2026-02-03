-- Create News Table
CREATE TABLE IF NOT EXISTS public.news (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    image_url TEXT,
    type TEXT DEFAULT 'normal', -- 'featured', 'normal'
    created_by TEXT
);

-- Enable RLS
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can read
CREATE POLICY "Everyone can read news" ON public.news
    FOR SELECT USING (true);

-- Policy: Admin/Authenticated can insert (For now allow all authenticated to insert for ease of use)
CREATE POLICY "Authenticated can insert news" ON public.news
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Policy: Admin/Creator can update/delete
CREATE POLICY "Creator can update news" ON public.news
    FOR UPDATE USING (auth.uid() = created_by);

-- Insert Demo Data
INSERT INTO public.news (title, content, type, image_url)
VALUES 
('Chương trình Teambuilding 2024', 'Lumi Global tổ chức chuyến đi...', 'featured', ''),
('Thông báo lịch nghỉ Tết', 'Toàn thể nhân sự nghỉ từ ngày...', 'normal', ''),
('Chúc mừng sinh nhật tháng 1', 'Danh sách các thành viên...', 'normal', '');
