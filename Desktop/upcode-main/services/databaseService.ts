import { supabase, isSupabaseConfigured } from './supabaseClient';
import { getErrorMessage, isNetworkError, retryWithBackoff } from '../utils/errorHandler';
import type { Project, Task, Employee, TaskType, Subtask, TaskAssignee, TaskPayment, ProjectTransaction, EmployeeWorkSession } from '../types';

// Helper functions to convert between database and app formats
const dbTransactionToApp = (dbTransaction: any): ProjectTransaction => ({
    id: dbTransaction.id,
    projectId: dbTransaction.project_id,
    type: dbTransaction.type,
    amount: Number(dbTransaction.amount),
    description: dbTransaction.description,
    transactionDate: dbTransaction.transaction_date,
    paymentDate: dbTransaction.payment_date || undefined,
    status: dbTransaction.status || (dbTransaction.type === 'income' ? 'pending' : 'pending'), // Default 'pending' for both income and expense
    recipientId: dbTransaction.recipient_id,
    recipient: dbTransaction.employees ? dbEmployeeToApp(dbTransaction.employees) : undefined,
    receiptImageUrl: dbTransaction.receipt_image_url,
    createdAt: dbTransaction.created_at
});

const dbProjectToApp = (dbProject: any): Project => ({
    id: dbProject.id,
    name: dbProject.name,
    description: dbProject.description,
    color: dbProject.color,
    price: dbProject.price ? Number(dbProject.price) : undefined,
    createdAt: dbProject.created_at,
    transactions: dbProject.project_transactions?.map(dbTransactionToApp) || [],
});

const dbEmployeeToApp = (dbEmp: any): Employee => ({
    id: dbEmp.id,
    fullName: dbEmp.full_name,
    department: dbEmp.department,
    position: dbEmp.position,
    avatarUrl: dbEmp.avatar_url,
    qrCodeUrl: dbEmp.qr_code_url,
    email: dbEmp.email,
    password: dbEmp.password
});

const dbSubtaskToApp = (dbSubtask: any): Subtask => {
    // Map sessions - luôn trả về mảng (có thể rỗng) thay vì undefined
    const sessions = dbSubtask.subtask_work_sessions?.map((s: any) => ({
        id: s.id,
        subtaskId: s.subtask_id,
        startedAt: s.started_at,
        endedAt: s.ended_at
    })) || [];
    
    // Debug log để kiểm tra
    if (dbSubtask.subtask_work_sessions) {
        console.log('📦 dbSubtaskToApp - Raw sessions from DB:', {
            subtaskId: dbSubtask.id,
            rawSessions: dbSubtask.subtask_work_sessions,
            mappedSessions: sessions
        });
    }
    
    return {
        id: dbSubtask.id,
        taskId: dbSubtask.task_id,
        title: dbSubtask.title,
        isCompleted: dbSubtask.is_completed,
        completedAt: dbSubtask.completed_at,
        createdAt: dbSubtask.created_at,
        sessions: sessions, // Luôn trả về mảng, không phải undefined
        assigneeId: dbSubtask.assignee_id || undefined,
        assignee: dbSubtask.employees ? dbEmployeeToApp(dbSubtask.employees) : undefined,
        price: dbSubtask.price ? Number(dbSubtask.price) : undefined
    };
};

const dbTaskAssigneeToApp = (dbAssignee: any): TaskAssignee => ({
    id: dbAssignee.id,
    taskId: dbAssignee.task_id,
    employeeId: dbAssignee.employee_id,
    employee: dbAssignee.employees ? dbEmployeeToApp(dbAssignee.employees) : undefined,
    commission: parseFloat(dbAssignee.commission || 0),
    createdAt: dbAssignee.created_at
});

const dbPaymentToApp = (dbPayment: any): TaskPayment => ({
    id: dbPayment.id,
    taskId: dbPayment.task_id,
    amount: Number(dbPayment.amount),
    paymentDate: dbPayment.payment_date,
    paymentMethod: dbPayment.payment_method,
    note: dbPayment.note,
    createdAt: dbPayment.created_at
});

const dbTaskToApp = (dbTask: any): Task => ({
    id: dbTask.id,
    projectId: dbTask.project_id,
    title: dbTask.title,
    description: dbTask.description,
    deadline: dbTask.deadline,
    isCompleted: dbTask.is_completed,
    startedAt: dbTask.started_at,
    sessions: dbTask.work_sessions?.map((s: any) => ({
        id: s.id,
        taskId: s.task_id,
        startedAt: s.started_at,
        endedAt: s.ended_at
    })),
    subtasks: dbTask.subtasks?.map(dbSubtaskToApp),
    completedAt: dbTask.completed_at,
    hoursWorked: dbTask.hours_worked,
    taskType: dbTask.task_type,
    assigneeId: dbTask.assignee_id,
    assignee: dbTask.employees ? dbEmployeeToApp(dbTask.employees) : undefined,
    assignees: dbTask.task_assignees?.map(dbTaskAssigneeToApp) || [],
    priority: dbTask.priority,
    price: dbTask.price ? Number(dbTask.price) : undefined,
    payments: dbTask.task_payments?.map(dbPaymentToApp) || [],
    createdAt: dbTask.created_at
});

