import { Atendimento } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
const defaultFetchOptions: RequestInit = {
  credentials: 'include',
};
const csrfGuardHeaders = {
  'x-csrf-guard': '1',
};

function resolveApiUrl(url: string): string {
  const raw = String(url || '').trim();
  if (!raw) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${API_BASE_URL}${raw}`;
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: 'superadmin' | 'admin' | 'gestor' | 'operador';
  department: string;
  phone?: string | null;
  emailVerifiedAt?: string | null;
  createdAt: string;
}

export interface RegisterPayload {
  fullName: string;
  email: string;
  password: string;
  department: string;
  phone?: string;
  termsAccepted: boolean;
  privacyAccepted: boolean;
}

export interface RegisterResponse {
  user: AuthUser;
  message: string;
}

export interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  role: 'superadmin' | 'admin' | 'gestor' | 'operador';
  department: string;
  phone?: string | null;
  isActive: boolean;
  emailVerifiedAt?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
  failedLoginAttempts?: number;
  lockedUntil?: string | null;
  createdAt: string;
}

export interface CreateUserPayload {
  fullName: string;
  email: string;
  password: string;
  department: string;
  role: 'superadmin' | 'admin' | 'gestor' | 'operador';
  phone?: string;
}

export interface UpdateUserAccessPayload {
  role: 'superadmin' | 'admin' | 'gestor' | 'operador';
}

export interface UpdateUserPayload {
  fullName?: string;
  email?: string;
  department?: string;
  phone?: string;
  role?: 'superadmin' | 'admin' | 'gestor' | 'operador';
}

export type CatalogOptionType = 'departamento' | 'local' | 'atividade' | 'responsavel';

export interface CatalogOption {
  id: string;
  type: CatalogOptionType;
  value: string;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  fullName: string;
  email?: string;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  members: TeamMember[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  priority: 'baixa' | 'media' | 'alta';
  status: 'pendente' | 'em_andamento' | 'concluida' | 'atrasada';
  taskType: string;
  slaDays: number;
  slaStatus: 'no_prazo' | 'em_risco' | 'violado' | 'sem_sla';
  goalTarget: string;
  teamId?: string | null;
  teamName?: string | null;
  createdBy: string;
  createdByName?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  overdue: boolean;
  assignees: Array<{ id: string; fullName: string }>;
}

export interface TaskComment {
  id: string;
  taskId: string;
  userId?: string | null;
  userName: string;
  message: string;
  editedAt?: string | null;
  createdAt: string;
}

export interface TaskAttachment {
  id: string;
  taskId: string;
  userId?: string | null;
  userName: string;
  title: string;
  url: string;
  sourceType?: 'link' | 'arquivo';
  createdAt: string;
}

export interface TaskTimelineEvent {
  id: string;
  taskId: string;
  userId?: string | null;
  userName: string;
  eventType: string;
  message: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface TaskSlaProfile {
  type: string;
  slaDays: number;
  isActive: boolean;
}

export interface TaskTemplate {
  id: string;
  title: string;
  description: string;
  priority: 'baixa' | 'media' | 'alta';
  taskType: string;
  goalTarget: string;
  defaultDueDays: number;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  kind: string;
  relatedEntity?: string | null;
  relatedId?: string | null;
  readAt?: string | null;
  createdAt: string;
}

export interface SecretaryMetrics {
  summary: {
    total: number;
    pendentes: number;
    emAndamento: number;
    concluidas: number;
    atrasadas: number;
  };
  byUser: Array<{
    id: string;
    fullName: string;
    total: number;
    concluidas: number;
    atrasadas: number;
  }>;
  byTeamMonth?: Array<{
    teamId: string;
    teamName: string;
    total: number;
    concluidas: number;
    progresso: number;
  }>;
  ranking?: Array<{
    id: string;
    fullName: string;
    total: number;
    concluidas: number;
    noPrazo: number;
    score: number;
  }>;
  executivo?: {
    totalAtivas: number;
    totalConcluidasMes: number;
    taxaNoPrazo: number;
  };
}

async function parseResponseBody(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  const text = await response.text();
  return text ? { error: text } : {};
}

async function handleResponse<T>(response: Response): Promise<T> {
  const payload = await parseResponseBody(response);
  if (!response.ok) {
    const message = payload.error || `Erro HTTP ${response.status}`;
    throw new ApiError(message, response.status, payload.code);
  }
  return payload as T;
}

export const atendimentoService = {
  async getAll(): Promise<Atendimento[]> {
    const response = await fetch(`${API_BASE_URL}/api/atendimentos`, defaultFetchOptions);
    return handleResponse<Atendimento[]>(response);
  },

  async getById(id: string): Promise<Atendimento> {
    const response = await fetch(`${API_BASE_URL}/api/atendimentos/${id}`, defaultFetchOptions);
    return handleResponse<Atendimento>(response);
  },

  async create(atendimento: Omit<Atendimento, 'id' | 'createdAt'>): Promise<Atendimento> {
    const response = await fetch(`${API_BASE_URL}/api/atendimentos`, {
      ...defaultFetchOptions,
      method: 'POST',
      headers: {
        ...csrfGuardHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(atendimento),
    });

    const created = await handleResponse<Atendimento>(response);
    window.dispatchEvent(new Event('storage'));
    return created;
  },

  async update(id: string, atendimento: Omit<Atendimento, 'id' | 'createdAt'>): Promise<Atendimento> {
    const response = await fetch(`${API_BASE_URL}/api/atendimentos/${id}`, {
      ...defaultFetchOptions,
      method: 'PUT',
      headers: {
        ...csrfGuardHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(atendimento),
    });

    return handleResponse<Atendimento>(response);
  },

  async remove(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/atendimentos/${id}`, {
      ...defaultFetchOptions,
      method: 'DELETE',
      headers: csrfGuardHeaders,
    });

    if (!response.ok) {
      const payload = await parseResponseBody(response);
      throw new ApiError(payload.error || `Erro HTTP ${response.status}`, response.status, payload.code);
    }
  },
};

