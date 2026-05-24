import { useEffect, useMemo, useState } from 'react';
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
} from 'chart.js';
import { Building2, Network, UserRound } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import useDashboardDieuHanhData from '../hooks/useDashboardDieuHanhData';
import usePermissions from '../hooks/usePermissions';
import { useUserDepartment } from '../hooks/useUserDepartment';
import CompanyTab from '../components/dashboard/dieu-hanh/CompanyTab';
import DashboardShell from '../components/dashboard/dieu-hanh/DashboardShell';
import DepartmentTab from '../components/dashboard/dieu-hanh/DepartmentTab';
import IndividualTab from '../components/dashboard/dieu-hanh/IndividualTab';
import { isExecutiveDashboardAudience } from '../utils/executiveAccess';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

function pad2(n) {
  return String(n).padStart(2, '0');
}

function ymd(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function dm(d) {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function mondayOfWeek(d) {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = copy.getDay();
  copy.setDate(copy.getDate() + (day === 0 ? -6 : 1 - day));
  return copy;
}

function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function buildWeekOptions(count = 26) {
  const currentMonday = mondayOfWeek(new Date());
  return Array.from({ length: count }, (_, index) => {
    const start = addDays(currentMonday, -7 * index);
    const end = addDays(start, 6);
    return {
      value: `${ymd(start)}_${ymd(end)}`,
      label: `Tuần ${dm(start)} - ${dm(end)}/${end.getFullYear()}`,
      from: ymd(start),
      to: ymd(end),
    };
  });
}

function buildMonthOptions(count = 24) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const d = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return {
      value: key,
      label: `Tháng ${pad2(d.getMonth() + 1)}/${d.getFullYear()}`,
      from: ymd(d),
      to: ymd(end),
    };
  });
}

function initialPeriodRange() {
  const firstMonth = buildMonthOptions(1)[0];
  return { key: firstMonth.value, from: firstMonth.from, to: firstMonth.to };
}

function useDashboardAllowed() {
  const { canView, loading: permLoading, role: dbRoleCode } = usePermissions();
  const { department, loading: deptLoading } = useUserDepartment();

  return useMemo(() => {
    const userRole = (localStorage.getItem('userRole') || '').toLowerCase();
    const isAdminOrLeadership = ['admin', 'leader', 'director', 'boss', 'manager', 'administrator', 'super_admin'].includes(userRole);
    const allowed =
      isAdminOrLeadership ||
      canView('DASHBOARD_QUAN_TRI') ||
      (canView('SALE_VIEW') && canView('MKT_VIEW')) ||
      isExecutiveDashboardAudience(department, dbRoleCode);
    return { allowed, loading: permLoading || deptLoading };
  }, [canView, department, dbRoleCode, permLoading, deptLoading]);
}

export default function DashboardDieuHanh() {
  const { allowed, loading: allowedLoading } = useDashboardAllowed();
  const initialPeriod = useMemo(() => initialPeriodRange(), []);
  const [periodMode, setPeriodMode] = useState('month');
  const [periodKey, setPeriodKey] = useState(initialPeriod.key);
  const [from, setFrom] = useState(initialPeriod.from);
  const [to, setTo] = useState(initialPeriod.to);
  const [branch, setBranch] = useState('all');
  const [market, setMarket] = useState('all');
  const [product, setProduct] = useState('all');
  const [department, setDepartment] = useState('all');
  const [team, setTeam] = useState('all');
  const [person, setPerson] = useState('all');
  const [activeTab, setActiveTab] = useState('company');
  const periodOptions = useMemo(() => (periodMode === 'week' ? buildWeekOptions() : buildMonthOptions()), [periodMode]);

  useEffect(() => {
    if (periodOptions.some((item) => item.value === periodKey)) return;
    setPeriodKey(periodOptions[0]?.value || '');
  }, [periodKey, periodOptions]);

  useEffect(() => {
    const selected = periodOptions.find((item) => item.value === periodKey);
    if (!selected) return;
    setFrom(selected.from);
    setTo(selected.to);
  }, [periodKey, periodOptions]);

  const data = useDashboardDieuHanhData({
    activeTab,
    periodMode,
    from,
    to,
    branch,
    market,
    product,
    department,
    team,
    person,
    enabled: allowed && !allowedLoading,
  });

  useEffect(() => {
    setPerson('all');
  }, [branch, department, market, product, team]);

  useEffect(() => {
    setTeam('all');
  }, [branch, department, market, product]);

  useEffect(() => {
    if (market === 'all') return;
    if (!data.marketOptions.includes(market)) setMarket('all');
  }, [data.marketOptions, market]);

  useEffect(() => {
    if (product === 'all') return;
    if (!data.productOptions.includes(product)) setProduct('all');
  }, [data.productOptions, product]);

  useEffect(() => {
    if (team === 'all') return;
    if (!data.teamOptions.includes(team)) setTeam('all');
  }, [data.teamOptions, team]);

  useEffect(() => {
    if (person === 'all') return;
    if (!data.personOptions.includes(person)) setPerson('all');
  }, [data.personOptions, person]);

  useEffect(() => {
    if (activeTab === 'alerts') setActiveTab('company');
  }, [activeTab]);

  if (allowedLoading) {
    return <div className="flex min-h-[40vh] items-center justify-center text-sm font-semibold text-slate-600">Đang kiểm tra quyền...</div>;
  }

  if (!allowed) {
    return (
      <div className="p-8 text-center font-semibold text-red-600">
        Bạn không có quyền truy cập Dashboard điều hành.
      </div>
    );
  }

  return (
    <DashboardShell
      errors={data.errors}
      loading={data.loading}
      filterProps={{
        activeTab,
        periodMode,
        setPeriodMode,
        periodKey,
        setPeriodKey,
        periodOptions,
        branch,
        setBranch,
        market,
        setMarket,
        marketOptions: data.marketOptions,
        product,
        setProduct,
        productOptions: data.productOptions,
        department,
        setDepartment,
        team,
        setTeam,
        teamOptions: data.teamOptions,
        person,
        setPerson,
        personOptions: data.personOptions,
        from,
        setFrom,
        to,
        setTo,
        onReload: data.reload,
      }}
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="lumi-tabs-list flex h-auto w-full justify-start overflow-x-auto border-b border-[#e2eaf4]">
          <TabsTrigger value="company" className="lumi-tab">
            <Building2 className="h-3.5 w-3.5" />
            Công ty
          </TabsTrigger>
          <TabsTrigger value="department" className="lumi-tab">
            <Network className="h-3.5 w-3.5" />
            Bộ phận
          </TabsTrigger>
          <TabsTrigger value="individual" className="lumi-tab">
            <UserRound className="h-3.5 w-3.5" />
            Cá nhân
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="m-0 outline-none ring-0 focus-visible:ring-0 data-[state=inactive]:hidden">
          <CompanyTab data={data} />
        </TabsContent>
        <TabsContent value="department" className="m-0 outline-none ring-0 focus-visible:ring-0 data-[state=inactive]:hidden">
          <DepartmentTab data={data} department={department} setDepartment={setDepartment} />
        </TabsContent>
        <TabsContent value="individual" className="m-0 outline-none ring-0 focus-visible:ring-0 data-[state=inactive]:hidden">
          <IndividualTab data={data} team={team} setTeam={setTeam} person={person} setPerson={setPerson} />
        </TabsContent>
      </Tabs>
    </DashboardShell>
  );
}