// ============ PROJECT OPERATIONS ============

export const projectService = {
    // Get all projects (without transactions for faster loading)
    async getAll(): Promise<Project[]> {
        if (!isSupabaseConfigured()) {
            throw new Error(getErrorMessage({ message: 'Supabase not configured' }));
        }
        
        // Load projects without transactions first for faster initial load
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching projects:', error);
            // Normalize network/DNS errors so App can show a friendly message
            if (isNetworkError(error)) {
                throw new Error(getErrorMessage(error));
            }
            throw error;
        }

        // Return projects without transactions (transactions can be loaded separately when needed)
        return data?.map((p: any) => ({
            id: p.id,
            name: p.name,
            description: p.description,
            color: p.color,
            price: p.price ? Number(p.price) : undefined,
            createdAt: p.created_at,
            transactions: [] // Empty initially, load separately if needed
        })) || [];
    },

    // Get all projects with transactions (slower, use when transactions are needed)
    async getAllWithTransactions(): Promise<Project[]> {
        if (!isSupabaseConfigured()) {
            throw new Error(getErrorMessage({ message: 'Supabase not configured' }));
        }
        
        const { data, error } = await supabase
            .from('projects')
            .select('*, project_transactions(*, employees(*))')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching projects:', error);
            if (isNetworkError(error)) {
                throw new Error(getErrorMessage(error));
            }
            throw error;
        }

        return data?.map(dbProjectToApp) || [];
    },

    // Get single project by ID (with transactions)
    async getById(id: string): Promise<Project | null> {
        const { data, error } = await supabase
            .from('projects')
            .select('*, project_transactions(*, employees(*))')
            .eq('id', id)
            .single();

        if (error) {
            console.error('Error fetching project:', error);
            return null;
        }

        return data ? dbProjectToApp(data) : null;
    },

    // Load transactions for a project (lazy load)
    async loadProjectTransactions(projectId: string): Promise<ProjectTransaction[]> {
        return projectTransactionService.getByProjectId(projectId);
    },

    // Create new project
    async create(project: Omit<Project, 'id' | 'createdAt'>): Promise<Project> {
        const { data, error } = await supabase
            .from('projects')
            .insert({
                name: project.name,
                description: project.description,
                color: project.color,
                price: project.price || null,
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating project:', error);
            throw error;
        }

        return dbProjectToApp(data);
    },

    // Update project
    async update(id: string, updates: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<Project> {
        const dbUpdates: any = {};
        if (updates.name !== undefined) dbUpdates.name = updates.name;
        if (updates.description !== undefined) dbUpdates.description = updates.description;
        if (updates.color !== undefined) dbUpdates.color = updates.color;
        if (updates.price !== undefined) dbUpdates.price = updates.price || null;

        const { data, error } = await supabase
            .from('projects')
            .update(dbUpdates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating project:', error);
            throw error;
        }

        return dbProjectToApp(data);
    },

    // Delete project
    async delete(id: string): Promise<void> {
        const { error } = await supabase
            .from('projects')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting project:', error);
            throw error;
        }
    },
};

// ============ TASK OPERATIONS ============

