import { useEffect, useMemo, useState } from 'react';
import { MessageSquarePlus, X } from 'lucide-react';
import usePermissions from '../hooks/usePermissions';
import {
  adminUpdateMktKpiAlertStatus,
  fetchMktKpiAlertsAdmin,
  submitMktKpiAlertExplanation,
} from '../services/mktKpiAlertsService';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function MktKpiAlertsAdmin() {
  const { canView } = usePermissions();
  const canAccess = canView('ADMIN_TOOLS');

  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 31);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => todayIso());
  const [status, setStatus] = useState('open');
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [noteDraft, setNoteDraft] = useState({});
  const [explainAlert, setExplainAlert] = useState(null);
  const [explanation, setExplanation] = useState('');
  const [solution, setSolution] = useState('');
  const [savingExplanation, setSavingExplanation] = useState(false);

  const userEmail = useMemo(() => String(localStorage.getItem('userEmail') || '').trim(), []);
  const userName = useMemo(
    () => String(localStorage.getItem('userName') || localStorage.getItem('username') || '').trim(),
    []
  );

  const openExplanationForm = (alertRow) => {
    setExplainAlert(alertRow);
    setExplanation(alertRow.explanation || '');
    setSolution(alertRow.solution || '');
    setError('');
  };

  const closeExplanationForm = () => {
    if (savingExplanation) return;
    setExplainAlert(null);
    setExplanation('');
    setSolution('');
  };

  const saveExplanation = async () => {
    if (!explainAlert?.alert_id) return;
    setSavingExplanation(true);
    setError('');
    try {
      await submitMktKpiAlertExplanation({
        alertId: explainAlert.alert_id,
        explanation,
        solution,
        byEmail: userEmail,
        byName: userName,
      });
      closeExplanationForm();
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSavingExplanation(false);
    }
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchMktKpiAlertsAdmin({
        fromDate,
        toDate,
        status,
        employeeQuery,
        limit: 800,
      });
      setRows(data);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canAccess) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess]);

  if (!canAccess) {
    return (
      <div className="p-8 text-center text-red-600 font-bold">
        Bạn không có quyền truy cập trang này (ADMIN_TOOLS).
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-gray-800">Quản lý cảnh báo MKT</h1>
          <button
            type="button"
            onClick={load}
            className="px-3 py-2 rounded bg-green-600 text-white text-sm font-semibold hover:bg-green-700"
            disabled={loading}
          >
            {loading ? 'Đang tải...' : 'Tải lại'}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Từ ngày</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Đến ngày</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Trạng thái</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white"
            >
              <option value="open">Mới</option>
              <option value="explained">Đã giải trình</option>
              <option value="resolved">Đã xử lý</option>
              <option value="ignored">Bỏ qua</option>
              <option value="all">Tất cả</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Nhân sự</label>
            <input
              value={employeeQuery}
              onChange={(e) => setEmployeeQuery(e.target.value)}
              placeholder="Tìm theo tên…"
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={load}
            className="px-3 py-2 rounded bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
            disabled={loading}
          >
            Lọc
          </button>
        </div>

        {error && <div className="mt-3 text-sm text-red-600 font-semibold">{error}</div>}

        <div className="mt-4 overflow-x-auto border border-gray-200 rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left">
                <th className="p-2">Ngày</th>
                <th className="p-2">Nhân sự</th>
                <th className="p-2">Team</th>
                <th className="p-2">Mức</th>
                <th className="p-2">Nội dung</th>
                <th className="p-2">Nguyên nhân</th>
                <th className="p-2">Giải trình</th>
                <th className="p-2">Giải pháp</th>
                <th className="p-2">Trạng thái</th>
                <th className="p-2">Xử lý</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="p-3 text-gray-600" colSpan={10}>
                    {loading ? 'Đang tải dữ liệu…' : 'Không có dữ liệu.'}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.alert_id} className="border-t border-gray-100 align-top">
                    <td className="p-2 whitespace-nowrap">{r.report_date || r.date_label || ''}</td>
                    <td className="p-2 whitespace-nowrap font-semibold">{r.employee_name}</td>
                    <td className="p-2 whitespace-nowrap">{r.team || ''}</td>
                    <td className="p-2 whitespace-nowrap">{r.severity}</td>
                    <td className="p-2 min-w-[18rem]">{r.content}</td>
                    <td className="p-2 min-w-[16rem]">{r.cause || ''}</td>
                    <td className="p-2 min-w-[16rem]">{r.explanation || ''}</td>
                    <td className="p-2 min-w-[16rem]">{r.solution || ''}</td>
                    <td className="p-2 whitespace-nowrap">{r.status}</td>
                    <td className="p-2 min-w-[16rem]">
                      <textarea
                        rows={2}
                        value={noteDraft[r.alert_id] ?? r.admin_note ?? ''}
                        onChange={(e) =>
                          setNoteDraft((prev) => ({ ...prev, [r.alert_id]: e.target.value }))
                        }
                        className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                        placeholder="Ghi chú admin…"
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openExplanationForm(r)}
                          className="inline-flex items-center gap-1.5 rounded bg-indigo-600 px-2 py-1 text-xs font-semibold text-white hover:bg-indigo-700"
                        >
                          <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
                          Thêm giải trình
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await adminUpdateMktKpiAlertStatus({
                              alertId: r.alert_id,
                              status: 'resolved',
                              adminNote: noteDraft[r.alert_id] ?? r.admin_note,
                              resolvedByEmail: userEmail,
                            });
                            load();
                          }}
                          className="px-2 py-1 rounded bg-green-600 text-white text-xs font-semibold hover:bg-green-700"
                        >
                          Đã xử lý
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await adminUpdateMktKpiAlertStatus({
                              alertId: r.alert_id,
                              status: 'ignored',
                              adminNote: noteDraft[r.alert_id] ?? r.admin_note,
                              resolvedByEmail: userEmail,
                            });
                            load();
                          }}
                          className="px-2 py-1 rounded bg-gray-600 text-white text-xs font-semibold hover:bg-gray-700"
                        >
                          Bỏ qua
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await adminUpdateMktKpiAlertStatus({
                              alertId: r.alert_id,
                              status: 'open',
                              adminNote: noteDraft[r.alert_id] ?? r.admin_note,
                              resolvedByEmail: userEmail,
                            });
                            load();
                          }}
                          className="px-2 py-1 rounded bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
                        >
                          Mở lại
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {explainAlert && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-3">
          <div
            className="w-full max-w-xl overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="explanation-dialog-title"
          >
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3">
              <h2 id="explanation-dialog-title" className="text-sm font-bold text-gray-800">
                Thêm giải trình cảnh báo
              </h2>
              <button
                type="button"
                onClick={closeExplanationForm}
                disabled={savingExplanation}
                className="rounded p-1 text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                title="Đóng"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-3 px-4 py-4">
              <div>
                <div className="text-sm font-semibold text-gray-900">{explainAlert.employee_name}</div>
                <div className="mt-1 text-xs leading-5 text-gray-600">{explainAlert.content}</div>
              </div>
              <div>
                <label htmlFor="alert-explanation" className="mb-1 block text-xs font-semibold text-gray-700">
                  Giải trình
                </label>
                <textarea
                  id="alert-explanation"
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  rows={4}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-600"
                  placeholder="Nhập nội dung giải trình"
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="alert-solution" className="mb-1 block text-xs font-semibold text-gray-700">
                  Giải pháp
                </label>
                <textarea
                  id="alert-solution"
                  value={solution}
                  onChange={(e) => setSolution(e.target.value)}
                  rows={3}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-600"
                  placeholder="Nhập giải pháp đề xuất"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3">
              <button
                type="button"
                onClick={closeExplanationForm}
                disabled={savingExplanation}
                className="rounded bg-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-300 disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={saveExplanation}
                disabled={savingExplanation || (!explanation.trim() && !solution.trim())}
                className="inline-flex items-center gap-1.5 rounded bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
                {savingExplanation ? 'Đang lưu...' : 'Lưu giải trình'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

