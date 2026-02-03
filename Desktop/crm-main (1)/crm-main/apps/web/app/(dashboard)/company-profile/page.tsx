'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCompanyProfile } from '@/lib/api-hooks';

function derivePublicUrlFromLogoPath(logoPath: string) {
  const cleaned = logoPath.replace(/^\/+/, '');
  const parts = cleaned.split('/');
  const bucket = parts[0] || 'company-assets';
  const objectPath = parts.slice(1).join('/');
  if (!objectPath) return null;
  return supabase.storage.from(bucket).getPublicUrl(objectPath).data.publicUrl;
}

export default function CompanyProfilePage() {
  const { profile, loading, error, updateProfile, refetch } = useCompanyProfile();

  const [companyName, setCompanyName] = useState('');
  const [representativeName, setRepresentativeName] = useState('');
  const [representativeTitle, setRepresentativeTitle] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [website, setWebsite] = useState('');
  const [logoPath, setLogoPath] = useState<string>('');
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setCompanyName(profile.company_name || '');
    setRepresentativeName((profile as any).representative_name || '');
    setRepresentativeTitle((profile as any).representative_title || '');
    setAddress(profile.address || '');
    setPhone(profile.phone || '');
    setEmail(profile.email || '');
    setTaxCode(profile.tax_code || '');
    setWebsite(profile.website || '');
    setLogoPath(profile.logo_path || '');
    setLogoUrl(profile.logo_url || '');
  }, [profile]);

  const previewLogoUrl = useMemo(() => {
    if (logoUrl) return logoUrl;
    if (logoPath) return derivePublicUrlFromLogoPath(logoPath);
    return null;
  }, [logoPath, logoUrl]);

  const handleUploadLogo = async (file: File) => {
    setIsUploading(true);
    try {
      const bucket = 'company-assets';
      const ext = (file.name.split('.').pop() || 'png').toLowerCase();
      const objectPath = `logo-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from(bucket)
        .upload(objectPath, file, { upsert: true, contentType: file.type || 'image/png' });
      if (uploadErr) throw uploadErr;

      const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(objectPath);
      const publicUrl = publicUrlData.publicUrl;

      setLogoPath(`${bucket}/${objectPath}`);
      setLogoUrl(publicUrl);

      const ok = await updateProfile({
        logo_path: `${bucket}/${objectPath}`,
        logo_url: publicUrl,
      } as any);
      if (ok) {
        toast.success('Đã upload & lưu logo công ty.');
        await refetch();
      } else {
        toast.error('Upload logo xong nhưng chưa lưu được DB.');
      }
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.toLowerCase().includes('bucket not found')) {
        toast.error('Chưa có bucket "company-assets". Hãy chạy `apps/web/SETUP-COMPANY-PROFILE.sql` trong Supabase SQL Editor.');
      } else {
        toast.error(`Lỗi upload logo: ${msg}`);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const ok = await updateProfile({
        company_name: companyName,
        representative_name: representativeName || null,
        representative_title: representativeTitle || null,
        address,
        phone,
        email,
        tax_code: taxCode,
        website,
        logo_path: logoPath || null,
        logo_url: logoUrl || null,
      } as any);

      if (ok) {
        toast.success('Đã lưu thông tin công ty.');
        await refetch();
      } else {
        toast.error('Không thể lưu thông tin công ty.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto mb-4"></div>
          <p className="text-slate-600">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          Lỗi: {error}
          <div className="text-xs text-red-600 mt-2">
            Gợi ý: chạy `apps/web/SETUP-COMPANY-PROFILE.sql` trong Supabase SQL Editor để tạo bảng `company_profile`.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Thông tin công ty</h1>
        <p className="text-slate-500 text-sm">
          Các mẫu PDF (Báo giá) sẽ tự động lấy thông tin & logo từ đây.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-sm font-semibold text-slate-700 mb-3">Thông tin cơ bản</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm sm:col-span-2"
              placeholder="Tên công ty"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
            <input
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder="Người đại diện"
              value={representativeName}
              onChange={(e) => setRepresentativeName(e.target.value)}
            />
            <input
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder="Chức vụ"
              value={representativeTitle}
              onChange={(e) => setRepresentativeTitle(e.target.value)}
            />
            <input
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder="Số điện thoại"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <input
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder="MST"
              value={taxCode}
              onChange={(e) => setTaxCode(e.target.value)}
            />
            <input
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder="Website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
            <input
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm sm:col-span-2"
              placeholder="Địa chỉ"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-accent text-white rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-60"
            >
              {isSaving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="text-sm font-semibold text-slate-700 mb-3">Logo công ty</div>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
              {previewLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewLogoUrl} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <span className="text-xs text-slate-500">Chưa có</span>
              )}
            </div>

            <label className="inline-flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer">
              <Upload size={16} />
              {isUploading ? 'Đang upload...' : 'Upload logo'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={isUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadLogo(file);
                  e.currentTarget.value = '';
                }}
              />
            </label>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2">
            <input
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder="logo_path (vd: company-assets/logo.png)"
              value={logoPath}
              onChange={(e) => setLogoPath(e.target.value)}
            />
            <input
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              placeholder="logo_url (public URL)"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
            />
            <div className="text-xs text-slate-500">
              Gợi ý: chạy `apps/web/SETUP-COMPANY-PROFILE.sql` để có bucket `company-assets`.
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-accent text-white rounded-lg font-medium hover:bg-blue-600 transition-colors disabled:opacity-60"
            >
              {isSaving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

