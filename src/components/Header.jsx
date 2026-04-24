import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { submitMktKpiAlertExplanation } from "../services/mktKpiAlertsService";

const MKT_ALERTS_STORAGE_KEY = "luminew.mktAlerts.v1";
const MKT_ALERTS_READ_KEY = "luminew.mktAlerts.read.v1";

function normalizeNameKey(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function readJsonSafe(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = localStorage.getItem("isAuthenticated") === "true";
  const username = localStorage.getItem("username") || "User";
  const userRole = localStorage.getItem("userRole") || "user";
  const userTeam = localStorage.getItem("userTeam") || "";
  const [alertsPayload, setAlertsPayload] = useState(() => readJsonSafe(MKT_ALERTS_STORAGE_KEY, null));
  const [readIds, setReadIds] = useState(() => {
    const o = readJsonSafe(MKT_ALERTS_READ_KEY, { v: 1, ids: [] });
    const ids = Array.isArray(o?.ids) ? o.ids : [];
    return new Set(ids.map((x) => String(x)));
  });
  const [open, setOpen] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const [activeAlert, setActiveAlert] = useState(null);
  const [explanation, setExplanation] = useState("");
  const [solution, setSolution] = useState("");
  const [savingExplain, setSavingExplain] = useState(false);
  const popoverRef = useRef(null);

  const handleLogout = () => {
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("userId");
    localStorage.removeItem("username");
    localStorage.removeItem("userRole");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userTeam");
    navigate("/dang-nhap");
  };

  // Don't show header on login page or home page (which has its own sidebar/topbar)
  // IMPORTANT: Don't early-return before hooks (avoid "Rendered fewer hooks than expected").
  const hideHeader =
    location.pathname === "/dang-nhap" || location.pathname === "/" || location.pathname === "/trang-chu";

  /** Dashboard quản trị: thanh mỏng hơn để ưu tiên iframe báo cáo */
  const compact = location.pathname === "/dashboard-quan-tri";

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === MKT_ALERTS_STORAGE_KEY) {
        setAlertsPayload(readJsonSafe(MKT_ALERTS_STORAGE_KEY, null));
      }
      if (e.key === MKT_ALERTS_READ_KEY) {
        const o = readJsonSafe(MKT_ALERTS_READ_KEY, { v: 1, ids: [] });
        const ids = Array.isArray(o?.ids) ? o.ids : [];
        setReadIds(new Set(ids.map((x) => String(x))));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      const el = popoverRef.current;
      if (!el) return;
      if (!el.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const currentUserName = useMemo(() => {
    const fromUserName = localStorage.getItem("userName") || "";
    let userObj = null;
    try {
      const raw = localStorage.getItem("user");
      userObj = raw ? JSON.parse(raw) : null;
    } catch {
      userObj = null;
    }
    const fromObj = userObj?.Name ?? userObj?.name ?? userObj?.["Họ và Tên"] ?? userObj?.["Họ_và_tên"] ?? "";
    return String(fromUserName || fromObj || username || "").trim();
  }, [username]);

  const userEmail = useMemo(() => String(localStorage.getItem("userEmail") || "").trim(), []);

  const visibleAlerts = useMemo(() => {
    const all = Array.isArray(alertsPayload?.alerts) ? alertsPayload.alerts : [];
    const isAdmin =
      ["admin", "director", "manager", "super_admin", "administrator", "finance"].includes(
        String(userRole || "").toLowerCase()
      ) ||
      String(userTeam || "").toLowerCase().includes("admin");

    const meKey = normalizeNameKey(currentUserName);
    const list = isAdmin
      ? all
      : all.filter((a) => {
          const empKey = normalizeNameKey(a?.employeeName || a?.nhanSu || "");
          if (!meKey || !empKey) return false;
          // Khớp mềm: tránh lệch dấu/khoảng trắng, và trường hợp username chỉ là một phần họ tên.
          return empKey === meKey || empKey.includes(meKey) || meKey.includes(empKey);
        });
    // Mới nhất trước
    return list
      .slice()
      .sort((a, b) => Number(b?.ts || 0) - Number(a?.ts || 0));
  }, [alertsPayload, currentUserName, userRole, userTeam]);

  const unreadCount = useMemo(() => {
    let n = 0;
    for (const a of visibleAlerts) {
      const id = String(a?.id || "");
      if (id && !readIds.has(id)) n += 1;
    }
    return n;
  }, [readIds, visibleAlerts]);

  const hasAlerts = visibleAlerts.length > 0;

  const markAllRead = () => {
    const next = new Set(readIds);
    visibleAlerts.forEach((a) => {
      const id = String(a?.id || "");
      if (id) next.add(id);
    });
    setReadIds(next);
    try {
      localStorage.setItem(MKT_ALERTS_READ_KEY, JSON.stringify({ v: 1, ids: Array.from(next) }));
    } catch {
      /* ignore */
    }
  };

  if (hideHeader) return null;

  return (
    <nav className="bg-green-600 shadow-lg sticky top-0 z-50">
      <div className={`mx-auto ${compact ? "px-3 sm:px-4" : "px-8"}`}>
        <div className={`flex items-center justify-between ${compact ? "h-11 min-h-[2.75rem]" : "h-16"}`}>
          <div className={`flex items-center ${compact ? "space-x-2" : "space-x-4"}`}>
            <img
              src="https://www.appsheet.com/template/gettablefileurl?appName=Appsheet-325045268&tableName=Kho%20%E1%BA%A3nh&fileName=Kho%20%E1%BA%A3nh_Images%2Ff930e667.%E1%BA%A2nh.025539.jpg"
              alt="Logo"
              className={`rounded-full shadow-md ${compact ? "h-7 w-7" : "h-10 w-10"}`}
            />
            <span className={`text-white font-bold ${compact ? "text-sm sm:text-base" : "text-xl"}`}>
              LUMI OMS
            </span>
          </div>
          <div className={`flex items-center ${compact ? "space-x-1.5" : "space-x-4"}`}>
            {isAuthenticated && (
              <div className="relative" ref={popoverRef}>
                <button
                  type="button"
                  onClick={() => setOpen((v) => !v)}
                  className={`relative text-white hover:bg-green-700 rounded-md transition ${
                    compact ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"
                  }`}
                  title="Cảnh báo KPI"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className={compact ? "h-4 w-4" : "h-5 w-5"}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9a6 6 0 0 0-12 0v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a3 3 0 1 1-5.714 0m5.714 0a24.255 24.255 0 0 1-5.714 0"
                    />
                  </svg>
                  {hasAlerts && (
                    <span
                      className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-green-600"
                      aria-label={unreadCount > 0 ? `Có ${unreadCount} cảnh báo chưa đọc` : "Có cảnh báo"}
                    />
                  )}
                </button>

                {open && (
                  <div
                    className="absolute right-0 mt-2 w-[22rem] max-w-[92vw] bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden"
                    role="dialog"
                    aria-label="Danh sách cảnh báo"
                  >
                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                      <div className="text-sm font-semibold text-gray-800">Cảnh báo</div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={markAllRead}
                          className="text-xs font-semibold px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700"
                        >
                          Đã đọc hết
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpen(false)}
                          className="text-xs font-semibold px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                        >
                          Đóng
                        </button>
                      </div>
                    </div>

                    <div className="max-h-[60vh] overflow-auto">
                      {visibleAlerts.length === 0 ? (
                        <div className="px-3 py-4 text-sm text-gray-600">Không có cảnh báo.</div>
                      ) : (
                        visibleAlerts.map((a) => {
                          const id = String(a?.id || "");
                          const unread = id && !readIds.has(id);
                          const ts = Number(a?.ts || 0);
                          const when = ts ? new Date(ts).toLocaleString("vi-VN") : "";
                          const employee = String(a?.employeeName || a?.nhanSu || "").trim();
                          const content = String(a?.content || a?.noiDung || "").trim();
                          const cause = String(a?.cause || a?.nguyenNhan || "").trim();
                          return (
                            <div
                              key={id || `${employee}-${ts}-${content}`}
                              className={`px-3 py-2 border-b border-gray-100 ${
                                unread ? "bg-red-50" : "bg-white"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="text-sm font-semibold text-gray-900 truncate">
                                  {employee || "Nhân sự"}
                                </div>
                                <div className="text-[11px] text-gray-500 shrink-0">{when}</div>
                              </div>
                              <div className="text-xs text-gray-800 mt-0.5">{content}</div>
                              {cause && <div className="text-[11px] text-gray-600 mt-0.5">Nguyên nhân: {cause}</div>}

                              <div className="mt-2 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (id) {
                                      const next = new Set(readIds);
                                      next.add(id);
                                      setReadIds(next);
                                      try {
                                        localStorage.setItem(
                                          MKT_ALERTS_READ_KEY,
                                          JSON.stringify({ v: 1, ids: Array.from(next) })
                                        );
                                      } catch {
                                        /* ignore */
                                      }
                                    }
                                  }}
                                  className="text-xs font-semibold px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                                >
                                  Đã đọc
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveAlert(a);
                                    setExplanation("");
                                    setSolution("");
                                    setExplainOpen(true);
                                  }}
                                  className="text-xs font-semibold px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700"
                                >
                                  Giải trình
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <Link
              to="/trang-chu"
              className={`text-white hover:bg-green-700 rounded-md font-medium transition ${compact ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"}`}
            >
              Trang chủ
            </Link>
            {/* <Link
              to="/bang-bao-cao"
              className="text-white hover:bg-green-700 px-3 py-2 rounded-md text-sm font-medium transition"
            >
              Bảng báo cáo
            </Link>
            {(["admin", "kế toán", "vận đơn"].includes(userRole) ||
              String(userTeam || "")
                .toLowerCase()
                .includes("vận đơn")) && (
              <Link
                to="/van-don"
                className="text-white hover:bg-green-700 px-3 py-2 rounded-md text-sm font-medium transition"
              >
                Vận đơn
              </Link>
            )} */}

            {isAuthenticated && (
              <div
                className={`flex items-center border-l border-green-600 ${compact ? "ml-2 space-x-1.5 pl-2" : "ml-4 space-x-3 pl-4"}`}
              >
                <Link
                  to="/ho-so"
                  className={`text-white hover:bg-green-700 rounded-md font-medium transition ${compact ? "max-w-[9rem] truncate px-2 py-1 text-xs" : "px-3 py-2 text-sm"}`}
                  title={username}
                >
                  👤 {username}
                </Link>
                <button
                  onClick={handleLogout}
                  className={`text-white hover:bg-red-600 bg-red-500 rounded-md font-medium transition ${compact ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm"}`}
                >
                  Đăng xuất
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {explainOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-3">
          <div className="w-full max-w-xl rounded-lg bg-white shadow-2xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <div className="text-sm font-bold text-gray-800">Giải trình cảnh báo</div>
              <button
                type="button"
                onClick={() => !savingExplain && setExplainOpen(false)}
                className="text-xs font-semibold px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
              >
                Đóng
              </button>
            </div>

            <div className="px-4 py-3">
              <div className="text-sm font-semibold text-gray-900">
                {String(activeAlert?.content || activeAlert?.noiDung || "").trim() || "Cảnh báo"}
              </div>
              {String(activeAlert?.cause || activeAlert?.nguyenNhan || "").trim() && (
                <div className="text-xs text-gray-600 mt-1">
                  Nguyên nhân: {String(activeAlert?.cause || activeAlert?.nguyenNhan || "").trim()}
                </div>
              )}

              <div className="mt-4">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Giải trình</label>
                <textarea
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  rows={4}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-600"
                  placeholder="Nhập giải trình…"
                />
              </div>

              <div className="mt-3">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Giải pháp</label>
                <textarea
                  value={solution}
                  onChange={(e) => setSolution(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-600"
                  placeholder="Đề xuất giải pháp…"
                />
              </div>
            </div>

            <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={savingExplain}
                onClick={async () => {
                  const alertId = String(activeAlert?.id || "").trim();
                  if (!alertId) return;
                  setSavingExplain(true);
                  try {
                    await submitMktKpiAlertExplanation({
                      alertId,
                      explanation,
                      solution,
                      byEmail: userEmail,
                      byName: currentUserName,
                    });
                    setExplainOpen(false);
                  } catch (e) {
                    alert(e?.message || String(e));
                  } finally {
                    setSavingExplain(false);
                  }
                }}
                className="text-xs font-semibold px-3 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-400"
              >
                {savingExplain ? "Đang lưu..." : "Gửi giải trình"}
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