export const taskService = {
    // Get all tasks (basic - fast loading, without subtasks and sessions)
    async getAllBasic(): Promise<Task[]> {
        try {
            // Load only essential fields for fast initial load - NO subtasks, NO sessions
            const { data, error } = await supabase
                .from('tasks')
                .select('id, project_id, title, description, deadline, is_completed, completed_at, hours_worked, priority, task_type, assignee_id, price, created_at, started_at')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('❌ Error fetching basic tasks:', error);
                return [];
            }

            // Map to Task format without subtasks/sessions
            return data?.map((t: any) => ({
                id: t.id,
                projectId: t.project_id,
                title: t.title,
                description: t.description,
                deadline: t.deadline,
                isCompleted: t.is_completed,
                completedAt: t.completed_at,
                hoursWorked: t.hours_worked,
                priority: t.priority,
                taskType: t.task_type,
                assigneeId: t.assignee_id,
                price: t.price ? Number(t.price) : undefined,
                createdAt: t.created_at,
                startedAt: t.started_at,
                subtasks: [], // Empty - load when needed
                sessions: [], // Empty - load when needed
                assignees: [],
                payments: []
            })) || [];
        } catch (error: any) {
            console.error('❌ Failed to load basic tasks:', error);
            return [];
        }
    },

    // Get all tasks (full - with subtasks and sessions, slower)
    async getAll(): Promise<Task[]> {
        try {
            // Try fetching with all relations (including employees/assignees, task_assignees with commission, and subtasks with sessions and employees)
            let { data, error } = await supabase
                .from('tasks')
                .select('*, work_sessions(*), employees(*), task_assignees(*, employees(*)), subtasks(*, subtask_work_sessions(*), employees(*))')
                .order('created_at', { ascending: false });

            // Fallback: If relationship fails (e.g., migration not run), fetch without employees
            if (error) {
                console.warn('⚠️ Fetching tasks with assignees failed. Retrying without assignees...', error.message);
                const retry = await supabase
                    .from('tasks')
                    .select('*, work_sessions(*), subtasks(*, subtask_work_sessions(*), employees(*))')
                    .order('created_at', { ascending: false });

                data = retry.data;
                error = retry.error;
            }

            // Final fallback: fetch without any relations
            if (error) {
                console.warn('⚠️ Fetching tasks with work_sessions failed. Retrying with basic fields...', error.message);
                const basicRetry = await supabase
                    .from('tasks')
                    .select('*, subtasks(*, subtask_work_sessions(*), employees(*))')
                    .order('created_at', { ascending: false });

                if (basicRetry.error) {
                    console.error('❌ Error fetching tasks:', basicRetry.error);
                    throw basicRetry.error;
                }
                data = basicRetry.data;
                error = null;
            }

            if (error) {
                console.error('Error fetching tasks:', error);
                throw error;
            }

            return data?.map(dbTaskToApp) || [];
        } catch (error: any) {
            console.error('❌ Failed to load tasks:', error);
            // Return empty array instead of throwing to allow app to continue
            return [];
        }
    },

    // Get tasks by project ID
    async getByProjectId(projectId: string): Promise<Task[]> {
        const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('project_id', projectId)
            .order('deadline', { ascending: true });

        if (error) {
            console.error('Error fetching tasks by project:', error);
            throw error;
        }

        return data?.map(dbTaskToApp) || [];
    },

    // Get single task by ID
    async getById(id: string): Promise<Task | null> {
        let { data, error } = await supabase
            .from('tasks')
            .select('*, work_sessions(*), employees(*), task_assignees(*, employees(*)), subtasks(*, subtask_work_sessions(*), employees(*)), task_payments(*)')
            .eq('id', id)
            .single();

        if (error) {
            // Fallback attempt without employees
            const retry = await supabase
                .from('tasks')
                .select('*, work_sessions(*), subtasks(*, subtask_work_sessions(*), employees(*))')
                .eq('id', id)
                .single();

            if (!retry.error) {
                data = retry.data;
                error = null;
            } else {
                // Final fallback without work_sessions
                const finalRetry = await supabase
                    .from('tasks')
                    .select('*, subtasks(*, subtask_work_sessions(*), employees(*))')
                    .eq('id', id)
                    .single();

                if (!finalRetry.error) {
                    data = finalRetry.data;
                    error = null;
                } else {
                    console.error('Error fetching task:', error);
                    return null;
                }
            }
        }

        return data ? dbTaskToApp(data) : null;
    },

    // Create new task
    async create(task: Omit<Task, 'id'>): Promise<Task> {
        // Convert empty strings to null for optional fields
        const insertData: any = {
            project_id: task.projectId,
            title: task.title,
            description: task.description && task.description.trim() ? task.description : null,
            deadline: task.deadline,
            is_completed: task.isCompleted || false,
            started_at: task.startedAt || null,
            completed_at: task.completedAt || null,
            hours_worked: task.hoursWorked || null,
            priority: task.priority || 'Medium',
            task_type: task.taskType && task.taskType.trim() ? task.taskType : null,
            assignee_id: task.assigneeId && task.assigneeId.trim() ? task.assigneeId : null,
            price: task.price || null
        };

        return retryWithBackoff(async () => {
            const { data, error } = await supabase
                .from('tasks')
                .insert(insertData)
                .select()
                .single();

            if (error) {
                console.error('Error creating task:', error);
                console.error('Error details:', {
                    message: error.message,
                    details: error.details,
                    hint: error.hint,
                    code: error.code,
                    insertData
                });
                
                // Normalize network errors
                if (isNetworkError(error)) {
                    throw new Error(getErrorMessage(error));
                }
                throw error;
            }

            const createdTask = dbTaskToApp(data);

            // Create task_assignees if provided
            if (task.assignees && task.assignees.length > 0) {
                await this.setTaskAssignees(createdTask.id, task.assignees);
                // Reload task with assignees
                return this.getById(createdTask.id) as Promise<Task>;
            }

            return createdTask;
        });
    },

    // Update task
    async update(id: string, updates: Partial<Omit<Task, 'id'>>): Promise<Task> {
        const dbUpdates: any = {};
        if (updates.projectId !== undefined) dbUpdates.project_id = updates.projectId;
        if (updates.title !== undefined) dbUpdates.title = updates.title;
        // Convert empty strings to null for optional fields
        if (updates.description !== undefined) {
            dbUpdates.description = updates.description && updates.description.trim() ? updates.description : null;
        }
        if (updates.deadline !== undefined) dbUpdates.deadline = updates.deadline;
        if (updates.isCompleted !== undefined) dbUpdates.is_completed = updates.isCompleted;
        if (updates.startedAt !== undefined) dbUpdates.started_at = updates.startedAt;
        if (updates.completedAt !== undefined) dbUpdates.completed_at = updates.completedAt;
        if (updates.hoursWorked !== undefined) dbUpdates.hours_worked = updates.hoursWorked;
        if (updates.priority !== undefined) dbUpdates.priority = updates.priority;
        // Convert empty strings to null for optional fields
        if (updates.taskType !== undefined) {
            dbUpdates.task_type = updates.taskType && updates.taskType.trim() ? updates.taskType : null;
        }
        if (updates.assigneeId !== undefined) {
            dbUpdates.assignee_id = updates.assigneeId && updates.assigneeId.trim() ? updates.assigneeId : null;
        }
        if (updates.price !== undefined) dbUpdates.price = updates.price || null;

        const { data, error } = await supabase
            .from('tasks')
            .update(dbUpdates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating task:', error);
            console.error('Error details:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code,
                dbUpdates
            });
            throw error;
        }

        // Update task_assignees if provided
        if (updates.assignees !== undefined) {
            await this.setTaskAssignees(id, updates.assignees);
            // Reload task with assignees
            return this.getById(id) as Promise<Task>;
        }

        return dbTaskToApp(data);
    },

    // Toggle task completion
    async toggleComplete(id: string): Promise<Task> {
        const task = await this.getById(id);
        if (!task) {
            throw new Error('Task not found');
        }

        const isNowCompleted = !task.isCompleted;
        return this.update(id, {
            isCompleted: isNowCompleted,
            completedAt: isNowCompleted ? new Date().toISOString() : null,
        });
    },

    // Start task session
    async startSession(taskId: string): Promise<void> {
        const { error } = await supabase
            .from('work_sessions')
            .insert({
                task_id: taskId,
                started_at: new Date().toISOString()
            });

        if (error) {
            console.error('Error starting session:', error);
            throw error;
        }

        // Also update legacy started_at if it's the first time
        await this.update(taskId, { startedAt: new Date().toISOString() });
    },

    // Pause task session (stop current session)
    async pauseSession(taskId: string): Promise<void> {
        // Find active session
        const { data: activeSessions, error: fetchError } = await supabase
            .from('work_sessions')
            .select('*')
            .eq('task_id', taskId)
            .is('ended_at', null);

        if (fetchError) {
            console.error('Error fetching active sessions:', fetchError);
            throw fetchError;
        }

        if (activeSessions && activeSessions.length > 0) {
            const { error: updateError } = await supabase
                .from('work_sessions')
                .update({ ended_at: new Date().toISOString() })
                .eq('id', activeSessions[0].id);

            if (updateError) {
                console.error('Error updating session:', updateError);
                throw updateError;
            }

            // Clear legacy started_at to indicate task is paused
            await this.update(taskId, { startedAt: null } as any);
        } else {
            // No active session found, but task might have started_at set (legacy)
            // Just clear the started_at field
            await this.update(taskId, { startedAt: null } as any);
        }
    },

    // Legacy start (kept but redirecting logically)
    async start(id: string): Promise<Task> {
        await this.startSession(id);
        return this.getById(id) as Promise<Task>;
    },

    // Complete task with hours worked
    async completeWithHours(id: string, hoursWorked: number): Promise<Task> {
        // Trước khi hoàn thành, đảm bảo tất cả sessions đều đã được kết thúc
        const { data: activeSessions } = await supabase
            .from('work_sessions')
            .select('*')
            .eq('task_id', id)
            .is('ended_at', null);

        if (activeSessions && activeSessions.length > 0) {
            // Kết thúc tất cả sessions đang chạy
            await supabase
                .from('work_sessions')
                .update({ ended_at: new Date().toISOString() })
                .eq('task_id', id)
                .is('ended_at', null);
        }

        // Cập nhật task: đánh dấu hoàn thành và lưu tổng giờ làm việc
        return this.update(id, {
            isCompleted: true,
            completedAt: new Date().toISOString(),
            hoursWorked: hoursWorked,
            startedAt: null, // Clear legacy started_at
        });
    },

    // Delete task
    async delete(id: string): Promise<void> {
        const { error } = await supabase
            .from('tasks')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting task:', error);
            throw error;
        }
    },

    // Get tasks by completion status
    async getByStatus(isCompleted: boolean): Promise<Task[]> {
        const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('is_completed', isCompleted)
            .order('deadline', { ascending: true });

        if (error) {
            console.error('Error fetching tasks by status:', error);
            throw error;
        }

        return data?.map(dbTaskToApp) || [];
    },

    // Get overdue tasks
    async getOverdue(): Promise<Task[]> {
        const now = new Date().toISOString();
        const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('is_completed', false)
            .lt('deadline', now)
            .order('deadline', { ascending: true });

        if (error) {
            console.error('Error fetching overdue tasks:', error);
            throw error;
        }

        return data?.map(dbTaskToApp) || [];
    },

    // Set task assignees (replace all existing assignees)
    async setTaskAssignees(taskId: string, assignees: Omit<TaskAssignee, 'id' | 'taskId' | 'createdAt'>[]): Promise<void> {
        // Delete existing assignees
        await supabase
            .from('task_assignees')
            .delete()
            .eq('task_id', taskId);

        // Insert new assignees
        if (assignees.length > 0) {
            const { error } = await supabase
                .from('task_assignees')
                .insert(assignees.map(a => ({
                    task_id: taskId,
                    employee_id: a.employeeId,
                    commission: a.commission || 0
                })));

            if (error) {
                console.error('Error setting task assignees:', error);
                throw error;
            }
        }
    },

    // Get total commission for an employee
    async getEmployeeTotalCommission(employeeId: string): Promise<number> {
        const { data, error } = await supabase
            .from('task_assignees')
            .select('commission')
            .eq('employee_id', employeeId);

        if (error) {
            console.error('Error fetching employee commission:', error);
            return 0;
        }

        return data?.reduce((sum, item) => sum + parseFloat(item.commission || 0), 0) || 0;
    },
};

