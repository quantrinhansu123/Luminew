import { useState, useEffect, useMemo } from "react";
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Save, XCircle, RefreshCcw, Search, Check, ChevronDown, ChevronLeft } from "lucide-react";

const HR_URL = import.meta.env.VITE_HR_URL || "https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/Nh%C3%A2n_s%E1%BB%B1.json";
const PAGE_URL = import.meta.env.VITE_PAGE_URL || "https://lumi-6dff7-default-rtdb.asia-southeast1.firebasedatabase.app/datasheet/Pages.json";
const ADMIN_MAIL = import.meta.env.VITE_ADMIN_MAIL || "admin@marketing.com";

// Simple Button component
const Button = ({ children, onClick, variant = "default", className = "", disabled = false, type = "button" }) => {
  const baseClasses = "px-4 py-2 rounded-md font-medium transition-colors inline-flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    default: "bg-[#2d7c2d] text-white hover:bg-[#256625]",
    outline: "border border-gray-300 bg-white hover:bg-gray-50 text-gray-700",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${baseClasses} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
};

// Simple Input component
const Input = ({ id, placeholder, type = "text", className = "", defaultValue, ...props }) => (
  <input
    id={id}
    type={type}
    placeholder={placeholder}
    defaultValue={defaultValue}
    className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d] ${className}`}
    {...props}
  />
);

// Simple Label component
const Label = ({ htmlFor, children, className = "" }) => (
  <label htmlFor={htmlFor} className={`block text-sm font-medium text-gray-700 ${className}`}>
    {children}
  </label>
);

// Simple Textarea component
const Textarea = ({ id, placeholder, className = "", ...props }) => (
  <textarea
    id={id}
    placeholder={placeholder}
    className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d] resize-none ${className}`}
    {...props}
  />
);

// Simple Select component
const Select = ({ children, defaultValue, onChange }) => {
  return <div className="relative">{children}</div>;
};
const SelectTrigger = ({ children, onClick, className = "" }) => (
  <button type="button" onClick={onClick} className={`w-full px-3 py-2 border border-gray-300 rounded-md bg-white hover:bg-gray-50 text-left flex items-center justify-between ${className}`}>
    {children}
  </button>
);
const SelectValue = ({ placeholder }) => <span className="text-gray-500">{placeholder}</span>;
const SelectContent = ({ children }) => <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">{children}</div>;
const SelectItem = ({ value, children }) => (
  <div className="px-3 py-2 hover:bg-gray-100 cursor-pointer">{children}</div>
);

// Simple Tabs components
const Tabs = ({ children, defaultValue }) => {
  const [activeTab, setActiveTab] = useState(defaultValue);
  return (
    <div data-active-tab={activeTab}>
      {children}
    </div>
  );
};
const TabsList = ({ children, className = "" }) => <div className={`flex ${className}`}>{children}</div>;
const TabsTrigger = ({ value, children, className = "" }) => (
  <button type="button" className={`flex-1 py-3 px-4 font-medium transition-colors ${className}`}>
    {children}
  </button>
);
const TabsContent = ({ value, children, className = "" }) => <div className={className}>{children}</div>;

// Simple Card components
const Card = ({ children, className = "" }) => <div className={`bg-white rounded-lg shadow ${className}`}>{children}</div>;
const CardHeader = ({ children, className = "" }) => <div className={`p-6 ${className}`}>{children}</div>;
const CardTitle = ({ children, className = "" }) => <h3 className={`${className}`}>{children}</h3>;
const CardContent = ({ children, className = "" }) => <div className={`p-6 ${className}`}>{children}</div>;

