'use client';

import { useState } from 'react';
import { useLeadSources, useCampaigns } from '@/lib/api-hooks';
import { source_type, LeadSource, Campaign } from '@/lib/types';
import { PlusCircle, Edit, Trash2 } from 'lucide-react';
import { LeadSourceFormModal } from '@/components/features/lead-sources/LeadSourceFormModal';
import { CampaignFormModal } from '@/components/features/lead-sources/CampaignFormModal';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { toast } from 'sonner';

const sourceTypeLabels: Record<source_type, string> = {
  facebook: 'Facebook',
  zalo: 'Zalo',
  tiktok: 'TikTok',
  website: 'Website',
  referral: 'Giới thiệu',
  other: 'Khác',
};

export default function LeadSourcesPage() {
  const [activeTab, setActiveTab] = useState<'sources' | 'campaigns'>('sources');

  const {
    sources,
    loading: sourcesLoading,
    error: sourcesError,
    addSource,
    updateSource,
    deleteSource
  } = useLeadSources();

  const {
    campaigns,
    loading: campaignsLoading,
    error: campaignsError,
    addCampaign,
    updateCampaign,
    deleteCampaign
  } = useCampaigns();

  // Modal states
  const [isAddSourceModalOpen, setIsAddSourceModalOpen] = useState(false);
  const [isEditSourceModalOpen, setIsEditSourceModalOpen] = useState(false);
  const [isAddCampaignModalOpen, setIsAddCampaignModalOpen] = useState(false);
  const [isEditCampaignModalOpen, setIsEditCampaignModalOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<LeadSource | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'warning' | 'info';
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const loading = activeTab === 'sources' ? sourcesLoading : campaignsLoading;
  const error = activeTab === 'sources' ? sourcesError : campaignsError;

  // Lead Source Handlers
  const handleAddSource = async (data: any) => {
    const success = await addSource(data);
    return success;
  };

  const handleEditSource = async (data: any) => {
    if (!selectedSource) return false;
    const success = await updateSource(selectedSource.id, data);
    return success;
  };

  const handleDeleteSource = (sourceId: number, sourceName: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Xóa nguồn lead',
      message: `Bạn có chắc muốn xóa nguồn "${sourceName}"?`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        const success = await deleteSource(sourceId);
        if (success) {
          toast.success('Đã xóa nguồn lead thành công!');
        }
      },
    });
  };

  const handleEditSourceClick = (source: LeadSource) => {
    setSelectedSource(source);
    setIsEditSourceModalOpen(true);
  };

  // Campaign Handlers
  const handleAddCampaign = async (data: any) => {
    const success = await addCampaign(data);
    return success;
  };

  const handleEditCampaign = async (data: any) => {
    if (!selectedCampaign) return false;
    const success = await updateCampaign(selectedCampaign.id, data);
    return success;
  };

  const handleDeleteCampaign = (campaignId: number, campaignName: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Xóa chiến dịch',
      message: `Bạn có chắc muốn xóa chiến dịch "${campaignName}"?`,
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        const success = await deleteCampaign(campaignId);
        if (success) {
          toast.success('Đã xóa chiến dịch thành công!');
        }
      },
    });
  };

  const handleEditCampaignClick = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    setIsEditCampaignModalOpen(true);
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
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Quản lý Nguồn Lead & Chiến dịch</h1>
          <p className="text-slate-500 text-sm">Cấu hình nguồn thu thập lead và các chiến dịch marketing</p>
        </div>
        <button
          onClick={() => activeTab === 'sources' ? setIsAddSourceModalOpen(true) : setIsAddCampaignModalOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-lg hover:bg-blue-600 shadow-md hover:shadow-lg transition-all font-medium"
        >
          <PlusCircle size={20} />
          {activeTab === 'sources' ? 'Thêm nguồn lead' : 'Thêm chiến dịch'}
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-4 mb-6 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('sources')}
          className={`pb-3 px-4 font-medium transition ${
            activeTab === 'sources'
              ? 'border-b-2 border-accent text-accent'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Nguồn Lead ({sources.length})
        </button>
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`pb-3 px-4 font-medium transition ${
            activeTab === 'campaigns'
              ? 'border-b-2 border-accent text-accent'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Chiến dịch ({campaigns.length})
        </button>
      </div>

      {/* Lead Sources Table */}
      {activeTab === 'sources' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">ID</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Tên</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Loại</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Mô tả</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Trạng thái</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sources.map((source) => (
                <tr key={source.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-slate-700 font-medium">#{source.id}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-slate-900">{source.name}</td>
                  <td className="px-6 py-4">
                    <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                      {sourceTypeLabels[source.type]}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 max-w-xs truncate">
                    {source.description || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        source.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {source.is_active ? 'Hoạt động' : 'Ngừng'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleEditSourceClick(source)}
                        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded"
                        title="Chỉnh sửa"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteSource(source.id, source.name)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Xóa"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {sources.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              Chưa có nguồn lead nào. Nhấn "Thêm nguồn lead" để bắt đầu.
            </div>
          )}
        </div>
      )}

      {/* Campaigns Table */}
      {activeTab === 'campaigns' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">ID</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Tên chiến dịch</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Nguồn</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Mã</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Ngân sách</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Thời gian</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase">Trạng thái</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaigns.map((campaign) => (
                <tr key={campaign.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 text-sm text-slate-700 font-medium">#{campaign.id}</td>
                  <td className="px-6 py-4 text-sm font-semibold text-slate-900">{campaign.name}</td>
                  <td className="px-6 py-4 text-sm text-slate-700">
                    {campaign.lead_sources?.name || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500 font-mono">{campaign.code || '-'}</td>
                  <td className="px-6 py-4 text-sm text-slate-900">
                    {campaign.budget ? `${Number(campaign.budget).toLocaleString('vi-VN')} đ` : '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    <div className="flex flex-col gap-1">
                      <div>
                        {campaign.start_date
                          ? new Date(campaign.start_date).toLocaleDateString('vi-VN')
                          : '-'}
                      </div>
                      {campaign.end_date && (
                        <div className="text-xs text-slate-400">
                          đến {new Date(campaign.end_date).toLocaleDateString('vi-VN')}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        campaign.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {campaign.is_active ? 'Hoạt động' : 'Ngừng'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleEditCampaignClick(campaign)}
                        className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded"
                        title="Chỉnh sửa"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteCampaign(campaign.id, campaign.name)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Xóa"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {campaigns.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              Chưa có chiến dịch nào. Nhấn "Thêm chiến dịch" để bắt đầu.
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <LeadSourceFormModal
        mode={isEditSourceModalOpen ? 'edit' : 'add'}
        isOpen={isAddSourceModalOpen || isEditSourceModalOpen}
        onClose={() => {
          setIsAddSourceModalOpen(false);
          setIsEditSourceModalOpen(false);
          setSelectedSource(null);
        }}
        onSubmit={isEditSourceModalOpen ? handleEditSource : handleAddSource}
        defaultValues={isEditSourceModalOpen ? selectedSource : undefined}
      />

      <CampaignFormModal
        mode={isEditCampaignModalOpen ? 'edit' : 'add'}
        isOpen={isAddCampaignModalOpen || isEditCampaignModalOpen}
        onClose={() => {
          setIsAddCampaignModalOpen(false);
          setIsEditCampaignModalOpen(false);
          setSelectedCampaign(null);
        }}
        onSubmit={isEditCampaignModalOpen ? handleEditCampaign : handleAddCampaign}
        defaultValues={isEditCampaignModalOpen ? selectedCampaign : undefined}
        sources={sources}
      />

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
      />
    </div>
  );
}