// ============ REALTIME SUBSCRIPTIONS (Optional) ============

export const subscribeToProjects = (callback: (payload: any) => void) => {
    return supabase
        .channel('projects-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, callback)
        .subscribe();
};

export const subscribeToTasks = (callback: (payload: any) => void) => {
    return supabase
        .channel('tasks-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, callback)
        .subscribe();
};

// Employee Helper
const dbEmployeeToApp_OLD = (dbEmp: any): Employee => ({
    id: dbEmp.id,
    fullName: dbEmp.full_name,
    department: dbEmp.department,
    position: dbEmp.position,
    avatarUrl: dbEmp.avatar_url,
    qrCodeUrl: dbEmp.qr_code_url
});

export const employeeService = {
    async getAll(): Promise<Employee[]> {
        const { data, error } = await supabase
            .from('employees')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching employees:', error);
            throw error;
        }

        // Load total commission for each employee
        const employees = await Promise.all(
            data.map(async (emp) => {
                const employee = dbEmployeeToApp(emp);
                employee.totalCommission = await taskService.getEmployeeTotalCommission(emp.id);
                return employee;
            })
        );

        return employees;
    },

    async create(employee: Omit<Employee, 'id'>): Promise<Employee> {
        const { data, error } = await supabase
            .from('employees')
            .insert({
                full_name: employee.fullName,
                department: employee.department,
                position: employee.position,
                avatar_url: employee.avatarUrl,
                qr_code_url: employee.qrCodeUrl,
                email: employee.email,
                password: employee.password
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating employee:', error);
            throw error;
        }

        return dbEmployeeToApp(data);
    },

    async update(id: string, updates: Partial<Employee>): Promise<Employee> {
        const dbUpdates: any = {};
        if (updates.fullName !== undefined) dbUpdates.full_name = updates.fullName;
        // Convert empty strings to null for optional fields
        if (updates.department !== undefined) {
            dbUpdates.department = updates.department && updates.department.trim() ? updates.department : null;
        }
        if (updates.position !== undefined) {
            dbUpdates.position = updates.position && updates.position.trim() ? updates.position : null;
        }
        if (updates.avatarUrl !== undefined) {
            dbUpdates.avatar_url = updates.avatarUrl && updates.avatarUrl.trim() ? updates.avatarUrl : null;
        }
        if (updates.qrCodeUrl !== undefined) {
            dbUpdates.qr_code_url = updates.qrCodeUrl && updates.qrCodeUrl.trim() ? updates.qrCodeUrl : null;
        }
        if (updates.email !== undefined) {
            dbUpdates.email = updates.email && updates.email.trim() ? updates.email : null;
        }
        if (updates.password !== undefined) {
            dbUpdates.password = updates.password && updates.password.trim() ? updates.password : null;
        }

        const { data, error } = await supabase
            .from('employees')
            .update(dbUpdates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating employee:', error);
            console.error('Error details:', {
                message: error.message,
                details: error.details,
                hint: error.hint,
                code: error.code,
                dbUpdates
            });
            throw error;
        }

        return dbEmployeeToApp(data);
    },

    async delete(id: string): Promise<void> {
        const { error } = await supabase
            .from('employees')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting employee:', error);
            throw error;
        }
    }
};

export const taskTypeService = {
    async getAll(): Promise<TaskType[]> {
        const { data, error } = await supabase
            .from('task_types')
            .select('*')
            .order('name', { ascending: true });

        if (error) {
            console.error('Error fetching task types:', error);
            throw error;
        }
        return data || [];
    },

    async create(name: string): Promise<TaskType> {
        const { data, error } = await supabase
            .from('task_types')
            .insert({ name })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async delete(id: string): Promise<void> {
        const { error } = await supabase
            .from('task_types')
            .delete()
            .eq('id', id);
        if (error) throw error;
    }
};

// ============ SUBTASK OPERATIONS ============

export const subtaskService = {
    // Get all subtasks for a task (with work sessions, assignee, and price)
    async getByTaskId(taskId: string): Promise<Subtask[]> {
        const { data, error } = await supabase
            .from('subtasks')
            .select(`
                *,
                subtask_work_sessions (*),
                employees (*)
            `)
            .eq('task_id', taskId)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching subtasks:', error);
            throw error;
        }

        return data?.map(dbSubtaskToApp) || [];
    },

    // Create new subtask
    async create(taskId: string, title: string, assigneeId?: string, price?: number): Promise<Subtask> {
        const { data, error } = await supabase
            .from('subtasks')
            .insert({
                task_id: taskId,
                title: title,
                is_completed: false,
                assignee_id: assigneeId || null,
                price: price || null
            })
            .select('*, employees(*)')
            .single();

        if (error) {
            console.error('Error creating subtask:', error);
            throw error;
        }

        return dbSubtaskToApp(data);
    },

    // Toggle subtask completion
    async toggleComplete(id: string): Promise<Subtask> {
        return retryWithBackoff(async () => {
            // Get current state with sessions
            const { data: current, error: fetchError } = await supabase
                .from('subtasks')
                .select('*, subtask_work_sessions(*)')
                .eq('id', id)
                .single();

            if (fetchError) {
                console.error('Error fetching subtask:', fetchError);
                if (isNetworkError(fetchError)) {
                    throw new Error(getErrorMessage(fetchError));
                }
                throw fetchError;
            }

            const willBeCompleted = !current.is_completed;

            // Nếu đang hoàn thành subtask và có session đang chạy, pause nó
            if (willBeCompleted && current.subtask_work_sessions) {
                const activeSessions = current.subtask_work_sessions.filter((s: any) => s.started_at && !s.ended_at);
                if (activeSessions.length > 0) {
                    // Pause tất cả sessions đang chạy
                    await supabase
                        .from('subtask_work_sessions')
                        .update({ ended_at: new Date().toISOString() })
                        .eq('subtask_id', id)
                        .is('ended_at', null);
                }
            }

            // Toggle completion
            const { data, error } = await supabase
                .from('subtasks')
                .update({
                    is_completed: willBeCompleted
                })
                .eq('id', id)
                .select('*, subtask_work_sessions(*), employees(*)')
                .single();

            if (error) {
                console.error('Error updating subtask:', error);
                if (isNetworkError(error)) {
                    throw new Error(getErrorMessage(error));
                }
                throw error;
            }

            return dbSubtaskToApp(data);
        });
    },

    // Delete subtask
    async delete(id: string): Promise<void> {
        const { error } = await supabase
            .from('subtasks')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting subtask:', error);
            throw error;
        }
    },

    // Update subtask
    async update(id: string, updates: { title?: string; assigneeId?: string; price?: number }): Promise<Subtask> {
        return retryWithBackoff(async () => {
            const dbUpdates: any = {};
            if (updates.title !== undefined) dbUpdates.title = updates.title;
            if (updates.assigneeId !== undefined) dbUpdates.assignee_id = updates.assigneeId || null;
            if (updates.price !== undefined) dbUpdates.price = updates.price || null;

            const { data, error } = await supabase
                .from('subtasks')
                .update(dbUpdates)
                .eq('id', id)
                .select(`
                    *,
                    subtask_work_sessions (*),
                    employees (*)
                `)
                .single();

            if (error) {
                console.error('Error updating subtask:', error);
                if (isNetworkError(error)) {
                    throw new Error(getErrorMessage(error));
                }
                throw error;
            }

            return dbSubtaskToApp(data);
        });
    },

    // Start work session for subtask
    async startSession(subtaskId: string): Promise<Subtask> {
        return retryWithBackoff(async () => {
            // Create new session
            const { error: sessionError } = await supabase
                .from('subtask_work_sessions')
                .insert({
                    subtask_id: subtaskId,
                    started_at: new Date().toISOString()
                });

            if (sessionError) {
                console.error('Error starting subtask session:', sessionError);
                if (isNetworkError(sessionError)) {
                    throw new Error(getErrorMessage(sessionError));
                }
                throw sessionError;
            }

            // Get updated subtask with sessions
            const { data, error } = await supabase
                .from('subtasks')
                .select(`
                    *,
                    subtask_work_sessions (*),
                    employees (*)
                `)
                .eq('id', subtaskId)
                .single();

            if (error) {
                console.error('Error fetching subtask:', error);
                if (isNetworkError(error)) {
                    throw new Error(getErrorMessage(error));
                }
                throw error;
            }

            return dbSubtaskToApp(data);
        });
    },

    // Pause work session for subtask
    async pauseSession(subtaskId: string): Promise<Subtask> {
        return retryWithBackoff(async () => {
            // Find active session (no ended_at)
            const { data: activeSession, error: findError } = await supabase
                .from('subtask_work_sessions')
                .select('*')
                .eq('subtask_id', subtaskId)
                .is('ended_at', null)
                .order('started_at', { ascending: false })
                .limit(1)
                .single();

            if (findError && findError.code !== 'PGRST116') { // PGRST116 = no rows returned
                console.error('Error finding active session:', findError);
                if (isNetworkError(findError)) {
                    throw new Error(getErrorMessage(findError));
                }
                throw findError;
            }

            if (activeSession) {
                // End the active session
                const { error: updateError } = await supabase
                    .from('subtask_work_sessions')
                    .update({ ended_at: new Date().toISOString() })
                    .eq('id', activeSession.id);

                if (updateError) {
                    console.error('Error pausing subtask session:', updateError);
                    if (isNetworkError(updateError)) {
                        throw new Error(getErrorMessage(updateError));
                    }
                    throw updateError;
                }
            }

            // Get updated subtask with sessions
            const { data, error } = await supabase
                .from('subtasks')
                .select(`
                    *,
                    subtask_work_sessions (*),
                    employees (*)
                `)
                .eq('id', subtaskId)
                .single();

            if (error) {
                console.error('Error fetching subtask:', error);
                if (isNetworkError(error)) {
                    throw new Error(getErrorMessage(error));
                }
                throw error;
            }

            return dbSubtaskToApp(data);
        });
    },

    // Get subtask by ID with sessions
    async getById(id: string): Promise<Subtask | null> {
        const { data, error } = await supabase
            .from('subtasks')
            .select(`
                *,
                subtask_work_sessions (*),
                employees (*)
            `)
            .eq('id', id)
            .single();

        if (error) {
            console.error('Error fetching subtask:', error);
            return null;
        }

        return data ? dbSubtaskToApp(data) : null;
    }
};