// Simple DatePicker component
const DatePicker = ({ value, onChange, className = "" }) => (
  <input
    type="date"
    value={value ? value.toISOString().split('T')[0] : ''}
    onChange={(e) => onChange(new Date(e.target.value))}
    className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d] ${className}`}
  />
);

// Custom Popover for searchable dropdowns
const Popover = ({ children, open, onOpenChange }) => {
  return <div className="relative">{children}</div>;
};
const PopoverTrigger = ({ children, asChild }) => children;
const PopoverContent = ({ children, className = "", align = "start" }) => (
  <div className={`absolute z-50 mt-1 bg-white border border-gray-300 rounded-md shadow-lg ${className}`} style={{ minWidth: '100%' }}>
    {children}
  </div>
);

const cn = (...classes) => classes.filter(Boolean).join(' ');

export default function NhapDonMoi() {
    const [date, setDate] = useState(new Date());
    const [trangThaiDon, setTrangThaiDon] = useState(null);
    const [xacNhan, setXacNhan] = useState({
        khach: false,
        don: false,
        giaoHang: false,
        thanhToan: false
    });
    const [activeTab, setActiveTab] = useState("khach-hang");

    // States for Page data
    const [pages, setPages] = useState([]);
    const [loadingPages, setLoadingPages] = useState(false);
    const [selectedPage, setSelectedPage] = useState("");
    const [pageSearch, setPageSearch] = useState("");
    const [isPageOpen, setIsPageOpen] = useState(false);

    // States for Sale employees
    const [saleEmployees, setSaleEmployees] = useState([]);
    const [loadingSale, setLoadingSale] = useState(false);
    const [selectedSale, setSelectedSale] = useState("");
    const [saleSearch, setSaleSearch] = useState("");
    const [isSaleOpen, setIsSaleOpen] = useState(false);

    // States for Marketing employees
    const [mktEmployees, setMktEmployees] = useState([]);
    const [loadingMkt, setLoadingMkt] = useState(false);
    const [selectedMkt, setSelectedMkt] = useState("");
    const [mktSearch, setMktSearch] = useState("");
    const [isMktOpen, setIsMktOpen] = useState(false);

    // Get user from localStorage
    const userJson = localStorage.getItem("user");
    const user = userJson ? JSON.parse(userJson) : null;
    const userEmail = (user?.Email || user?.email || "").toString().toLowerCase().trim();
    const userName = user?.['Họ_và_tên'] || user?.['Họ và tên'] || user?.['Tên'] || "";
    const boPhan = user?.['Bộ_phận'] || user?.['Bộ phận'] || "";

    const loadPageData = async () => {
        setLoadingPages(true);
        setLoadingSale(true);
        setLoadingMkt(true);
        try {
            const hrRes = await fetch(HR_URL);
            const hrData = await hrRes.json();
            const hrList = Array.isArray(hrData) ? hrData : Object.values(hrData || {}).filter(i => i && typeof i === 'object');

            // Filter Sale employees
            const saleList = hrList.filter((e) => {
                const dep = (e['Bộ_phận'] || e['Bộ phận'] || "").toString().trim().toLowerCase();
                return dep === 'sale' || dep === 'sales';
            });
            setSaleEmployees(saleList);

            // Filter MKT employees
            const mktList = hrList.filter((e) => {
                const dep = (e['Bộ_phận'] || e['Bộ phận'] || "").toString().trim().toLowerCase();
                return dep === 'mkt' || dep === 'marketing';
            });
            setMktEmployees(mktList);

            // Auto-set defaults based on user's department
            if (boPhan) {
                const userDep = boPhan.toString().trim().toLowerCase();
                if ((userDep === 'sale' || userDep === 'sales') && !selectedSale) {
                    setSelectedSale(userName);
                }
                if ((userDep === 'mkt' || userDep === 'marketing') && !selectedMkt) {
                    setSelectedMkt(userName);
                }
            }

            const currentEmp = hrList.find((e) =>
                (e.Email || e.email || "").toString().toLowerCase().trim() === userEmail
            );

            // Fetch all Pages
            const pageRes = await fetch(PAGE_URL);
            const pageData = await pageRes.json();
            const pageList = Object.values(pageData || {}).filter((p) => p && typeof p === 'object');

            // Determine filtering logic
            if (userEmail === ADMIN_MAIL) {
                setPages(pageList);
            } else if (currentEmp) {
                const viTri = (currentEmp['Vị_trí'] ?? currentEmp['Vị trí'] ?? '').toString().toLowerCase();
                const hoVaTen = (currentEmp['Họ_và_tên'] ?? currentEmp['Họ và tên'] ?? '').toString().trim();
                const team = (currentEmp['Team'] ?? '').toString().trim();
                const teamSM = (currentEmp['Team_Sale_mar'] ?? '').toString().trim();

                const isLeader = viTri.includes('leader');
                const allowedNames = new Set();
                allowedNames.add(hoVaTen);

                if (isLeader) {
                    hrList.forEach((e) => {
                        const eTeam = (e['Team'] ?? '').toString().trim();
                        const eTeamSM = (e['Team_Sale_mar'] ?? '').toString().trim();
                        if ((team && eTeam === team) || (teamSM && eTeamSM === teamSM)) {
                            const eName = (e['Họ_và_tên'] ?? e['Họ và tên'] ?? '').toString().trim();
                            if (eName) allowedNames.add(eName);
                        }
                    });
                }

                const filtered = pageList.filter(p => {
                    const mktName = (p['Tên MKT'] || "").toString().trim();
                    return allowedNames.has(mktName);
                });
                setPages(filtered);
            } else {
                setPages([]);
            }
        } catch (error) {
            console.error("Lỗi khi tải dữ liệu page/nhân sự:", error);
        } finally {
            setLoadingPages(false);
            setLoadingSale(false);
            setLoadingMkt(false);
        }
    };

    useEffect(() => {
        loadPageData();
    }, []);

    const filteredPages = useMemo(() => {
        if (!pageSearch) return pages;
        return pages.filter(p =>
            (p['Tên Page'] || "").toLowerCase().includes(pageSearch.toLowerCase())
        );
    }, [pages, pageSearch]);

    const filteredSaleEmployees = useMemo(() => {
        if (!saleSearch) return saleEmployees;
        return saleEmployees.filter(e =>
            (e['Họ_và_tên'] || e['Họ và tên'] || "").toLowerCase().includes(saleSearch.toLowerCase())
        );
    }, [saleEmployees, saleSearch]);

    const filteredMktEmployees = useMemo(() => {
        if (!mktSearch) return mktEmployees;
        return mktEmployees.filter(e =>
            (e['Họ_và_tên'] || e['Họ và tên'] || "").toLowerCase().includes(mktSearch.toLowerCase())
        );
    }, [mktEmployees, mktSearch]);

    const toggleXacNhan = (key) => {
        setXacNhan(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Back Button */}
                <Link to="/trang-chu" className="inline-flex items-center text-green-600 hover:text-green-700 mb-4">
                    <ChevronLeft className="w-5 h-5" />
                    <span>Quay lại</span>
                </Link>

                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold text-[#2d7c2d]">Nhập đơn hàng mới</h1>
                            <p className="text-gray-500 italic text-sm">Vui lòng điền đầy đủ các thông tin bắt buộc (*)</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" className="text-red-500 hover:text-red-600 hover:bg-red-50">
                                <XCircle className="w-4 h-4 mr-2" />
                                Hủy bỏ
                            </Button>
                            <Button className="bg-[#2d7c2d] hover:bg-[#256625]">
                                <Save className="w-4 h-4 mr-2" />
                                Lưu đơn hàng
                            </Button>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="w-full">
                        <div className="grid grid-cols-3 bg-gray-100 p-1 rounded-lg mb-4">
                            <button
                                onClick={() => setActiveTab("khach-hang")}
                                className={`py-3 px-4 rounded-md font-medium transition-colors ${activeTab === "khach-hang" ? "bg-[#2d7c2d] text-white" : "text-gray-700 hover:bg-gray-200"}`}
                            >
                                Thông tin khách hàng
                            </button>
                            <button
                                onClick={() => setActiveTab("thong-tin-don")}
                                className={`py-3 px-4 rounded-md font-medium transition-colors ${activeTab === "thong-tin-don" ? "bg-[#2d7c2d] text-white" : "text-gray-700 hover:bg-gray-200"}`}
                            >
                                Thông tin đơn
                            </button>
                            <button
                                onClick={() => setActiveTab("nhan-su")}
                                className={`py-3 px-4 rounded-md font-medium transition-colors ${activeTab === "nhan-su" ? "bg-[#2d7c2d] text-white" : "text-gray-700 hover:bg-gray-200"}`}
                            >
                                Thông tin nhân sự
                            </button>
                        </div>

                        {/* Tab: Thông tin khách hàng */}
                        {activeTab === "khach-hang" && (
                            <Card>
                                <CardHeader className="pb-3 border-b mb-4">
                                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                                        <div className="w-1 h-6 bg-[#2d7c2d] rounded-full" />
                                        Dữ liệu khách hàng
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <div className="space-y-2">
                                        <Label htmlFor="ngay-len-don">Ngày lên đơn*</Label>
                                        <DatePicker value={date} onChange={setDate} className="w-full" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="nv-mkt">Nhân viên marketing</Label>
                                        <Popover open={isMktOpen} onOpenChange={setIsMktOpen}>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    className="w-full justify-between h-10 font-normal"
                                                    disabled={loadingMkt}
                                                    onClick={() => setIsMktOpen(!isMktOpen)}
                                                >
                                                    {selectedMkt ? (
                                                        <span className="truncate">{selectedMkt}</span>
                                                    ) : (
                                                        <span className="text-gray-500">{loadingMkt ? "Đang tải..." : "Chọn nhân viên..."}</span>
                                                    )}
                                                    <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            {isMktOpen && (
                                                <PopoverContent className="w-full p-0" align="start">
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center border-b px-3">
                                                            <Search className="mr-2 h-4 w-4 opacity-50" />
                                                            <input
                                                                className="flex h-10 w-full bg-transparent py-3 text-sm outline-none"
                                                                placeholder="Tìm tên nhân viên..."
                                                                value={mktSearch}
                                                                onChange={(e) => setMktSearch(e.target.value)}
                                                            />
                                                        </div>
                                                        <div className="max-h-[300px] overflow-y-auto p-1">
                                                            {filteredMktEmployees.length === 0 ? (
                                                                <div className="py-6 text-center text-sm text-gray-500">
                                                                    Không tìm thấy nhân viên MKT.
                                                                </div>
                                                            ) : (
                                                                filteredMktEmployees.map((e, idx) => {
                                                                    const empName = e['Họ_và_tên'] || e['Họ và tên'] || `NV ${idx}`;
                                                                    const isSelected = selectedMkt === empName;
                                                                    return (
                                                                        <div
                                                                            key={idx}
                                                                            className={cn(
                                                                                "flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm hover:bg-gray-100",
                                                                                isSelected && "bg-gray-100 font-medium"
                                                                            )}
                                                                            onClick={() => {
                                                                                setSelectedMkt(empName);
                                                                                setIsMktOpen(false);
                                                                                setMktSearch("");
                                                                            }}
                                                                        >
                                                                            <Check className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                                                                            <span className="truncate">{empName}</span>
                                                                        </div>
                                                                    );
                                                                })
                                                            )}
                                                        </div>
                                                    </div>
                                                </PopoverContent>
                                            )}
                                        </Popover>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="ten-page">Tên page*</Label>
                                            <button
                                                onClick={loadPageData}
                                                disabled={loadingPages}
                                                className="text-[10px] text-blue-600 flex items-center gap-1 hover:underline"
                                            >
                                                <RefreshCcw className={cn("w-3 h-3", loadingPages && "animate-spin")} />
                                                Làm mới
                                            </button>
                                        </div>
                                        <Popover open={isPageOpen} onOpenChange={setIsPageOpen}>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    className="w-full justify-between h-10 font-normal"
                                                    disabled={loadingPages}
                                                    onClick={() => setIsPageOpen(!isPageOpen)}
                                                >
                                                    {selectedPage ? (
                                                        <span className="truncate">{selectedPage}</span>
                                                    ) : (
                                                        <span className="text-gray-500">{loadingPages ? "Đang tải..." : "Chọn page..."}</span>
                                                    )}
                                                    <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                                                </Button>
                                            </PopoverTrigger>
                                            {isPageOpen && (
                                                <PopoverContent className="w-full p-0" align="start">
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center border-b px-3">
                                                            <Search className="mr-2 h-4 w-4 opacity-50" />
                                                            <input
                                                                className="flex h-10 w-full bg-transparent py-3 text-sm outline-none"
                                                                placeholder="Tìm kiếm page..."
                                                                value={pageSearch}
                                                                onChange={(e) => setPageSearch(e.target.value)}
                                                            />
                                                        </div>
                                                        <div className="max-h-[300px] overflow-y-auto p-1">
                                                            {filteredPages.length === 0 ? (
                                                                <div className="py-6 text-center text-sm text-gray-500">
                                                                    Không tìm thấy page nào.
                                                                </div>
                                                            ) : (
                                                                filteredPages.map((p, idx) => {
                                                                    const pageName = p['Tên Page'] || `Page ${idx}`;
                                                                    const isSelected = selectedPage === pageName;
                                                                    return (
                                                                        <div
                                                                            key={idx}
                                                                            className={cn(
                                                                                "flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm hover:bg-gray-100",
                                                                                isSelected && "bg-gray-100 font-medium"
                                                                            )}
                                                                            onClick={() => {
                                                                                setSelectedPage(pageName);
                                                                                setIsPageOpen(false);
                                                                                setPageSearch("");
                                                                            }}
                                                                        >
                                                                            <Check className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                                                                            <span className="truncate">{pageName}</span>
                                                                        </div>
                                                                    );
                                                                })
                                                            )}
                                                        </div>
                                                    </div>
                                                </PopoverContent>
                                            )}
                                        </Popover>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="phone">Phone*</Label>
                                        <Input id="phone" placeholder="Số điện thoại..." />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="ten-kh">Tên*</Label>
                                        <Input id="ten-kh" placeholder="Họ và tên khách hàng..." />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="add">Add*</Label>
                                        <Input id="add" placeholder="Địa chỉ chi tiết..." />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Khu vực</Label>
                                        <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d]">
                                            <option value="">Chọn khu vực...</option>
                                            <option value="mien-bac">Miền Bắc</option>
                                            <option value="mien-trung">Miền Trung</option>
                                            <option value="mien-nam">Miền Nam</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Loại tiền thanh toán</Label>
                                        <select defaultValue="vnd" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d]">
                                            <option value="vnd">VNĐ</option>
                                            <option value="usd">USD</option>
                                            <option value="khr">KHR</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="city">City</Label>
                                        <Input id="city" placeholder="Thành phố..." />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="state">State</Label>
                                        <Input id="state" placeholder="Tỉnh/Bang..." />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="zipcode">Zipcode</Label>
                                        <Input id="zipcode" placeholder="Mã bưu điện..." />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="hinh-thuc">Hình thức thanh toán*</Label>
                                        <Input id="hinh-thuc" placeholder="Ví dụ: Chuyển khoản, COD..." />
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Tab: Thông tin đơn */}
                        {activeTab === "thong-tin-don" && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <Card className="lg:col-span-2">
                                    <CardHeader className="pb-3 border-b mb-4">
                                        <CardTitle className="text-lg font-semibold flex items-center gap-2">
                                            <div className="w-1 h-6 bg-[#2d7c2d] rounded-full" />
                                            Chi tiết mặt hàng
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Mặt hàng (Chính)</Label>
                                                <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d]">
                                                    <option value="">Chọn mặt hàng...</option>
                                                    <option value="bakuchiol-retinol">Bakuchiol Retinol</option>
                                                    <option value="bonavita-coffee">Bonavita Coffee</option>
                                                    <option value="combo-gold-24k">ComboGold24k</option>
                                                    <option value="dg">DG</option>
                                                    <option value="dragon-blood-cream">Dragon Blood Cream</option>
                                                    <option value="dan-kinoki">Dán Kinoki</option>
                                                    <option value="fitgum-cafe-20x">Fitgum CAFE 20X</option>
                                                    <option value="gel-da-day">Gel Dạ Dày</option>
                                                    <option value="gel-tri">Gel Trĩ</option>
                                                    <option value="gel-xk-phi">Gel XK Phi</option>
                                                    <option value="gel-xk-thai">Gel XK Thái</option>
                                                    <option value="gel-xuong-khop">Gel Xương Khớp</option>
                                                    <option value="glutathione-collagen">Glutathione Collagen</option>
                                                    <option value="glutathione-collagen-new">Glutathione Collagen NEW</option>
                                                    <option value="kem-body">Kem Body</option>
                                                    <option value="keo-tao">Kẹo Táo</option>
                                                    <option value="nam-dr-hancy">Nám DR Hancy</option>
                                                    <option value="serum-sam">Serum Sâm</option>
                                                    <option value="sua-tam-cuishifan">Sữa tắm CUISHIFAN</option>
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="ma-don">Mã đơn hàng</Label>
                                                <Input id="ma-don" placeholder="Tự động hoặc nhập tay..." />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                            <div className="md:col-span-3 space-y-2">
                                                <Label htmlFor="mathang1">Tên mặt hàng 1</Label>
                                                <Input id="mathang1" placeholder="Nhập tên..." />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="sl1">Số lượng 1</Label>
                                                <Input id="sl1" type="number" defaultValue="1" />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                            <div className="md:col-span-3 space-y-2">
                                                <Label htmlFor="mathang2">Tên mặt hàng 2</Label>
                                                <Input id="mathang2" placeholder="Nhập tên..." />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="sl2">Số lượng 2</Label>
                                                <Input id="sl2" type="number" defaultValue="0" />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t pt-4">
                                            <div className="md:col-span-3 space-y-2">
                                                <Label htmlFor="quatang">Quà tặng</Label>
                                                <Input id="quatang" placeholder="Tên quà tặng..." />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="slq">Số lượng quà</Label>
                                                <Input id="slq" type="number" defaultValue="0" />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="gia-goc">Giá gốc</Label>
                                                <Input id="gia-goc" type="number" placeholder="0" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="gia-ban">Giá bán</Label>
                                                <Input id="gia-ban" type="number" placeholder="0" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="tong-tien" className="text-[#2d7c2d] font-bold">Tổng tiền VNĐ</Label>
                                                <Input id="tong-tien" type="number" className="border-[#2d7c2d] bg-green-50 font-bold" placeholder="0" />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <div className="space-y-6">
                                    <Card className="border-yellow-200 bg-yellow-50/30">
                                        <CardHeader className="pb-2">
                                            <CardTitle className="text-sm font-bold text-yellow-700 flex items-center gap-2">
                                                <AlertCircle className="w-4 h-4" />
                                                Kiểm tra hệ thống
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="text-xs space-y-2 text-yellow-800">
                                            <p>• Cảnh báo Blacklist: <span className="font-semibold text-green-600">Sạch</span></p>
                                            <p>• Trùng đơn: <span className="font-semibold text-green-600">Không phát hiện</span></p>
                                        </CardContent>
                                    </Card>

                                    <Card>
                                        <CardHeader className="pb-2">
                                            <CardTitle className="text-sm font-bold">Ghi chú & Phản hồi</CardTitle>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="space-y-1">
                                                <Label htmlFor="ghi-chu" className="text-xs">Ghi chú</Label>
                                                <Textarea id="ghi-chu" placeholder="Nhập ghi chú..." className="h-20" />
                                            </div>
                                            <div className="space-y-1">
                                                <Label htmlFor="ph-tc" className="text-xs text-green-600">Phản hồi tích cực</Label>
                                                <Textarea id="ph-tc" placeholder="..." className="h-16" />
                                            </div>
                                            <div className="space-y-1">
                                                <Label htmlFor="ph-tn" className="text-xs text-red-600">Phản hồi tiêu cực</Label>
                                                <Textarea id="ph-tn" placeholder="..." className="h-16" />
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>
                            </div>
                        )}

                        {/* Tab: Thông tin nhân sự */}
                        {activeTab === "nhan-su" && (
                            <Card>
                                <CardHeader className="pb-3 border-b mb-4">
                                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                                        <div className="w-1 h-6 bg-[#2d7c2d] rounded-full" />
                                        Xử lý bởi nhân viên
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-8">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="space-y-2">
                                            <Label>Nhân viên Sale</Label>
                                            <Popover open={isSaleOpen} onOpenChange={setIsSaleOpen}>
                                                <PopoverTrigger asChild>
                                                    <Button
                                                        variant="outline"
                                                        className="w-full justify-between h-10 font-normal"
                                                        disabled={loadingSale}
                                                        onClick={() => setIsSaleOpen(!isSaleOpen)}
                                                    >
                                                        {selectedSale ? (
                                                            <span className="truncate">{selectedSale}</span>
                                                        ) : (
                                                            <span className="text-gray-500">{loadingSale ? "Đang tải..." : "Chọn nhân viên..."}</span>
                                                        )}
                                                        <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                                                    </Button>
                                                </PopoverTrigger>
                                                {isSaleOpen && (
                                                    <PopoverContent className="w-full p-0" align="start">
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center border-b px-3">
                                                                <Search className="mr-2 h-4 w-4 opacity-50" />
                                                                <input
                                                                    className="flex h-10 w-full bg-transparent py-3 text-sm outline-none"
                                                                    placeholder="Tìm tên nhân viên..."
                                                                    value={saleSearch}
                                                                    onChange={(e) => setSaleSearch(e.target.value)}
                                                                />
                                                            </div>
                                                            <div className="max-h-[300px] overflow-y-auto p-1">
                                                                {filteredSaleEmployees.length === 0 ? (
                                                                    <div className="py-6 text-center text-sm text-gray-500">
                                                                        Không tìm thấy nhân viên Sale.
                                                                    </div>
                                                                ) : (
                                                                    filteredSaleEmployees.map((e, idx) => {
                                                                        const empName = e['Họ_và_tên'] || e['Họ và tên'] || `NV ${idx}`;
                                                                        const isSelected = selectedSale === empName;
                                                                        return (
                                                                            <div
                                                                                key={idx}
                                                                                className={cn(
                                                                                    "flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm hover:bg-gray-100",
                                                                                    isSelected && "bg-gray-100 font-medium"
                                                                                )}
                                                                                onClick={() => {
                                                                                    setSelectedSale(empName);
                                                                                    setIsSaleOpen(false);
                                                                                    setSaleSearch("");
                                                                                }}
                                                                            >
                                                                                <Check className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                                                                                <span className="truncate">{empName}</span>
                                                                            </div>
                                                                        );
                                                                    })
                                                                )}
                                                            </div>
                                                        </div>
                                                    </PopoverContent>
                                                )}
                                            </Popover>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Phân loại khách hàng</Label>
                                            <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d7c2d]">
                                                <option value="">Chọn phân loại...</option>
                                                <option value="moi">Khách mới</option>
                                                <option value="cu">Khách cũ</option>
                                                <option value="vip">VIP</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Trạng thái đơn</Label>
                                            <div className="flex gap-2">
                                                <Button
                                                    type="button"
                                                    variant={trangThaiDon === "hop-le" ? "default" : "outline"}
                                                    className={cn("flex-1", trangThaiDon === "hop-le" && "bg-green-600 hover:bg-green-700")}
                                                    onClick={() => setTrangThaiDon("hop-le")}
                                                >
                                                    Đơn hợp lệ
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant={trangThaiDon === "xem-xet" ? "default" : "outline"}
                                                    className={cn("flex-1", trangThaiDon === "xem-xet" && "bg-yellow-600 hover:bg-yellow-700")}
                                                    onClick={() => setTrangThaiDon("xem-xet")}
                                                >
                                                    Đơn xem xét
                                                </Button>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="dien-giai">Diễn giải</Label>
                                        <Textarea id="dien-giai" placeholder="Nhập diễn giải chi tiết về đơn hàng hoặc khách hàng..." className="h-24" />
                                    </div>

                                    <div className="space-y-4 border-t pt-6">
                                        <Label className="text-base font-bold text-[#2d7c2d]">Quy trình xác nhận đơn</Label>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                            <Button
                                                type="button"
                                                variant={xacNhan.khach ? "default" : "outline"}
                                                className={cn("h-16 flex flex-col gap-1", xacNhan.khach && "bg-green-600 hover:bg-green-700")}
                                                onClick={() => toggleXacNhan("khach")}
                                            >
                                                <span className="text-xs opacity-70">Bước 1</span>
                                                <span className="font-semibold">TT Khách</span>
                                                {xacNhan.khach && <CheckCircle2 className="w-4 h-4 mt-1" />}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant={xacNhan.don ? "default" : "outline"}
                                                className={cn("h-16 flex flex-col gap-1", xacNhan.don && "bg-green-600 hover:bg-green-700")}
                                                onClick={() => toggleXacNhan("don")}
                                            >
                                                <span className="text-xs opacity-70">Bước 2</span>
                                                <span className="font-semibold">TT Đơn</span>
                                                {xacNhan.don && <CheckCircle2 className="w-4 h-4 mt-1" />}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant={xacNhan.giaoHang ? "default" : "outline"}
                                                className={cn("h-16 flex flex-col gap-1", xacNhan.giaoHang && "bg-green-600 hover:bg-green-700")}
                                                onClick={() => toggleXacNhan("giaoHang")}
                                            >
                                                <span className="text-xs opacity-70">Bước 3</span>
                                                <span className="font-semibold">TT Giao hàng</span>
                                                {xacNhan.giaoHang && <CheckCircle2 className="w-4 h-4 mt-1" />}
                                            </Button>
                                            <Button
                                                type="button"
                                                variant={xacNhan.thanhToan ? "default" : "outline"}
                                                className={cn("h-16 flex flex-col gap-1", xacNhan.thanhToan && "bg-green-600 hover:bg-green-700")}
                                                onClick={() => toggleXacNhan("thanhToan")}
                                            >
                                                <span className="text-xs opacity-70">Bước 4</span>
                                                <span className="font-semibold">TT Thanh toán</span>
                                                {xacNhan.thanhToan && <CheckCircle2 className="w-4 h-4 mt-1" />}
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
