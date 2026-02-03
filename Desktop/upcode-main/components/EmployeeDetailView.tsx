import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Clock, DollarSign, ArrowDownCircle, QrCode, User, Play, Pause, Square, Calendar, TrendingUp, Filter, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { Employee, Task, Project, ProjectTransaction, EmployeeWorkSession } from '../types';
import { projectTransactionService, employeeWorkSessionService } from '../services/databaseService';
import { differenceInMinutes, parseISO, format, startOfMonth, endOfMonth, isWithinInterval, getMonth, getYear } from 'date-fns';
import { vi } from 'date-fns/locale';

interface EmployeeDetailViewProps {
    employee: Employee;
    onBack: () => void;
    tasks?: Task[];
    projects?: Project[];
}

export const EmployeeDetailView: React.FC<EmployeeDetailViewProps> = ({ 
    employee, 
    onBack, 
    tasks = [], 
    projects = [] 
}) => {
    const [expenseTransactions, setExpenseTransactions] = useState<ProjectTransaction[]>([]);
    const [loadingTransactions, setLoadingTransactions] = useState(false);
    const [workSessions, setWorkSessions] = useState<EmployeeWorkSession[]>([]);
    const [activeSession, setActiveSession] = useState<EmployeeWorkSession | null>(null);
    const [loadingTimer, setLoadingTimer] = useState(false);
    const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
    const [dateSessions, setDateSessions] = useState<EmployeeWorkSession[]>([]);
    const [monthFilter, setMonthFilter] = useState<string>(format(new Date(), 'yyyy-MM'));
    const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set([format(new Date(), 'yyyy-MM')]));

    // Load work sessions and active session
    useEffect(() => {
        const loadWorkSessions = async () => {
            try {
                const [sessions, active] = await Promise.all([
                    employeeWorkSessionService.getByEmployeeId(employee.id),
                    employeeWorkSessionService.getActiveSession(employee.id)
                ]);
                setWorkSessions(sessions);
                setActiveSession(active);
                
                // Filter today's sessions
                const today = format(new Date(), 'yyyy-MM-dd');
                const todaySessionsList = await employeeWorkSessionService.getByDate(employee.id, today);
                setDateSessions(todaySessionsList);
                setSelectedDate(today);
            } catch (error) {
                console.error('Error loading work sessions:', error);
            }
        };
        loadWorkSessions();
    }, [employee.id]);

    // Load sessions for selected date
    useEffect(() => {
        const loadDateSessions = async () => {
            try {
                const sessions = await employeeWorkSessionService.getByDate(employee.id, selectedDate);
                setDateSessions(sessions);
            } catch (error) {
                console.error('Error loading date sessions:', error);
            }
        };
        loadDateSessions();
    }, [employee.id, selectedDate]);

    // Load expense transactions for this employee
    useEffect(() => {
        const loadExpenses = async () => {
            setLoadingTransactions(true);
            try {
                const allTransactions: ProjectTransaction[] = [];
                for (const project of projects) {
                    try {
                        const transactions = await projectTransactionService.getByProjectId(project.id);
                        const employeeExpenses = transactions.filter(t => 
                            t.type === 'expense' && t.recipientId === employee.id
                        );
                        allTransactions.push(...employeeExpenses);
                    } catch (error) {
                        console.error(`Error loading transactions for project ${project.id}:`, error);
                    }
                }
                setExpenseTransactions(allTransactions);
            } catch (error) {
                console.error('Error loading expense transactions:', error);
            } finally {
                setLoadingTransactions(false);
            }
        };
        loadExpenses();
    }, [employee.id, projects]);

    // Calculate total work hours from tasks and subtasks
    const totalWorkHours = useMemo(() => {
        let totalMinutes = 0;
        
        tasks.forEach(task => {
            if (task.assigneeId === employee.id && task.sessions) {
                task.sessions.forEach(session => {
                    if (session.startedAt && session.endedAt) {
                        totalMinutes += differenceInMinutes(parseISO(session.endedAt), parseISO(session.startedAt));
                    }
                });
            }
            
            if (task.subtasks) {
                task.subtasks.forEach(subtask => {
                    if (subtask.assigneeId === employee.id && subtask.sessions) {
                        subtask.sessions.forEach(session => {
                            if (session.startedAt && session.endedAt) {
                                totalMinutes += differenceInMinutes(parseISO(session.endedAt), parseISO(session.startedAt));
                            }
                        });
                    }
                });
            }
        });
        
        return (totalMinutes / 60).toFixed(1);
    }, [tasks, employee.id]);

    // Calculate total project value
    const totalProjectValue = useMemo(() => {
        let total = 0;
        
        tasks.forEach(task => {
            if (task.assigneeId === employee.id && task.price) {
                total += task.price;
            }
            
            if (task.subtasks) {
                task.subtasks.forEach(subtask => {
                    if (subtask.assigneeId === employee.id && subtask.price) {
                        total += subtask.price;
                    }
                });
            }
        });
        
        return total;
    }, [tasks, employee.id]);

    // Calculate total expenses
    const totalExpenses = useMemo(() => {
        return expenseTransactions.reduce((sum, t) => sum + t.amount, 0);
    }, [expenseTransactions]);

    // Group transactions by month
    const transactionsByMonth = useMemo(() => {
        const grouped: Record<string, ProjectTransaction[]> = {};
        expenseTransactions.forEach(transaction => {
            const date = parseISO(transaction.transactionDate);
            const monthKey = format(date, 'yyyy-MM');
            if (!grouped[monthKey]) {
                grouped[monthKey] = [];
            }
            grouped[monthKey].push(transaction);
        });
        // Sort by month (newest first)
        return Object.keys(grouped)
            .sort((a, b) => b.localeCompare(a))
            .map(monthKey => ({
                monthKey,
                monthLabel: format(parseISO(`${monthKey}-01`), 'MMMM yyyy', { locale: vi }),
                transactions: grouped[monthKey].sort((a, b) => 
                    new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
                ),
                total: grouped[monthKey].reduce((sum, t) => sum + t.amount, 0)
            }));
    }, [expenseTransactions]);

    // Filter transactions by selected month
    const filteredTransactionsByMonth = useMemo(() => {
        if (monthFilter === 'all') {
            return transactionsByMonth;
        }
        return transactionsByMonth.filter(item => item.monthKey === monthFilter);
    }, [transactionsByMonth, monthFilter]);

    // Get unique months for filter
    const availableMonths = useMemo(() => {
        const months = transactionsByMonth.map(item => ({
            value: item.monthKey,
            label: item.monthLabel
        }));
        return [{ value: 'all', label: 'Tất cả tháng' }, ...months];
    }, [transactionsByMonth]);

    const toggleMonth = (monthKey: string) => {
        const newExpanded = new Set(expandedMonths);
        if (newExpanded.has(monthKey)) {
            newExpanded.delete(monthKey);
        } else {
            newExpanded.add(monthKey);
        }
        setExpandedMonths(newExpanded);
    };

    // Handle delete transaction
    const handleDeleteTransaction = async (transactionId: string) => {
        if (!confirm('Bạn có chắc muốn xóa giao dịch này?')) return;

        try {
            await projectTransactionService.delete(transactionId);
            // Remove from local state
            setExpenseTransactions(expenseTransactions.filter(t => t.id !== transactionId));
        } catch (error) {
            console.error('Error deleting transaction:', error);
            alert('Không thể xóa giao dịch. Vui lòng thử lại.');
        }
    };

    // Calculate total hours worked for selected date
    const totalHoursForDate = useMemo(() => {
        let totalMinutes = 0;
        dateSessions.forEach(session => {
            if (session.startedAt && session.endedAt) {
                const startTime = parseISO(session.startedAt);
                const endTime = parseISO(session.endedAt);
                totalMinutes += differenceInMinutes(endTime, startTime);
            }
        });
        return (totalMinutes / 60).toFixed(2);
    }, [dateSessions]);

    // Calculate total hours for all time
    const totalHoursAllTime = useMemo(() => {
        let totalMinutes = 0;
        workSessions.forEach(session => {
            if (session.startedAt && session.endedAt) {
                const startTime = parseISO(session.startedAt);
                const endTime = parseISO(session.endedAt);
                totalMinutes += differenceInMinutes(endTime, startTime);
            }
        });
        return (totalMinutes / 60).toFixed(2);
    }, [workSessions]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('vi-VN').format(amount);
    };

    // Handle start timer
    const handleStartTimer = async () => {
        setLoadingTimer(true);
        try {
            const session = await employeeWorkSessionService.start(employee.id);
            setActiveSession(session);
            const sessions = await employeeWorkSessionService.getByEmployeeId(employee.id);
            setWorkSessions(sessions);
            const todaySessions = await employeeWorkSessionService.getByDate(employee.id, selectedDate);
            setDateSessions(todaySessions);
        } catch (error) {
            console.error('Error starting timer:', error);
            alert('Không thể bắt đầu bấm giờ');
        } finally {
            setLoadingTimer(false);
        }
    };

    // Handle pause timer
    const handlePauseTimer = async () => {
        setLoadingTimer(true);
        try {
            await employeeWorkSessionService.pause(employee.id);
            setActiveSession(null);
            const sessions = await employeeWorkSessionService.getByEmployeeId(employee.id);
            setWorkSessions(sessions);
            const todaySessions = await employeeWorkSessionService.getByDate(employee.id, selectedDate);
            setDateSessions(todaySessions);
        } catch (error) {
            console.error('Error pausing timer:', error);
            alert('Không thể tạm dừng');
        } finally {
            setLoadingTimer(false);
        }
    };

    // Handle stop timer
    const handleStopTimer = async () => {
        setLoadingTimer(true);
        try {
            await employeeWorkSessionService.pause(employee.id);
            setActiveSession(null);
            const sessions = await employeeWorkSessionService.getByEmployeeId(employee.id);
            setWorkSessions(sessions);
            const todaySessions = await employeeWorkSessionService.getByDate(employee.id, selectedDate);
            setDateSessions(todaySessions);
        } catch (error) {
            console.error('Error stopping timer:', error);
            alert('Không thể dừng việc');
        } finally {
            setLoadingTimer(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4 transition-colors"
                    >
                        <ArrowLeft size={20} />
                        <span className="font-medium">Quay lại</span>
                    </button>
                    <div className="flex items-center gap-6">
                        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 p-1 shadow-xl">
                            <div className="w-full h-full rounded-full overflow-hidden bg-slate-100 flex items-center justify-center">
                                {employee.avatarUrl ? (
                                    <img src={employee.avatarUrl} className="w-full h-full object-cover" alt={employee.fullName} />
                                ) : (
                                    <User size={40} className="text-slate-400" />
                                )}
                            </div>
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900">{employee.fullName}</h1>
                            <div className="flex items-center gap-3 mt-2">
                                <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-semibold uppercase tracking-wider">
                                    {employee.department}
                                </span>
                                <span className="text-slate-500">{employee.position}</span>
                            </div>
                            {employee.email && (
                                <p className="text-slate-500 mt-1">{employee.email}</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-6 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column - Main Info */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Timer Section */}
                        <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-2xl border-2 border-indigo-200 p-8">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <Clock size={24} className="text-indigo-600" />
                                    <h2 className="text-2xl font-bold text-slate-900">Bấm giờ</h2>
                                </div>
                                {activeSession && (
                                    <div className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-full text-sm font-semibold flex items-center gap-2">
                                        <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse"></div>
                                        Đang làm việc
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-3 mb-6">
                                {!activeSession ? (
                                    <button
                                        onClick={handleStartTimer}
                                        disabled={loadingTimer}
                                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/30"
                                    >
                                        <Play size={24} />
                                        {loadingTimer ? 'Đang xử lý...' : 'Bắt đầu bấm giờ'}
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            onClick={handlePauseTimer}
                                            disabled={loadingTimer}
                                            className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white px-6 py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-yellow-500/30"
                                        >
                                            <Pause size={24} />
                                            {loadingTimer ? 'Đang xử lý...' : 'Tạm dừng'}
                                        </button>
                                        <button
                                            onClick={handleStopTimer}
                                            disabled={loadingTimer}
                                            className="flex-1 bg-rose-500 hover:bg-rose-600 text-white px-6 py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-rose-500/30"
                                        >
                                            <Square size={24} />
                                            {loadingTimer ? 'Đang xử lý...' : 'Dừng việc'}
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-indigo-100">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Calendar size={16} className="text-indigo-600" />
                                        <p className="text-indigo-600 text-xs font-medium">Hôm nay</p>
                                    </div>
                                    <p className="text-indigo-700 font-bold text-2xl">{totalHoursForDate} giờ</p>
                                    <p className="text-slate-500 text-xs mt-1">{dateSessions.length} phiên làm việc</p>
                                </div>
                                <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-indigo-100">
                                    <div className="flex items-center gap-2 mb-1">
                                        <TrendingUp size={16} className="text-indigo-600" />
                                        <p className="text-indigo-600 text-xs font-medium">Tổng cộng</p>
                                    </div>
                                    <p className="text-indigo-700 font-bold text-2xl">{totalHoursAllTime} giờ</p>
                                    <p className="text-slate-500 text-xs mt-1">{workSessions.filter(s => s.endedAt).length} phiên đã hoàn thành</p>
                                </div>
                                <div className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-indigo-100">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Clock size={16} className="text-indigo-600" />
                                        <p className="text-indigo-600 text-xs font-medium">Trạng thái</p>
                                    </div>
                                    <p className="text-indigo-700 font-bold text-lg">
                                        {activeSession ? 'Đang làm việc' : 'Chưa bắt đầu'}
                                    </p>
                                    {activeSession && (
                                        <p className="text-slate-500 text-xs mt-1">
                                            Bắt đầu: {format(parseISO(activeSession.startedAt), 'HH:mm', { locale: vi })}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Work Sessions List */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-bold text-slate-900">Lịch sử bấm giờ</h2>
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                />
                            </div>
                            {dateSessions.length > 0 ? (
                                <div className="space-y-3">
                                    {dateSessions.map((session, index) => {
                                        if (!session.startedAt) return null;
                                        const startTime = parseISO(session.startedAt);
                                        const endTime = session.endedAt ? parseISO(session.endedAt) : null;
                                        const duration = endTime ? differenceInMinutes(endTime, startTime) : null;
                                        const hours = duration ? Math.floor(duration / 60) : 0;
                                        const minutes = duration ? duration % 60 : 0;

                                        return (
                                            <div
                                                key={session.id}
                                                className={`p-4 rounded-xl border-2 ${
                                                    session.endedAt
                                                        ? 'bg-slate-50 border-slate-200'
                                                        : 'bg-indigo-50 border-indigo-300'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                                                            session.endedAt ? 'bg-slate-200 text-slate-600' : 'bg-indigo-200 text-indigo-600'
                                                        }`}>
                                                            {index + 1}
                                                        </div>
                                                        <div>
                                                            <p className="font-semibold text-slate-900">
                                                                {format(startTime, 'HH:mm', { locale: vi })} - {endTime ? format(endTime, 'HH:mm', { locale: vi }) : 'Đang chạy...'}
                                                            </p>
                                                            <p className="text-xs text-slate-500">
                                                                {format(startTime, 'dd/MM/yyyy', { locale: vi })}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    {duration !== null && (
                                                        <div className="text-right">
                                                            <p className="font-bold text-indigo-600 text-lg">
                                                                {hours}h {minutes}m
                                                            </p>
                                                            <p className="text-xs text-slate-500">
                                                                {(duration / 60).toFixed(2)} giờ
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-12 text-slate-400">
                                    <Clock size={48} className="mx-auto mb-3 opacity-50" />
                                    <p>Chưa có phiên làm việc nào</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column - Stats */}
                    <div className="space-y-6">
                        {/* Total Work Hours */}
                        <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-6">
                            <div className="flex items-center gap-2 mb-2">
                                <Clock size={20} className="text-indigo-600" />
                                <p className="text-indigo-600 text-sm font-semibold">Tổng thời gian làm việc</p>
                            </div>
                            <p className="text-indigo-700 font-bold text-3xl">{totalWorkHours} giờ</p>
                            <p className="text-slate-500 text-xs mt-1">Từ tasks và subtasks</p>
                        </div>

                        {/* Total Project Value */}
                        {totalProjectValue > 0 && (
                            <div className="bg-violet-50 border-2 border-violet-200 rounded-2xl p-6">
                                <div className="flex items-center gap-2 mb-2">
                                    <DollarSign size={20} className="text-violet-600" />
                                    <p className="text-violet-600 text-sm font-semibold">Tổng tiền dự án</p>
                                </div>
                                <p className="text-violet-700 font-bold text-3xl">{formatCurrency(totalProjectValue)} VNĐ</p>
                            </div>
                        )}

                        {/* Total Expenses */}
                        <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-6">
                            <div className="flex items-center gap-2 mb-2">
                                <ArrowDownCircle size={20} className="text-rose-600" />
                                <p className="text-rose-600 text-sm font-semibold">Tổng tiền đã chi</p>
                            </div>
                            {loadingTransactions ? (
                                <p className="text-rose-700 text-sm">Đang tải...</p>
                            ) : (
                                <p className="text-rose-700 font-bold text-3xl">{formatCurrency(totalExpenses)} VNĐ</p>
                            )}
                        </div>

                        {/* Commission */}
                        {employee.totalCommission !== undefined && employee.totalCommission > 0 && (
                            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-6">
                                <p className="text-emerald-600 text-sm font-semibold mb-2">Tổng hoa hồng</p>
                                <p className="text-emerald-700 font-bold text-3xl">{employee.totalCommission.toLocaleString('vi-VN')} VNĐ</p>
                            </div>
                        )}

                        {/* Expense Details by Month */}
                        {expenseTransactions.length > 0 && (
                            <div className="bg-white border border-slate-200 rounded-2xl p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <p className="text-slate-600 text-sm font-semibold">Danh sách thu chi theo tháng</p>
                                    <div className="flex items-center gap-2">
                                        <Filter size={16} className="text-slate-400" />
                                        <select
                                            value={monthFilter}
                                            onChange={(e) => setMonthFilter(e.target.value)}
                                            className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                                        >
                                            {availableMonths.map(month => (
                                                <option key={month.value} value={month.value}>{month.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="space-y-3 max-h-96 overflow-y-auto">
                                    {filteredTransactionsByMonth.length > 0 ? (
                                        filteredTransactionsByMonth.map(({ monthKey, monthLabel, transactions, total }) => {
                                            const isExpanded = expandedMonths.has(monthKey);
                                            return (
                                                <div key={monthKey} className="border border-slate-200 rounded-xl overflow-hidden">
                                                    <button
                                                        onClick={() => toggleMonth(monthKey)}
                                                        className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors flex items-center justify-between"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <Calendar size={16} className="text-indigo-600" />
                                                            <span className="font-semibold text-slate-900">{monthLabel}</span>
                                                            <span className="text-xs text-slate-500">({transactions.length} giao dịch)</span>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <span className="font-bold text-rose-600">{formatCurrency(total)} VNĐ</span>
                                                            {isExpanded ? (
                                                                <ChevronUp size={18} className="text-slate-400" />
                                                            ) : (
                                                                <ChevronDown size={18} className="text-slate-400" />
                                                            )}
                                                        </div>
                                                    </button>
                                                    {isExpanded && (
                                                        <div className="p-4 space-y-2 bg-white">
                                                            {transactions.map(transaction => {
                                                                const project = projects.find(p => p.id === transaction.projectId);
                                                                return (
                                                                    <div key={transaction.id} className="bg-slate-50 p-3 rounded-lg border border-slate-200 group/transaction hover:border-slate-300 transition-colors">
                                                                        <div className="flex items-start justify-between">
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="flex items-center justify-between mb-1">
                                                                                    <span className="text-sm font-semibold text-slate-700">{project?.name || 'Dự án'}</span>
                                                                                    <span className="text-sm font-bold text-rose-600">{formatCurrency(transaction.amount)} VNĐ</span>
                                                                                </div>
                                                                                {transaction.description && (
                                                                                    <p className="text-xs text-slate-500 truncate">{transaction.description}</p>
                                                                                )}
                                                                                <p className="text-xs text-slate-400 mt-1">
                                                                                    {format(parseISO(transaction.transactionDate), 'dd/MM/yyyy HH:mm', { locale: vi })}
                                                                                </p>
                                                                                <div className="flex items-center gap-2 mt-1">
                                                                                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                                                                        transaction.status === 'paid' 
                                                                                            ? 'bg-emerald-100 text-emerald-700' 
                                                                                            : 'bg-amber-100 text-amber-700'
                                                                                    }`}>
                                                                                        {transaction.status === 'paid' ? 'Đã chi' : 'Chờ chi'}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                            <button
                                                                                onClick={() => handleDeleteTransaction(transaction.id)}
                                                                                className="ml-2 p-1.5 text-rose-600 hover:bg-rose-50 rounded transition-colors opacity-0 group-hover/transaction:opacity-100"
                                                                                title="Xóa giao dịch"
                                                                            >
                                                                                <Trash2 size={14} />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="text-center py-8 text-slate-400">
                                            <DollarSign size={32} className="mx-auto mb-2 opacity-50" />
                                            <p className="text-sm">Chưa có giao dịch nào trong tháng đã chọn</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* QR Code */}
                        {employee.qrCodeUrl ? (
                            <div className="bg-white border border-slate-200 rounded-2xl p-6">
                                <div className="flex flex-col items-center">
                                    <div className="bg-white p-3 rounded-xl shadow-sm border border-slate-100 mb-3">
                                        <img src={employee.qrCodeUrl} className="w-48 h-48 object-contain" alt="QR Code" />
                                    </div>
                                    <p className="text-xs text-slate-400 flex items-center gap-1">
                                        <QrCode size={12} /> Quét mã để lấy thông tin
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center text-slate-400">
                                <QrCode size={32} className="mx-auto mb-2 opacity-50" />
                                <p className="text-sm">Chưa có mã QR</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