// ============ PAYMENT OPERATIONS ============

export const paymentService = {
    // Create a payment record
    async create(taskId: string, payment: Omit<TaskPayment, 'id' | 'taskId' | 'createdAt'>): Promise<TaskPayment> {
        const { data, error } = await supabase
            .from('task_payments')
            .insert({
                task_id: taskId,
                amount: payment.amount,
                payment_date: payment.paymentDate || new Date().toISOString(),
                payment_method: payment.paymentMethod || null,
                note: payment.note && payment.note.trim() ? payment.note : null
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating payment:', error);
            throw error;
        }

        return dbPaymentToApp(data);
    },

    // Get all payments for a task
    async getByTaskId(taskId: string): Promise<TaskPayment[]> {
        const { data, error } = await supabase
            .from('task_payments')
            .select('*')
            .eq('task_id', taskId)
            .order('payment_date', { ascending: false });

        if (error) {
            console.error('Error fetching payments:', error);
            throw error;
        }

        return data?.map(dbPaymentToApp) || [];
    },

    // Delete a payment
    async delete(id: string): Promise<void> {
        const { error } = await supabase
            .from('task_payments')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting payment:', error);
            throw error;
        }
    }
};

// ============ PROJECT TRANSACTION OPERATIONS ============

export const projectTransactionService = {
    // Create a transaction (income or expense)
    async create(projectId: string, transaction: Omit<ProjectTransaction, 'id' | 'projectId' | 'createdAt'>): Promise<ProjectTransaction> {
        const { data, error } = await supabase
            .from('project_transactions')
            .insert({
                project_id: projectId,
                type: transaction.type,
                amount: transaction.amount,
                description: transaction.description && transaction.description.trim() ? transaction.description : null,
                transaction_date: transaction.transactionDate || new Date().toISOString(),
                payment_date: transaction.paymentDate || null,
                status: transaction.status || 'pending', // Default 'pending' for both income and expense
                recipient_id: transaction.recipientId || null,
                receipt_image_url: transaction.receiptImageUrl || null
            })
            .select('*, employees(*)')
            .single();

        if (error) {
            console.error('Error creating transaction:', error);
            throw error;
        }

        return dbTransactionToApp(data);
    },

    // Get all transactions for a project
    async getByProjectId(projectId: string): Promise<ProjectTransaction[]> {
        const { data, error } = await supabase
            .from('project_transactions')
            .select('*, employees(*)')
            .eq('project_id', projectId)
            .order('transaction_date', { ascending: false });

        if (error) {
            console.error('Error fetching transactions:', error);
            throw error;
        }

        return data?.map(dbTransactionToApp) || [];
    },

    // Update a transaction
    async update(id: string, updates: Partial<Omit<ProjectTransaction, 'id' | 'projectId' | 'createdAt'>>): Promise<ProjectTransaction> {
        const dbUpdates: any = {};
        if (updates.type !== undefined) dbUpdates.type = updates.type;
        if (updates.amount !== undefined) dbUpdates.amount = updates.amount;
        if (updates.description !== undefined) {
            dbUpdates.description = updates.description && updates.description.trim() ? updates.description : null;
        }
        if (updates.transactionDate !== undefined) dbUpdates.transaction_date = updates.transactionDate;
        if (updates.paymentDate !== undefined) dbUpdates.payment_date = updates.paymentDate || null;
        if (updates.status !== undefined) dbUpdates.status = updates.status;
        if (updates.recipientId !== undefined) dbUpdates.recipient_id = updates.recipientId || null;
        if (updates.receiptImageUrl !== undefined) dbUpdates.receipt_image_url = updates.receiptImageUrl || null;

        const { data, error } = await supabase
            .from('project_transactions')
            .update(dbUpdates)
            .eq('id', id)
            .select('*, employees(*)')
            .single();

        if (error) {
            console.error('Error updating transaction:', error);
            throw error;
        }

        return dbTransactionToApp(data);
    },

    // Delete a transaction
    async delete(id: string): Promise<void> {
        const { error } = await supabase
            .from('project_transactions')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting transaction:', error);
            throw error;
        }
    }
};

