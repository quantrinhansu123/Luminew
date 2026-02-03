import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Calendar, Clock, DollarSign, ArrowUpCircle, ArrowDownCircle, CheckCircle2, AlertCircle, Plus, Edit, Trash2, X, Filter, Search, ChevronDown, ChevronRight, Users, Play, Pause, Pencil } from 'lucide-react';
import { Project, Task, Employee, ProjectTransaction, Subtask } from '../types';
import { taskService, projectTransactionService, projectService, subtaskService } from '../services/databaseService';
import { format, parseISO, differenceInDays, isPast, isToday, differenceInMinutes } from 'date-fns';
import { vi } from 'date-fns/locale';

interface ProjectDetailViewProps {
    project: Project;
    onBack: () => void;
    employees?: Employee[];
    onEditProject?: (project: Project) => void;
    onAddTransaction?: (project: Project) => void;
    onAddTask?: (projectId: string) => void;
    onEditTask?: (task: Task) => void;
    onDeleteTask?: (taskId: string) => void;
}

export const ProjectDetailView: React.FC<ProjectDetailViewProps> = ({
    project,
    onBack,
    employees = [],
    onEditProject,
    onAddTransaction,
    onAddTask,
    onEditTask,
    onDeleteTask
}) => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [transactions, setTransactions] = useState<ProjectTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'pending'>('all');
    const [financialDateFilter, setFinancialDateFilter] = useState<'all' | 'thisMonth' | 'thisQuarter' | 'thisYear' | 'custom'>('all');
    const [customDateStart, setCustomDateStart] = useState('');
    const [customDateEnd, setCustomDateEnd] = useState('');
    const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
    const [taskSubtasks, setTaskSubtasks] = useState<Record<string, Subtask[]>>({});
    const [addingSubtaskForTask, setAddingSubtaskForTask] = useState<string | null>(null);
    const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
    const [newSubtaskAssigneeId, setNewSubtaskAssigneeId] = useState('');
    const [newSubtaskPrice, setNewSubtaskPrice] = useState('');
    const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
    const [editingSubtaskAssigneeId, setEditingSubtaskAssigneeId] = useState('');
    const [editingSubtaskPrice, setEditingSubtaskPrice] = useState('');

    // Load tasks and transactions
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const [projectTasks, projectTransactions] = await Promise.all([
                    taskService.getByProjectId(project.id),
                    projectService.loadProjectTransactions(project.id)
                ]);
                setTasks(projectTasks);
                setTransactions(projectTransactions);
            } catch (error) {
                console.error('Error loading project data:', error);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [project.id]);

    // Filter tasks
    const filteredTasks = useMemo(() => {
        let filtered = tasks;

        // Search filter
        if (searchQuery) {
            filtered = filtered.filter(t =>
                t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                t.description?.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }

        // Status filter
        if (statusFilter === 'completed') {
            filtered = filtered.filter(t => t.isCompleted);
        } else if (statusFilter === 'pending') {
            filtered = filtered.filter(t => !t.isCompleted);
        }

        return filtered;
    }, [tasks, searchQuery, statusFilter]);

    // Calculate financial stats with date filter
    const financialStats = useMemo(() => {
        let dateStart: Date | null = null;
        let dateEnd: Date | null = null;
        const now = new Date();

        if (financialDateFilter === 'thisMonth') {
            dateStart = new Date(now.getFullYear(), now.getMonth(), 1);
            dateEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        } else if (financialDateFilter === 'thisQuarter') {
            const quarter = Math.floor(now.getMonth() / 3);
            dateStart = new Date(now.getFullYear(), quarter * 3, 1);
            dateEnd = new Date(now.getFullYear(), (quarter + 1) * 3, 0, 23, 59, 59);
        } else if (financialDateFilter === 'thisYear') {
            dateStart = new Date(now.getFullYear(), 0, 1);
            dateEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
        } else if (financialDateFilter === 'custom' && customDateStart && customDateEnd) {
            dateStart = new Date(customDateStart);
            dateEnd = new Date(customDateEnd);
            dateEnd.setHours(23, 59, 59);
        }

        const isInDateRange = (transactionDate: string, paymentDate?: string) => {
            if (!dateStart || !dateEnd) return true;
            const checkDate = paymentDate ? new Date(paymentDate) : new Date(transactionDate);
            return checkDate >= dateStart && checkDate <= dateEnd;
        };

        const totalIncomePaid = transactions.filter(t =>
            t.type === 'income' &&
            t.status === 'paid' &&
            isInDateRange(t.transactionDate, t.paymentDate)
        ).reduce((sum, t) => sum + t.amount, 0);

        const totalIncomePending = transactions.filter(t =>
            t.type === 'income' &&
            t.status === 'pending' &&
            isInDateRange(t.transactionDate, t.paymentDate)
        ).reduce((sum, t) => sum + t.amount, 0);

        const totalExpensePaid = transactions.filter(t =>
            t.type === 'expense' &&
            t.status === 'paid' &&
            isInDateRange(t.transactionDate, t.paymentDate)
        ).reduce((sum, t) => sum + t.amount, 0);

        const totalExpensePending = transactions.filter(t =>
            t.type === 'expense' &&
            t.status === 'pending' &&
            isInDateRange(t.transactionDate, t.paymentDate)
        ).reduce((sum, t) => sum + t.amount, 0);

        const balance = totalIncomePaid - totalExpensePaid;
        const amountToCollect = totalIncomePending;

        return {
            totalIncomePaid,
            totalIncomePending,
            totalExpensePaid,
            totalExpensePending,
            balance,
            amountToCollect
        };
    }, [transactions, financialDateFilter, customDateStart, customDateEnd]);

    // Task stats
    const taskStats = useMemo(() => {
        const total = tasks.length;
        const completed = tasks.filter(t => t.isCompleted).length;
        const pending = total - completed;
        const overdue = tasks.filter(t => {
            if (t.isCompleted) return false;
            const deadline = parseISO(t.deadline);
            return isPast(deadline) && !isToday(deadline);
        }).length;

        return { total, completed, pending, overdue };
    }, [tasks]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('vi-VN').format(amount);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center">
                    <Clock className="animate-spin text-indigo-600 mx-auto mb-4" size={48} />
                    <p className="text-slate-600">Đang tải dữ liệu...</p>
                </div>
            </div>
        );
    }

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
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div
                                className="w-16 h-16 rounded-xl flex items-center justify-center text-white text-2xl font-bold shadow-lg"
                                style={{ backgroundColor: project.color }}
                            >
                                {project.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold text-slate-900">{project.name}</h1>
                                {project.description && (
                                    <p className="text-slate-500 mt-1">{project.description}</p>
                                )}
                                <p className="text-sm text-slate-400 mt-1">
                                    Tạo ngày: {format(parseISO(project.createdAt), 'dd/MM/yyyy', { locale: vi })}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {onEditProject && (
                                <button
                                    onClick={() => onEditProject(project)}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all flex items-center gap-2"
                                >
                                    <Edit size={18} />
                                    Sửa dự án
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-6 py-8">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {/* Project Price */}
                    {project.price && project.price > 0 && (
                        <div className="bg-violet-50 border-2 border-violet-200 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-1">
                                <DollarSign size={18} className="text-violet-600" />
                                <p className="text-violet-600 text-sm font-semibold">Giá dự án</p>
                            </div>
                            <p className="text-violet-700 font-bold text-2xl">{formatCurrency(project.price)} VNĐ</p>
                        </div>
                    )}

                    {/* Total Income */}
                    <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-1">
                            <ArrowUpCircle size={18} className="text-emerald-600" />
                            <p className="text-emerald-600 text-sm font-semibold">Tổng thu</p>
                        </div>
                        <p className="text-emerald-700 font-bold text-2xl">{formatCurrency(financialStats.totalIncomePaid)} VNĐ</p>
                        {financialStats.totalIncomePending > 0 && (
                            <p className="text-xs text-emerald-600 mt-1">Chờ thu: {formatCurrency(financialStats.totalIncomePending)}</p>
                        )}
                    </div>

                    {/* Total Expense */}
                    <div className="bg-rose-50 border-2 border-rose-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-1">
                            <ArrowDownCircle size={18} className="text-rose-600" />
                            <p className="text-rose-600 text-sm font-semibold">Tổng chi</p>
                        </div>
                        <p className="text-rose-700 font-bold text-2xl">{formatCurrency(financialStats.totalExpensePaid)} VNĐ</p>
                        {financialStats.totalExpensePending > 0 && (
                            <p className="text-xs text-rose-600 mt-1">Chờ chi: {formatCurrency(financialStats.totalExpensePending)}</p>
                        )}
                    </div>

                    {/* Balance */}
                    <div className={`border-2 rounded-xl p-4 ${financialStats.balance >= 0 ? 'bg-indigo-50 border-indigo-200' : 'bg-rose-50 border-rose-200'}`}>
                        <div className="flex items-center gap-2 mb-1">
                            <DollarSign size={18} className={financialStats.balance >= 0 ? 'text-indigo-600' : 'text-rose-600'} />
                            <p className={`text-sm font-semibold ${financialStats.balance >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>Số dư</p>
                        </div>
                        <p className={`font-bold text-2xl ${financialStats.balance >= 0 ? 'text-indigo-700' : 'text-rose-700'}`}>
                            {formatCurrency(financialStats.balance)} VNĐ
                        </p>
                    </div>
                </div>

                {/* Amount to Collect */}
                {financialStats.amountToCollect > 0 && (
                    <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 mb-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <DollarSign size={20} className="text-amber-600" />
                                <p className="text-amber-700 font-semibold">Số tiền cần thu</p>
                            </div>
                            <p className="text-amber-700 font-bold text-2xl">{formatCurrency(financialStats.amountToCollect)} VNĐ</p>
                        </div>
                    </div>
                )}

                {/* Financial Date Filter */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
                    <div className="flex items-center gap-4 flex-wrap">
                        <label className="text-sm font-semibold text-slate-700">Lọc theo thời gian:</label>
                        <select
                            value={financialDateFilter}
                            onChange={(e) => setFinancialDateFilter(e.target.value as any)}
                            className="px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        >
                            <option value="all">Tất cả</option>
                            <option value="thisMonth">Tháng này</option>
                            <option value="thisQuarter">Quý này</option>
                            <option value="thisYear">Năm này</option>
                            <option value="custom">Tùy chọn</option>
                        </select>
                        {financialDateFilter === 'custom' && (
                            <div className="flex items-center gap-2">
                                <input
                                    type="date"
                                    value={customDateStart}
                                    onChange={(e) => setCustomDateStart(e.target.value)}
                                    className="px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                                <span>đến</span>
                                <input
                                    type="date"
                                    value={customDateEnd}
                                    onChange={(e) => setCustomDateEnd(e.target.value)}
                                    className="px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                        )}
                        {onAddTransaction && (
                            <button
                                onClick={() => onAddTransaction(project)}
                                className="ml-auto px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-all flex items-center gap-2"
                            >
                                <Plus size={18} />
                                Thêm thu chi
                            </button>
                        )}
                    </div>
                </div>

                {/* Tasks Section */}
                <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                            <h2 className="text-xl font-bold text-slate-900">Công việc</h2>
                            <div className="flex items-center gap-2">
                                <div className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-semibold">
                                    Tổng: {taskStats.total}
                                </div>
                                <div className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-semibold">
                                    Hoàn thành: {taskStats.completed}
                                </div>
                                <div className="px-3 py-1 bg-amber-50 text-amber-700 rounded-lg text-sm font-semibold">
                                    Đang làm: {taskStats.pending}
                                </div>
                                {taskStats.overdue > 0 && (
                                    <div className="px-3 py-1 bg-rose-50 text-rose-700 rounded-lg text-sm font-semibold">
                                        Quá hạn: {taskStats.overdue}
                                    </div>
                                )}
                            </div>
                        </div>
                        {onAddTask && (
                            <button
                                onClick={() => onAddTask(project.id)}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-all flex items-center gap-2"
                            >
                                <Plus size={18} />
                                Thêm công việc
                            </button>
                        )}
                    </div>

                    {/* Task Filters */}
                    <div className="flex items-center gap-4 mb-4">
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Tìm kiếm công việc..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setStatusFilter('all')}
                                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                                    statusFilter === 'all'
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                Tất cả
                            </button>
                            <button
                                onClick={() => setStatusFilter('pending')}
                                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                                    statusFilter === 'pending'
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                Đang làm
                            </button>
                            <button
                                onClick={() => setStatusFilter('completed')}
                                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                                    statusFilter === 'completed'
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                Hoàn thành
                            </button>
                        </div>
                    </div>

                    {/* Tasks List */}
                    <div className="space-y-3">
                        {filteredTasks.length > 0 ? (
                            filteredTasks.map(task => {
                                const deadline = parseISO(task.deadline);
                                const isOverdue = isPast(deadline) && !isToday(deadline) && !task.isCompleted;
                                const assignee = employees.find(e => e.id === task.assigneeId);
                                const isExpanded = expandedTasks.has(task.id);
                                const subtasks = taskSubtasks[task.id] || [];

                                const handleToggleExpand = async () => {
                                    if (isExpanded) {
                                        // Collapse
                                        setExpandedTasks(prev => {
                                            const newSet = new Set(prev);
                                            newSet.delete(task.id);
                                            return newSet;
                                        });
                                    } else {
                                        // Expand - load subtasks if not already loaded
                                        setExpandedTasks(prev => new Set(prev).add(task.id));
                                        if (!taskSubtasks[task.id]) {
                                            try {
                                                const loadedSubtasks = await subtaskService.getByTaskId(task.id);
                                                setTaskSubtasks(prev => ({
                                                    ...prev,
                                                    [task.id]: loadedSubtasks
                                                }));
                                            } catch (error) {
                                                console.error('Error loading subtasks:', error);
                                            }
                                        }
                                    }
                                };

                                return (
                                    <div
                                        key={task.id}
                                        className={`p-4 rounded-xl border-2 transition-all ${
                                            task.isCompleted
                                                ? 'bg-slate-50 border-slate-200 opacity-75'
                                                : isOverdue
                                                ? 'bg-rose-50 border-rose-200'
                                                : 'bg-white border-slate-200 hover:border-indigo-300'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <button
                                                        onClick={handleToggleExpand}
                                                        className="flex-shrink-0 p-1 hover:bg-indigo-50 rounded transition-colors flex items-center justify-center"
                                                        title={isExpanded ? "Ẩn subtasks" : "Hiển thị subtasks"}
                                                    >
                                                        {isExpanded ? (
                                                            <ChevronDown size={18} className="text-indigo-600" />
                                                        ) : (
                                                            <ChevronRight size={18} className="text-indigo-600" />
                                                        )}
                                                    </button>
                                                    {task.isCompleted ? (
                                                        <CheckCircle2 size={20} className="text-emerald-600" />
                                                    ) : (
                                                        <AlertCircle size={20} className={isOverdue ? 'text-rose-600' : 'text-indigo-600'} />
                                                    )}
                                                    <h3 
                                                        className={`font-semibold cursor-pointer ${task.isCompleted ? 'line-through text-slate-500' : 'text-slate-900'}`}
                                                        onClick={handleToggleExpand}
                                                    >
                                                        {task.title}
                                                    </h3>
                                                    {task.priority === 'High' && !task.isCompleted && (
                                                        <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-xs font-bold">
                                                            Gấp
                                                        </span>
                                                    )}
                                                </div>
                                                {task.description && (
                                                    <p className="text-sm text-slate-600 mb-2">{task.description}</p>
                                                )}
                                                <div className="flex items-center gap-4 text-xs text-slate-500">
                                                    <div className="flex items-center gap-1">
                                                        <Calendar size={14} />
                                                        <span>Hạn: {format(deadline, 'dd/MM/yyyy HH:mm', { locale: vi })}</span>
                                                    </div>
                                                    {assignee && (
                                                        <div className="flex items-center gap-1">
                                                            <span>Người phụ trách: {assignee.fullName}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                {/* Subtasks Section */}
                                                {isExpanded && (
                                                    <div className="mt-3 ml-8 space-y-2">
                                                        {subtasks.length > 0 ? (
                                                            subtasks.map(subtask => {
                                                                const hasActiveSession = subtask.sessions?.some(s => s.startedAt && !s.endedAt) || false;
                                                                const subtaskTotalMinutes = subtask.sessions?.reduce((acc, s) => {
                                                                    if (s.startedAt && s.endedAt) {
                                                                        return acc + differenceInMinutes(parseISO(s.endedAt), parseISO(s.startedAt));
                                                                    }
                                                                    return acc;
                                                                }, 0) || 0;
                                                                const subtaskTotalHours = subtaskTotalMinutes / 60;
                                                                const subtaskTotalWorked = subtaskTotalMinutes > 0
                                                                    ? subtaskTotalHours >= 1
                                                                        ? `${subtaskTotalHours.toFixed(1)}h`
                                                                        : `${subtaskTotalMinutes}m`
                                                                    : null;

                                                                return (
                                                                    <div
                                                                        key={subtask.id}
                                                                        className="relative flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200 group/subtask hover:bg-slate-100 transition-colors"
                                                                    >
                                                                        <button
                                                                            onClick={async () => {
                                                                                try {
                                                                                    const updatedSubtask = await subtaskService.toggleComplete(subtask.id);
                                                                                    setTaskSubtasks(prev => ({
                                                                                        ...prev,
                                                                                        [task.id]: (prev[task.id] || []).map(s => 
                                                                                            s.id === subtask.id ? updatedSubtask : s
                                                                                        )
                                                                                    }));
                                                                                } catch (error) {
                                                                                    console.error('Error toggling subtask:', error);
                                                                                    alert('Không thể cập nhật subtask');
                                                                                }
                                                                            }}
                                                                            className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-all cursor-pointer ${
                                                                                subtask.isCompleted
                                                                                    ? 'bg-emerald-500 border-emerald-500 text-white'
                                                                                    : 'border-slate-300 hover:border-indigo-500'
                                                                            }`}
                                                                        >
                                                                            {subtask.isCompleted && <CheckCircle2 size={10} className="text-white" />}
                                                                        </button>
                                                                        <div className="flex-1 flex items-center gap-2 min-w-0">
                                                                            <span className={`text-sm flex-1 ${
                                                                                subtask.isCompleted
                                                                                    ? 'text-slate-400 line-through'
                                                                                    : 'text-slate-700'
                                                                            }`}>
                                                                                {subtask.title}
                                                                            </span>
                                                                            {subtask.assignee && (
                                                                                <div className="flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 flex-shrink-0">
                                                                                    {subtask.assignee.avatarUrl ? (
                                                                                        <img src={subtask.assignee.avatarUrl} className="w-4 h-4 rounded-full object-cover" />
                                                                                    ) : (
                                                                                        <Users size={12} className="text-indigo-600" />
                                                                                    )}
                                                                                    <span className="text-xs text-indigo-700 max-w-[80px] truncate">{subtask.assignee.fullName}</span>
                                                                                </div>
                                                                            )}
                                                                            {subtask.price && subtask.price > 0 && (
                                                                                <div className="flex items-center gap-0.5 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 flex-shrink-0">
                                                                                    <DollarSign size={12} className="text-emerald-600" />
                                                                                    <span className="text-xs font-semibold text-emerald-700">
                                                                                        {formatCurrency(subtask.price)}
                                                                                    </span>
                                                                                </div>
                                                                            )}
                                                                            {!subtask.isCompleted && (
                                                                                <>
                                                                                    {hasActiveSession && (
                                                                                        <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded flex items-center gap-1 flex-shrink-0">
                                                                                            <Play size={10} />
                                                                                            <span>Đang làm...</span>
                                                                                        </span>
                                                                                    )}
                                                                                    {subtaskTotalWorked && !hasActiveSession && (
                                                                                        <span className="text-xs font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded flex-shrink-0">
                                                                                            {subtaskTotalWorked}
                                                                                        </span>
                                                                                    )}
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                        {!subtask.isCompleted && (
                                                                            <>
                                                                                {hasActiveSession ? (
                                                                                    <button
                                                                                        onClick={async () => {
                                                                                            try {
                                                                                                const updatedSubtask = await subtaskService.pauseSession(subtask.id);
                                                                                                setTaskSubtasks(prev => ({
                                                                                                    ...prev,
                                                                                                    [task.id]: (prev[task.id] || []).map(s => 
                                                                                                        s.id === subtask.id ? updatedSubtask : s
                                                                                                    )
                                                                                                }));
                                                                                            } catch (error) {
                                                                                                console.error('Error pausing subtask:', error);
                                                                                                alert('Không thể tạm dừng subtask');
                                                                                            }
                                                                                        }}
                                                                                        className="p-1 text-amber-600 hover:bg-amber-50 rounded transition-colors opacity-0 group-hover/subtask:opacity-100"
                                                                                        title="Tạm dừng"
                                                                                    >
                                                                                        <Pause size={14} />
                                                                                    </button>
                                                                                ) : (
                                                                                    <button
                                                                                        onClick={async () => {
                                                                                            try {
                                                                                                const updatedSubtask = await subtaskService.startSession(subtask.id);
                                                                                                setTaskSubtasks(prev => ({
                                                                                                    ...prev,
                                                                                                    [task.id]: (prev[task.id] || []).map(s => 
                                                                                                        s.id === subtask.id ? updatedSubtask : s
                                                                                                    )
                                                                                                }));
                                                                                            } catch (error) {
                                                                                                console.error('Error starting subtask:', error);
                                                                                                alert('Không thể bắt đầu subtask');
                                                                                            }
                                                                                        }}
                                                                                        className="p-1 text-indigo-600 hover:bg-indigo-50 rounded transition-colors opacity-0 group-hover/subtask:opacity-100"
                                                                                        title="Bắt đầu"
                                                                                    >
                                                                                        <Play size={14} />
                                                                                    </button>
                                                                                )}
                                                                            </>
                                                                        )}
                                                                        {!task.isCompleted && (
                                                                            <>
                                                                                <button
                                                                                    onClick={() => {
                                                                                        if (editingSubtaskId === subtask.id) {
                                                                                            setEditingSubtaskId(null);
                                                                                            setEditingSubtaskAssigneeId('');
                                                                                            setEditingSubtaskPrice('');
                                                                                        } else {
                                                                                            setEditingSubtaskId(subtask.id);
                                                                                            setEditingSubtaskAssigneeId(subtask.assigneeId || '');
                                                                                            setEditingSubtaskPrice(subtask.price ? subtask.price.toString() : '');
                                                                                        }
                                                                                    }}
                                                                                    className="opacity-0 group-hover/subtask:opacity-100 p-1 text-slate-400 hover:text-indigo-500 transition-all"
                                                                                    title="Sửa"
                                                                                >
                                                                                    <Pencil size={14} />
                                                                                </button>
                                                                                <button
                                                                                    onClick={async () => {
                                                                                        if (confirm('Bạn chắc chắn muốn xóa subtask này?')) {
                                                                                            try {
                                                                                                await subtaskService.delete(subtask.id);
                                                                                                setTaskSubtasks(prev => ({
                                                                                                    ...prev,
                                                                                                    [task.id]: (prev[task.id] || []).filter(s => s.id !== subtask.id)
                                                                                                }));
                                                                                                // Reload tasks
                                                                                                const updatedTasks = await taskService.getByProjectId(project.id);
                                                                                                setTasks(updatedTasks);
                                                                                            } catch (error) {
                                                                                                console.error('Error deleting subtask:', error);
                                                                                                alert('Không thể xóa subtask');
                                                                                            }
                                                                                        }
                                                                                    }}
                                                                                    className="opacity-0 group-hover/subtask:opacity-100 p-1 text-slate-400 hover:text-rose-500 transition-all"
                                                                                    title="Xóa"
                                                                                >
                                                                                    <X size={14} />
                                                                                </button>
                                                                            </>
                                                                        )}
                                                                        {editingSubtaskId === subtask.id && (
                                                                            <div className="absolute top-full left-0 mt-1 p-3 bg-white border border-slate-200 rounded-lg shadow-lg z-10 min-w-[250px]">
                                                                                <div className="space-y-2">
                                                                                    <div>
                                                                                        <label className="text-xs text-slate-600 mb-1 block">Nhân sự</label>
                                                                                        <select
                                                                                            value={editingSubtaskAssigneeId}
                                                                                            onChange={(e) => setEditingSubtaskAssigneeId(e.target.value)}
                                                                                            className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                                        >
                                                                                            <option value="">-- Chọn nhân sự --</option>
                                                                                            {employees.map(emp => (
                                                                                                <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                                                                                            ))}
                                                                                        </select>
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="text-xs text-slate-600 mb-1 block">Giá (VNĐ)</label>
                                                                                        <input
                                                                                            type="text"
                                                                                            value={editingSubtaskPrice ? formatCurrency(Number(editingSubtaskPrice.replace(/\D/g, ''))) : ''}
                                                                                            onChange={(e) => {
                                                                                                const numbers = e.target.value.replace(/\D/g, '');
                                                                                                setEditingSubtaskPrice(numbers);
                                                                                            }}
                                                                                            placeholder="Nhập giá..."
                                                                                            className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                                        />
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <button
                                                                                            onClick={async () => {
                                                                                                try {
                                                                                                    const price = editingSubtaskPrice ? Number(editingSubtaskPrice.replace(/\D/g, '')) : undefined;
                                                                                                    const updatedSubtask = await subtaskService.update(subtask.id, {
                                                                                                        assigneeId: editingSubtaskAssigneeId || undefined,
                                                                                                        price: price
                                                                                                    });
                                                                                                    setTaskSubtasks(prev => ({
                                                                                                        ...prev,
                                                                                                        [task.id]: (prev[task.id] || []).map(s => 
                                                                                                            s.id === subtask.id ? updatedSubtask : s
                                                                                                        )
                                                                                                    }));
                                                                                                    setEditingSubtaskId(null);
                                                                                                    setEditingSubtaskAssigneeId('');
                                                                                                    setEditingSubtaskPrice('');
                                                                                                } catch (error) {
                                                                                                    console.error('Error updating subtask:', error);
                                                                                                    alert('Không thể cập nhật subtask');
                                                                                                }
                                                                                            }}
                                                                                            className="flex-1 px-3 py-1.5 bg-indigo-600 text-white text-sm font-semibold rounded-md hover:bg-indigo-700 transition-colors"
                                                                                        >
                                                                                            Lưu
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={() => {
                                                                                                setEditingSubtaskId(null);
                                                                                                setEditingSubtaskAssigneeId('');
                                                                                                setEditingSubtaskPrice('');
                                                                                            }}
                                                                                            className="px-3 py-1.5 bg-slate-200 text-slate-700 text-sm font-semibold rounded-md hover:bg-slate-300 transition-colors"
                                                                                        >
                                                                                            Hủy
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })
                                                        ) : (
                                                            <p className="text-sm text-slate-400 italic">Chưa có subtask nào</p>
                                                        )}
                                                        
                                                        {/* Add Subtask Form */}
                                                        {!task.isCompleted && (
                                                            <div className="mt-2">
                                                                {addingSubtaskForTask === task.id ? (
                                                                    <form 
                                                                        onSubmit={async (e) => {
                                                                            e.preventDefault();
                                                                            if (!newSubtaskTitle.trim()) return;
                                                                            
                                                                            try {
                                                                                const price = newSubtaskPrice ? Number(newSubtaskPrice.replace(/\D/g, '')) : undefined;
                                                                                const newSubtask = await subtaskService.create(
                                                                                    task.id,
                                                                                    newSubtaskTitle.trim(),
                                                                                    newSubtaskAssigneeId || undefined,
                                                                                    price
                                                                                );
                                                                                
                                                                                // Update subtasks list
                                                                                setTaskSubtasks(prev => ({
                                                                                    ...prev,
                                                                                    [task.id]: [...(prev[task.id] || []), newSubtask]
                                                                                }));
                                                                                
                                                                                // Reset form
                                                                                setNewSubtaskTitle('');
                                                                                setNewSubtaskAssigneeId('');
                                                                                setNewSubtaskPrice('');
                                                                                setAddingSubtaskForTask(null);
                                                                                
                                                                                // Reload tasks to update counts
                                                                                const updatedTasks = await taskService.getByProjectId(project.id);
                                                                                setTasks(updatedTasks);
                                                                            } catch (error) {
                                                                                console.error('Error adding subtask:', error);
                                                                                alert('Không thể thêm subtask. Vui lòng thử lại.');
                                                                            }
                                                                        }}
                                                                        className="p-3 bg-indigo-50 rounded-lg border border-indigo-200 space-y-2"
                                                                    >
                                                                        <input
                                                                            type="text"
                                                                            value={newSubtaskTitle}
                                                                            onChange={(e) => setNewSubtaskTitle(e.target.value)}
                                                                            placeholder="Nhập tên subtask..."
                                                                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                            autoFocus
                                                                        />
                                                                        <div className="flex items-center gap-2">
                                                                            <select
                                                                                value={newSubtaskAssigneeId}
                                                                                onChange={(e) => setNewSubtaskAssigneeId(e.target.value)}
                                                                                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                            >
                                                                                <option value="">-- Chọn nhân sự --</option>
                                                                                {employees.map(emp => (
                                                                                    <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                                                                                ))}
                                                                            </select>
                                                                            <input
                                                                                type="text"
                                                                                value={newSubtaskPrice}
                                                                                onChange={(e) => {
                                                                                    const numbers = e.target.value.replace(/\D/g, '');
                                                                                    setNewSubtaskPrice(numbers.replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
                                                                                }}
                                                                                placeholder="Giá (VNĐ)"
                                                                                className="w-32 px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                            />
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <button
                                                                                type="submit"
                                                                                className="flex-1 px-3 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-md hover:bg-indigo-700 transition-colors"
                                                                            >
                                                                                Thêm
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    setAddingSubtaskForTask(null);
                                                                                    setNewSubtaskTitle('');
                                                                                    setNewSubtaskAssigneeId('');
                                                                                    setNewSubtaskPrice('');
                                                                                }}
                                                                                className="px-3 py-2 bg-slate-200 text-slate-700 text-sm font-semibold rounded-md hover:bg-slate-300 transition-colors"
                                                                            >
                                                                                Hủy
                                                                            </button>
                                                                        </div>
                                                                    </form>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => setAddingSubtaskForTask(task.id)}
                                                                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
                                                                    >
                                                                        <Plus size={16} />
                                                                        <span>Thêm subtask</span>
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {onEditTask && (
                                                    <button
                                                        onClick={() => onEditTask(task)}
                                                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                    >
                                                        <Edit size={18} />
                                                    </button>
                                                )}
                                                {onDeleteTask && (
                                                    <button
                                                        onClick={() => {
                                                            if (confirm('Bạn chắc chắn muốn xóa công việc này?')) {
                                                                onDeleteTask(task.id);
                                                            }
                                                        }}
                                                        className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="text-center py-12 text-slate-400">
                                <AlertCircle size={48} className="mx-auto mb-3 opacity-50" />
                                <p>Chưa có công việc nào</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Transactions Section */}
                <div className="bg-white rounded-xl border border-slate-200 p-6">
                    <h2 className="text-xl font-bold text-slate-900 mb-4">Lịch sử thu chi</h2>
                    {transactions.length > 0 ? (
                        <div className="space-y-3">
                            {transactions.map(transaction => {
                                const recipient = employees.find(e => e.id === transaction.recipientId);
                                return (
                                    <div
                                        key={transaction.id}
                                        className={`p-4 rounded-xl border-2 ${
                                            transaction.type === 'income'
                                                ? 'bg-emerald-50 border-emerald-200'
                                                : 'bg-rose-50 border-rose-200'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    {transaction.type === 'income' ? (
                                                        <ArrowUpCircle size={18} className="text-emerald-600" />
                                                    ) : (
                                                        <ArrowDownCircle size={18} className="text-rose-600" />
                                                    )}
                                                    <span className={`font-semibold ${transaction.type === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                        {transaction.type === 'income' ? 'Thu' : 'Chi'}
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                                        transaction.status === 'paid'
                                                            ? 'bg-emerald-100 text-emerald-700'
                                                            : 'bg-amber-100 text-amber-700'
                                                    }`}>
                                                        {transaction.status === 'paid' ? 'Đã thanh toán' : 'Chờ thanh toán'}
                                                    </span>
                                                </div>
                                                {transaction.description && (
                                                    <p className="text-sm text-slate-600 mb-1">{transaction.description}</p>
                                                )}
                                                {recipient && (
                                                    <p className="text-xs text-slate-500">Người nhận: {recipient.fullName}</p>
                                                )}
                                                <p className="text-xs text-slate-500">
                                                    {format(parseISO(transaction.transactionDate), 'dd/MM/yyyy', { locale: vi })}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className={`font-bold text-lg ${transaction.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.amount)} VNĐ
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-12 text-slate-400">
                            <DollarSign size={48} className="mx-auto mb-3 opacity-50" />
                            <p>Chưa có giao dịch nào</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