export const authService = {
  async me(): Promise<AuthUser> {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, defaultFetchOptions);
    const data = await handleResponse<{ user: AuthUser }>(response);
    return data.user;
  },

  async login(email: string, password: string, termsAccepted: boolean, privacyAccepted: boolean): Promise<AuthUser> {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      ...defaultFetchOptions,
      method: 'POST',
      headers: {
        ...csrfGuardHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, termsAccepted, privacyAccepted }),
    });
    const data = await handleResponse<{ user: AuthUser }>(response);
    return data.user;
  },

  async register(payload: RegisterPayload): Promise<RegisterResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      ...defaultFetchOptions,
      method: 'POST',
      headers: {
        ...csrfGuardHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    return handleResponse<RegisterResponse>(response);
  },

  async logout(): Promise<void> {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      ...defaultFetchOptions,
      method: 'POST',
      headers: csrfGuardHeaders,
    });
  },
};

export const userAdminService = {
  async list(): Promise<AdminUser[]> {
    const response = await fetch(`${API_BASE_URL}/api/users`, defaultFetchOptions);
    return handleResponse<AdminUser[]>(response);
  },

  async create(payload: CreateUserPayload): Promise<{ user: AdminUser; message: string }> {
    const response = await fetch(`${API_BASE_URL}/api/users`, {
      ...defaultFetchOptions,
      method: 'POST',
      headers: {
        ...csrfGuardHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return handleResponse<{ user: AdminUser; message: string }>(response);
  },

  async approve(userId: string): Promise<AdminUser> {
    const response = await fetch(`${API_BASE_URL}/api/users/${userId}/approve`, {
      ...defaultFetchOptions,
      method: 'PATCH',
      headers: csrfGuardHeaders,
    });
    return handleResponse<AdminUser>(response);
  },

  async deactivate(userId: string): Promise<AdminUser> {
    const response = await fetch(`${API_BASE_URL}/api/users/${userId}/deactivate`, {
      ...defaultFetchOptions,
      method: 'PATCH',
      headers: csrfGuardHeaders,
    });
    return handleResponse<AdminUser>(response);
  },

  async activate(userId: string): Promise<AdminUser> {
    const response = await fetch(`${API_BASE_URL}/api/users/${userId}/activate`, {
      ...defaultFetchOptions,
      method: 'PATCH',
      headers: csrfGuardHeaders,
    });
    return handleResponse<AdminUser>(response);
  },

  async unlock(userId: string): Promise<AdminUser> {
    const response = await fetch(`${API_BASE_URL}/api/users/${userId}/unlock`, {
      ...defaultFetchOptions,
      method: 'PATCH',
      headers: csrfGuardHeaders,
    });
    return handleResponse<AdminUser>(response);
  },

  async updateAccess(userId: string, payload: UpdateUserAccessPayload): Promise<AdminUser> {
    const response = await fetch(`${API_BASE_URL}/api/users/${userId}/access`, {
      ...defaultFetchOptions,
      method: 'PATCH',
      headers: {
        ...csrfGuardHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return handleResponse<AdminUser>(response);
  },

  async update(userId: string, payload: UpdateUserPayload): Promise<AdminUser> {
    const response = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
      ...defaultFetchOptions,
      method: 'PATCH',
      headers: {
        ...csrfGuardHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return handleResponse<AdminUser>(response);
  },

  async remove(userId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/users/${userId}`, {
      ...defaultFetchOptions,
      method: 'DELETE',
      headers: csrfGuardHeaders,
    });
    if (!response.ok) {
      const payload = await parseResponseBody(response);
      throw new ApiError(payload.error || `Erro HTTP ${response.status}`, response.status, payload.code);
    }
  },
};

export const catalogOptionsService = {
  async list(type?: CatalogOptionType): Promise<CatalogOption[]> {
    const query = type ? `?type=${encodeURIComponent(type)}` : '';
    const response = await fetch(`${API_BASE_URL}/api/options${query}`, defaultFetchOptions);
    return handleResponse<CatalogOption[]>(response);
  },

  async create(type: CatalogOptionType, value: string): Promise<CatalogOption> {
    const response = await fetch(`${API_BASE_URL}/api/options`, {
      ...defaultFetchOptions,
      method: 'POST',
      headers: {
        ...csrfGuardHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type, value }),
    });
    const created = await handleResponse<CatalogOption>(response);
    window.dispatchEvent(new Event('storage'));
    return created;
  },

  async update(optionId: string, value: string): Promise<CatalogOption> {
    const response = await fetch(`${API_BASE_URL}/api/options/${optionId}`, {
      ...defaultFetchOptions,
      method: 'PATCH',
      headers: {
        ...csrfGuardHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value }),
    });
    const updated = await handleResponse<CatalogOption>(response);
    window.dispatchEvent(new Event('storage'));
    return updated;
  },

  async remove(optionId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/options/${optionId}`, {
      ...defaultFetchOptions,
      method: 'DELETE',
      headers: csrfGuardHeaders,
    });
    if (!response.ok) {
      const payload = await parseResponseBody(response);
      throw new ApiError(payload.error || `Erro HTTP ${response.status}`, response.status, payload.code);
    }
    window.dispatchEvent(new Event('storage'));
  },
};

export const teamService = {
  async list(): Promise<Team[]> {
    const response = await fetch(`${API_BASE_URL}/api/teams`, defaultFetchOptions);
    return handleResponse<Team[]>(response);
  },

  async create(payload: { name: string; description?: string; memberIds: string[] }): Promise<{ id: string; name: string; description: string }> {
    const response = await fetch(`${API_BASE_URL}/api/teams`, {
      ...defaultFetchOptions,
      method: 'POST',
      headers: {
        ...csrfGuardHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return handleResponse<{ id: string; name: string; description: string }>(response);
  },

  async update(teamId: string, payload: { name: string; description?: string }): Promise<{ id: string; name: string; description: string }> {
    const response = await fetch(`${API_BASE_URL}/api/teams/${teamId}`, {
      ...defaultFetchOptions,
      method: 'PATCH',
      headers: {
        ...csrfGuardHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return handleResponse<{ id: string; name: string; description: string }>(response);
  },

  async remove(teamId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/teams/${teamId}`, {
      ...defaultFetchOptions,
      method: 'DELETE',
      headers: csrfGuardHeaders,
    });
    if (!response.ok) {
      const payload = await parseResponseBody(response);
      throw new ApiError(payload.error || `Erro HTTP ${response.status}`, response.status, payload.code);
    }
  },

  async updateMembers(teamId: string, memberIds: string[]): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/api/teams/${teamId}/members`, {
      ...defaultFetchOptions,
      method: 'PUT',
      headers: {
        ...csrfGuardHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ memberIds }),
    });
    if (!response.ok) {
      const payload = await parseResponseBody(response);
      throw new ApiError(payload.error || `Erro HTTP ${response.status}`, response.status, payload.code);
    }
  },

  async sendMessage(teamId: string, payload: { title?: string; message: string }): Promise<{ sent: number; team: string }> {
    const response = await fetch(`${API_BASE_URL}/api/teams/${teamId}/message`, {
      ...defaultFetchOptions,
      method: 'POST',
      headers: {
        ...csrfGuardHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return handleResponse<{ sent: number; team: string }>(response);
  },
};

export const taskService = {
  async list(): Promise<Task[]> {
    const response = await fetch(`${API_BASE_URL}/api/tasks`, defaultFetchOptions);
    return handleResponse<Task[]>(response);
  },

  async create(payload: {
    title: string;
    description?: string;
    dueDate: string;
    priority: 'baixa' | 'media' | 'alta';
    taskType?: string;
    goalTarget?: string;
    teamId?: string;
    assigneeIds?: string[];
  }): Promise<{ id: string }> {
    const response = await fetch(`${API_BASE_URL}/api/tasks`, {
      ...defaultFetchOptions,
      method: 'POST',
      headers: {
        ...csrfGuardHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return handleResponse<{ id: string }>(response);
  },

  async updateStatus(taskId: string, status: 'pendente' | 'em_andamento' | 'concluida' | 'atrasada'): Promise<{ id: string; status: string; completedAt?: string | null }> {
    const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/status`, {
      ...defaultFetchOptions,
      method: 'PATCH',
      headers: {
        ...csrfGuardHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });
    return handleResponse<{ id: string; status: string; completedAt?: string | null }>(response);
  },

  async updateDueDate(taskId: string, dueDate: string): Promise<{ id: string; dueDate: string }> {
    const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/due-date`, {
      ...defaultFetchOptions,
      method: 'PATCH',
      headers: {
        ...csrfGuardHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dueDate }),
    });
    return handleResponse<{ id: string; dueDate: string }>(response);
  },

  async listComments(taskId: string): Promise<TaskComment[]> {
    const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/comments`, defaultFetchOptions);
    return handleResponse<TaskComment[]>(response);
  },

  async addComment(taskId: string, message: string): Promise<{ ok: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/comments`, {
      ...defaultFetchOptions,
      method: 'POST',
      headers: {
        ...csrfGuardHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });
    return handleResponse<{ ok: boolean }>(response);
  },

  async updateComment(taskId: string, commentId: string, message: string): Promise<{ ok: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/comments/${commentId}`, {
      ...defaultFetchOptions,
      method: 'PATCH',
      headers: {
        ...csrfGuardHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });
    return handleResponse<{ ok: boolean }>(response);
  },

  async removeComment(taskId: string, commentId: string): Promise<{ ok: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/comments/${commentId}`, {
      ...defaultFetchOptions,
      method: 'DELETE',
      headers: csrfGuardHeaders,
    });
    return handleResponse<{ ok: boolean }>(response);
  },

  async listAttachments(taskId: string): Promise<TaskAttachment[]> {
    const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/attachments`, defaultFetchOptions);
    const attachments = await handleResponse<TaskAttachment[]>(response);
    return attachments.map((attachment) => ({ ...attachment, url: resolveApiUrl(attachment.url) }));
  },

  async addAttachment(taskId: string, payload: { title: string; url: string }): Promise<{ id: string }> {
    const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/attachments`, {
      ...defaultFetchOptions,
      method: 'POST',
      headers: {
        ...csrfGuardHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return handleResponse<{ id: string }>(response);
  },

  async uploadAttachment(taskId: string, file: File, title?: string): Promise<{ id: string; url: string }> {
    const formData = new FormData();
    formData.append('file', file);
    if (title) formData.append('title', title);
    const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/attachments/upload`, {
      ...defaultFetchOptions,
      method: 'POST',
      headers: csrfGuardHeaders,
      body: formData,
    });
    const payload = await handleResponse<{ id: string; url: string }>(response);
    return { ...payload, url: resolveApiUrl(payload.url) };
  },

  async setTyping(taskId: string, typing: boolean): Promise<{ ok: boolean }> {
    const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/typing`, {
      ...defaultFetchOptions,
      method: 'POST',
      headers: {
        ...csrfGuardHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ typing }),
    });
    return handleResponse<{ ok: boolean }>(response);
  },

  async pingPresence(taskId: string): Promise<{ online: Array<{ userId: string; userName: string }> }> {
    const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/presence/ping`, {
      ...defaultFetchOptions,
      method: 'POST',
      headers: csrfGuardHeaders,
    });
    return handleResponse<{ online: Array<{ userId: string; userName: string }> }>(response);
  },

  async listTimeline(taskId: string): Promise<TaskTimelineEvent[]> {
    const response = await fetch(`${API_BASE_URL}/api/tasks/${taskId}/timeline`, defaultFetchOptions);
    return handleResponse<TaskTimelineEvent[]>(response);
  },

  async listSlaProfiles(): Promise<TaskSlaProfile[]> {
    const response = await fetch(`${API_BASE_URL}/api/task-sla-profiles`, defaultFetchOptions);
    return handleResponse<TaskSlaProfile[]>(response);
  },

  async listTemplates(): Promise<TaskTemplate[]> {
    const response = await fetch(`${API_BASE_URL}/api/task-templates`, defaultFetchOptions);
    return handleResponse<TaskTemplate[]>(response);
  },

  async createTemplate(payload: {
    title: string;
    description?: string;
    priority: 'baixa' | 'media' | 'alta';
    taskType: string;
    goalTarget?: string;
    defaultDueDays: number;
  }): Promise<TaskTemplate> {
    const response = await fetch(`${API_BASE_URL}/api/task-templates`, {
      ...defaultFetchOptions,
      method: 'POST',
      headers: {
        ...csrfGuardHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return handleResponse<TaskTemplate>(response);
  },

  async secretaryMetrics(): Promise<SecretaryMetrics> {
    const response = await fetch(`${API_BASE_URL}/api/tasks-metrics/secretary`, defaultFetchOptions);
    return handleResponse<SecretaryMetrics>(response);
  },
};

export const notificationService = {
  async list(): Promise<NotificationItem[]> {
    const response = await fetch(`${API_BASE_URL}/api/notifications`, defaultFetchOptions);
    return handleResponse<NotificationItem[]>(response);
  },

  async broadcastToUsers(payload: { title?: string; message: string; userIds: string[] }): Promise<{ sent: number; recipients: string[] }> {
    const response = await fetch(`${API_BASE_URL}/api/notifications/broadcast`, {
      ...defaultFetchOptions,
      method: 'POST',
      headers: {
        ...csrfGuardHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    return handleResponse<{ sent: number; recipients: string[] }>(response);
  },

  async markRead(notificationId: string): Promise<{ id: string; readAt: string }> {
    const response = await fetch(`${API_BASE_URL}/api/notifications/${notificationId}/read`, {
      ...defaultFetchOptions,
      method: 'PATCH',
      headers: csrfGuardHeaders,
    });
    return handleResponse<{ id: string; readAt: string }>(response);
  },
};