// ============ EMPLOYEE WORK SESSIONS OPERATIONS ============

const dbEmployeeWorkSessionToApp = (dbSession: any): EmployeeWorkSession => ({
    id: dbSession.id,
    employeeId: dbSession.employee_id,
    startedAt: dbSession.started_at,
    endedAt: dbSession.ended_at,
    createdAt: dbSession.created_at
});

export const employeeWorkSessionService = {
    // Start a work session for an employee
    async start(employeeId: string): Promise<EmployeeWorkSession> {
        const { data, error } = await supabase
            .from('employee_work_sessions')
            .insert({
                employee_id: employeeId,
                started_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            console.error('Error starting work session:', error);
            throw error;
        }

        return dbEmployeeWorkSessionToApp(data);
    },

    // Pause/End current active session
    async pause(employeeId: string): Promise<EmployeeWorkSession | null> {
        // Find active session (started but not ended)
        const { data: activeSession, error: findError } = await supabase
            .from('employee_work_sessions')
            .select('*')
            .eq('employee_id', employeeId)
            .is('ended_at', null)
            .order('started_at', { ascending: false })
            .limit(1)
            .single();

        if (findError || !activeSession) {
            console.error('No active session found:', findError);
            return null;
        }

        // End the session
        const { data, error } = await supabase
            .from('employee_work_sessions')
            .update({ ended_at: new Date().toISOString() })
            .eq('id', activeSession.id)
            .select()
            .single();

        if (error) {
            console.error('Error pausing work session:', error);
            throw error;
        }

        return dbEmployeeWorkSessionToApp(data);
    },

    // Get all sessions for an employee
    async getByEmployeeId(employeeId: string): Promise<EmployeeWorkSession[]> {
        const { data, error } = await supabase
            .from('employee_work_sessions')
            .select('*')
            .eq('employee_id', employeeId)
            .order('started_at', { ascending: false });

        if (error) {
            console.error('Error fetching work sessions:', error);
            throw error;
        }

        return data?.map(dbEmployeeWorkSessionToApp) || [];
    },

    // Get active session for an employee
    async getActiveSession(employeeId: string): Promise<EmployeeWorkSession | null> {
        const { data, error } = await supabase
            .from('employee_work_sessions')
            .select('*')
            .eq('employee_id', employeeId)
            .is('ended_at', null)
            .order('started_at', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No active session found
                return null;
            }
            console.error('Error fetching active session:', error);
            throw error;
        }

        return data ? dbEmployeeWorkSessionToApp(data) : null;
    },

    // Get sessions by date range
    async getByDateRange(employeeId: string, startDate: string, endDate: string): Promise<EmployeeWorkSession[]> {
        const { data, error } = await supabase
            .from('employee_work_sessions')
            .select('*')
            .eq('employee_id', employeeId)
            .gte('started_at', startDate)
            .lte('started_at', endDate)
            .order('started_at', { ascending: false });

        if (error) {
            console.error('Error fetching work sessions by date range:', error);
            throw error;
        }

        return data?.map(dbEmployeeWorkSessionToApp) || [];
    },

    // Get sessions for a specific date
    async getByDate(employeeId: string, date: string): Promise<EmployeeWorkSession[]> {
        // date format: YYYY-MM-DD
        const startOfDay = `${date}T00:00:00.000Z`;
        const endOfDay = `${date}T23:59:59.999Z`;

        return this.getByDateRange(employeeId, startOfDay, endOfDay);
    },

    // Delete a session
    async delete(id: string): Promise<void> {
        const { error } = await supabase
            .from('employee_work_sessions')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting work session:', error);
            throw error;
        }
    }
};
