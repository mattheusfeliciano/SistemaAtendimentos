import React, { useEffect, useMemo, useState } from 'react';
import {
  FiAlertCircle,
  FiCalendar,
  FiCheckCircle,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiEdit2,
  FiGrid,
  FiMessageSquare,
  FiPlus,
  FiSave,
  FiTrash2,
} from 'react-icons/fi';
import {
  AuthUser,
  notificationService,
  NotificationItem,
  TaskAttachment,
  taskService,
  Task,
  TaskComment,
  TaskTimelineEvent,
} from '../services/api';
import AlertBanner from './ui/AlertBanner';
import ModalDialog from './ui/ModalDialog';

interface TasksPanelProps {
  darkMode: boolean;
  currentUser: AuthUser;
  isSecretaryUser?: boolean;
}

const statusLabel: Record<Task['status'], string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  atrasada: 'Atrasada',
  concluida: 'Concluída',
};

const statusTone: Record<Task['status'], string> = {
  pendente: 'bg-slate-100 text-slate-700 border-slate-200',
  em_andamento: 'bg-blue-100 text-blue-700 border-blue-200',
  atrasada: 'bg-red-100 text-red-700 border-red-200',
  concluida: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const weekDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];
const quickEmojis = ['🙂', '👍', '✅', '🚀', '⚠️', '👏'];

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function buildCalendarGrid(monthCursor: Date): Date[] {
  const start = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const offset = (start.getDay() + 6) % 7;
  const firstCell = new Date(start);
  firstCell.setDate(start.getDate() - offset);

  return Array.from({ length: 42 }, (_, index) => {
    const cell = new Date(firstCell);
    cell.setDate(firstCell.getDate() + index);
    return cell;
  });
}

const TasksPanel: React.FC<TasksPanelProps> = ({ darkMode, currentUser, isSecretaryUser = false }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'mine' | 'delegated'>('mine');
  const [taskBucket, setTaskBucket] = useState<'active' | 'completed'>('active');
  const [boardView, setBoardView] = useState<'calendar' | 'kanban'>('calendar');
  const [teamFilter, setTeamFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Task['status']>('all');
  const [dateFromFilter, setDateFromFilter] = useState('');
  const [dateToFilter, setDateToFilter] = useState('');
  const [monthCursor, setMonthCursor] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(dayKey(new Date()));
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [timeline, setTimeline] = useState<TaskTimelineEvent[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentInput, setEditingCommentInput] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [dueDateDrafts, setDueDateDrafts] = useState<Record<string, string>>({});
  const [isDayModalOpen, setIsDayModalOpen] = useState(false);
  const [dayNotes, setDayNotes] = useState<Record<string, string>>({});
  const [dayNoteInput, setDayNoteInput] = useState('');
  const [attachmentTitleInput, setAttachmentTitleInput] = useState('');
  const [attachmentUrlInput, setAttachmentUrlInput] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Array<{ userId: string; userName: string }>>([]);
  const [typingUsers, setTypingUsers] = useState<Array<{ userId: string; userName: string }>>([]);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ kind: 'success' | 'error' | 'warning' | 'info'; message: string } | null>(null);

  const canSeeDelegated = isSecretaryUser || currentUser.role === 'gestor' || currentUser.role === 'admin';

  const myTasks = useMemo(
    () => tasks.filter((task) => task.assignees.some((assignee) => assignee.id === currentUser.id)),
    [tasks, currentUser.id]
  );

  const delegatedTasks = useMemo(
    () => tasks.filter((task) => task.createdBy === currentUser.id && !task.assignees.some((assignee) => assignee.id === currentUser.id)),
    [tasks, currentUser.id]
  );

  const baseVisibleTasks = activeView === 'delegated' ? delegatedTasks : myTasks;

  const filteredByCriteria = useMemo(() => {
    return baseVisibleTasks.filter((task) => {
      const teamMatch = !teamFilter || (task.teamName || 'Sem equipe') === teamFilter;
      const statusMatch = statusFilter === 'all' || task.status === statusFilter;
      const fromMatch = !dateFromFilter || task.dueDate >= dateFromFilter;
      const toMatch = !dateToFilter || task.dueDate <= dateToFilter;
      return teamMatch && statusMatch && fromMatch && toMatch;
    });
  }, [baseVisibleTasks, teamFilter, statusFilter, dateFromFilter, dateToFilter]);

  const visibleTasks = useMemo(
    () =>
      filteredByCriteria.filter((task) =>
        taskBucket === 'completed' ? task.status === 'concluida' : task.status !== 'concluida'
      ),
    [filteredByCriteria, taskBucket]
  );

  const availableTeams = useMemo(
    () => Array.from(new Set(baseVisibleTasks.map((task) => task.teamName || 'Sem equipe'))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [baseVisibleTasks]
  );

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const task of visibleTasks) {
      const key = task.dueDate;
      const current = map.get(key) || [];
      current.push(task);
      map.set(key, current);
    }
    return map;
  }, [visibleTasks]);

  const selectedDayTasks = useMemo(() => tasksByDate.get(selectedDate) || [], [tasksByDate, selectedDate]);
  const unreadNotifications = useMemo(() => notifications.filter((item) => !item.readAt), [notifications]);

  const upcomingTasks = useMemo(
    () =>
      [...baseVisibleTasks]
        .filter((task) => task.status !== 'concluida')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .slice(0, 6),
    [baseVisibleTasks]
  );

  const overdueTasks = useMemo(() => baseVisibleTasks.filter((task) => task.overdue || task.status === 'atrasada'), [baseVisibleTasks]);
  const completedTasks = useMemo(() => baseVisibleTasks.filter((task) => task.status === 'concluida'), [baseVisibleTasks]);

  const today = dayKey(new Date());
  const todayCount = tasksByDate.get(today)?.length || 0;

  const thisWeekCount = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);

    return visibleTasks.filter((task) => {
      const due = new Date(`${task.dueDate}T00:00:00`);
      return due >= start && due <= end;
    }).length;
  }, [visibleTasks]);

  const calendarCells = useMemo(() => buildCalendarGrid(monthCursor), [monthCursor]);

  const loadData = async () => {
    try {
      const [taskData, notificationData] = await Promise.all([taskService.list(), notificationService.list()]);
      setTasks(taskData);
      setNotifications(notificationData);
      setDueDateDrafts((prev) => {
        const next = { ...prev };
        taskData.forEach((task) => {
          if (!next[task.id]) next[task.id] = task.dueDate;
        });
        return next;
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData().catch((error) => console.error('Erro ao carregar painel de atividades:', error));
  }, []);

  useEffect(() => {
    if (!canSeeDelegated && activeView === 'delegated') setActiveView('mine');
  }, [canSeeDelegated, activeView]);

  useEffect(() => {
    if (!alert) return;
    const timer = window.setTimeout(() => setAlert(null), 3500);
    return () => window.clearTimeout(timer);
  }, [alert]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`tasks-day-notes:${currentUser.id}`);
      if (raw) setDayNotes(JSON.parse(raw));
    } catch (_error) {
      setDayNotes({});
    }
  }, [currentUser.id]);

  const handleStatusChange = async (task: Task, status: Task['status']) => {
    try {
      await taskService.updateStatus(task.id, status);
      await loadData();
      if (status === 'concluida') {
        setTaskBucket('completed');
        setSelectedDate(task.dueDate);
      }
      if (selectedTask?.id === task.id) {
        const [updatedTasks, updatedTimeline, updatedAttachments] = await Promise.all([taskService.listComments(task.id), taskService.listTimeline(task.id), taskService.listAttachments(task.id)]);
        setComments(updatedTasks);
        setTimeline(updatedTimeline);
        setAttachments(updatedAttachments);
      }
      setAlert({ kind: 'success', message: 'Status atualizado com sucesso.' });
    } catch (error) {
      setAlert({ kind: 'error', message: error instanceof Error ? error.message : 'Falha ao atualizar status.' });
    }
  };

  const handleDueDateUpdate = async (taskId: string) => {
    const dueDate = dueDateDrafts[taskId];
    if (!dueDate) return;
    try {
      await taskService.updateDueDate(taskId, dueDate);
      await loadData();
      if (selectedTask?.id === taskId) {
        const data = await taskService.listTimeline(taskId);
        setTimeline(data);
      }
      setAlert({ kind: 'success', message: 'Prazo ajustado com sucesso.' });
    } catch (error) {
      setAlert({ kind: 'error', message: error instanceof Error ? error.message : 'Falha ao ajustar prazo.' });
    }
  };

  const openComments = async (task: Task) => {
    setSelectedTask(task);
    setCommentInput('');
    setAttachmentTitleInput('');
    setAttachmentUrlInput('');
    setAttachmentFile(null);
    setEditingCommentId(null);
    try {
      const [commentsData, timelineData, attachmentsData] = await Promise.all([taskService.listComments(task.id), taskService.listTimeline(task.id), taskService.listAttachments(task.id)]);
      setComments(commentsData);
      setTimeline(timelineData);
      setAttachments(attachmentsData);
    } catch {
      setComments([]);
      setTimeline([]);
      setAttachments([]);
    }
  };

  const reloadChat = async (taskId: string) => {
    const [commentsData, timelineData, attachmentsData] = await Promise.all([taskService.listComments(taskId), taskService.listTimeline(taskId), taskService.listAttachments(taskId)]);
    setComments(commentsData);
    setTimeline(timelineData);
    setAttachments(attachmentsData);
  };

  useEffect(() => {
    const stream = new EventSource('/api/events', { withCredentials: true });
    const onTaskComment = (event: Event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data || '{}');
        if (!selectedTask || payload.taskId !== selectedTask.id) return;
        reloadChat(selectedTask.id).catch(() => null);
      } catch (_error) {
        // noop
      }
    };

    stream.addEventListener('task:comment', onTaskComment);
    stream.addEventListener('task:typing', (event: Event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data || '{}');
        if (!selectedTask || payload.taskId !== selectedTask.id) return;
        setTypingUsers((prev) => {
          const filtered = prev.filter((user) => user.userId !== payload.userId);
          if (!payload.typing || payload.userId === currentUser.id) return filtered;
          return [...filtered, { userId: payload.userId, userName: payload.userName }];
        });
      } catch (_error) {
        // noop
      }
    });
    stream.addEventListener('task:presence', (event: Event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data || '{}');
        if (!selectedTask || payload.taskId !== selectedTask.id) return;
        setOnlineUsers(Array.isArray(payload.online) ? payload.online : []);
      } catch (_error) {
        // noop
      }
    });
    stream.onerror = () => stream.close();
    return () => {
      stream.removeEventListener('task:comment', onTaskComment);
      stream.close();
    };
  }, [selectedTask?.id]);

  useEffect(() => {
    if (!selectedTask) return;
    let alive = true;
    const run = async () => {
      try {
        const data = await taskService.pingPresence(selectedTask.id);
        if (alive) setOnlineUsers(data.online || []);
      } catch (_error) {
        // noop
      }
    };
    run();
    const timer = window.setInterval(run, 25000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [selectedTask?.id]);

  useEffect(() => {
    if (!selectedTask) return;
    const hasTyping = commentInput.trim().length > 0;
    const timer = window.setTimeout(() => {
      taskService.setTyping(selectedTask.id, hasTyping).catch(() => null);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [commentInput, selectedTask?.id]);

  useEffect(() => {
    return () => {
      if (selectedTask?.id) {
        taskService.setTyping(selectedTask.id, false).catch(() => null);
      }
    };
  }, [selectedTask?.id]);

  const handleAttachmentSubmit = async () => {
    if (!selectedTask) return;
    const title = attachmentTitleInput.trim();
    const url = attachmentUrlInput.trim();
    if (!attachmentFile && (title.length < 2 || url.length < 8)) return;
    try {
      if (attachmentFile) {
        await taskService.uploadAttachment(selectedTask.id, attachmentFile, title || attachmentFile.name);
      } else {
        await taskService.addAttachment(selectedTask.id, { title, url });
      }
      setAttachmentTitleInput('');
      setAttachmentUrlInput('');
      setAttachmentFile(null);
      await reloadChat(selectedTask.id);
      setAlert({ kind: 'success', message: 'Anexo adicionado com sucesso.' });
    } catch (error) {
      setAlert({ kind: 'error', message: error instanceof Error ? error.message : 'Falha ao anexar documento.' });
    }
  };

  const handleCommentSubmit = async () => {
    if (!selectedTask || commentInput.trim().length < 2) return;
    setSavingComment(true);
    try {
      await taskService.addComment(selectedTask.id, commentInput.trim());
      await taskService.setTyping(selectedTask.id, false).catch(() => null);
      setCommentInput('');
      await reloadChat(selectedTask.id);
      setAlert({ kind: 'success', message: 'Mensagem enviada com sucesso.' });
    } catch (error) {
      setAlert({ kind: 'error', message: error instanceof Error ? error.message : 'Falha ao enviar mensagem.' });
    } finally {
      setSavingComment(false);
    }
  };

  const handleCommentEdit = async () => {
    if (!selectedTask || !editingCommentId || editingCommentInput.trim().length < 2) return;
    try {
      await taskService.updateComment(selectedTask.id, editingCommentId, editingCommentInput.trim());
      setEditingCommentId(null);
      setEditingCommentInput('');
      await reloadChat(selectedTask.id);
      setAlert({ kind: 'success', message: 'Mensagem editada.' });
    } catch (error) {
      setAlert({ kind: 'error', message: error instanceof Error ? error.message : 'Falha ao editar mensagem.' });
    }
  };

  const handleCommentDelete = async (commentId: string) => {
    if (!selectedTask) return;
    try {
      await taskService.removeComment(selectedTask.id, commentId);
      await reloadChat(selectedTask.id);
      setAlert({ kind: 'success', message: 'Mensagem removida.' });
    } catch (error) {
      setAlert({ kind: 'error', message: error instanceof Error ? error.message : 'Falha ao apagar mensagem.' });
    }
  };

  const handleReadNotification = async (id: string) => {
    try {
      await notificationService.markRead(id);
      setNotifications((prev) => prev.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item)));
    } catch {
      setAlert({ kind: 'warning', message: 'Não foi possível marcar notificação.' });
    }
  };

  if (loading) {
    return (
      <div className={`rounded-3xl border p-6 ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-100 text-[#0F5132]'}`}>
        Carregando atividades...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className={`rounded-3xl border p-5 shadow-xl ${darkMode ? 'bg-gradient-to-r from-[#0A1324] to-[#122D21] border-[#1E4D36] text-white' : 'bg-gradient-to-r from-white to-green-50 border-green-100 text-[#0F5132]'}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="inline-flex items-center gap-2 text-2xl font-black uppercase tracking-tight">
              <FiCalendar />
              Atividades e calendário
            </h3>
            <p className="text-sm opacity-80">Usabilidade focada em execução: acompanhe, conclua, adie e registre conversa por atividade.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveView('mine')}
              className={`rounded-xl px-3 py-2 text-xs font-black uppercase tracking-wider ${activeView === 'mine' ? 'bg-[#1E8449] text-white animate-pulse' : darkMode ? 'bg-[#0B2016] text-green-200' : 'bg-green-50 text-green-700'}`}
            >
              Atribuídas a mim ({myTasks.length})
            </button>
            {canSeeDelegated && (
              <button
                type="button"
                onClick={() => setActiveView('delegated')}
                className={`rounded-xl px-3 py-2 text-xs font-black uppercase tracking-wider ${activeView === 'delegated' ? 'bg-[#1E8449] text-white animate-pulse' : darkMode ? 'bg-[#0B2016] text-green-200' : 'bg-green-50 text-green-700'}`}
              >
                Delegadas ({delegatedTasks.length})
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 inline-flex rounded-xl border border-green-300/40 p-1 text-xs font-black uppercase">
          <button
            type="button"
            onClick={() => setTaskBucket('active')}
            className={`rounded-lg px-3 py-1 ${taskBucket === 'active' ? 'bg-[#1E8449] text-white' : ''}`}
          >
            Em execução
          </button>
          <button
            type="button"
            onClick={() => setTaskBucket('completed')}
            className={`rounded-lg px-3 py-1 ${taskBucket === 'completed' ? 'bg-[#1E8449] text-white' : ''}`}
          >
            Histórico concluídas ({completedTasks.length})
          </button>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
          <select
            value={teamFilter}
            onChange={(event) => setTeamFilter(event.target.value)}
            className={`rounded-xl border px-3 py-2 text-xs font-black uppercase ${darkMode ? 'bg-[#0B2016] border-[#1E4D36] text-white' : 'bg-white border-green-200 text-[#0F5132]'}`}
          >
            <option value="">Equipe: todas</option>
            {availableTeams.map((team) => (
              <option key={team} value={team}>{team}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'all' | Task['status'])}
            className={`rounded-xl border px-3 py-2 text-xs font-black uppercase ${darkMode ? 'bg-[#0B2016] border-[#1E4D36] text-white' : 'bg-white border-green-200 text-[#0F5132]'}`}
          >
            <option value="all">Status: todos</option>
            <option value="pendente">Pendente</option>
            <option value="em_andamento">Em andamento</option>
            <option value="atrasada">Atrasada</option>
            <option value="concluida">Concluída</option>
          </select>

          <input
            type="date"
            value={dateFromFilter}
            onChange={(event) => setDateFromFilter(event.target.value)}
            className={`rounded-xl border px-3 py-2 text-xs font-black uppercase ${darkMode ? 'bg-[#0B2016] border-[#1E4D36] text-white' : 'bg-white border-green-200 text-[#0F5132]'}`}
          />
          <input
            type="date"
            value={dateToFilter}
            onChange={(event) => setDateToFilter(event.target.value)}
            className={`rounded-xl border px-3 py-2 text-xs font-black uppercase ${darkMode ? 'bg-[#0B2016] border-[#1E4D36] text-white' : 'bg-white border-green-200 text-[#0F5132]'}`}
          />
        </div>
      </section>

      {alert && <AlertBanner kind={alert.kind} message={alert.message} />}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[300px,1fr]">
        <aside className={`rounded-3xl border p-4 shadow-xl space-y-4 ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-100 text-[#0F5132]'}`}>
          <div className="grid grid-cols-1 gap-2">
            <div className={`rounded-xl border p-3 ${darkMode ? 'bg-[#0B2016] border-[#1E4D36]' : 'bg-green-50 border-green-100'}`}>
              <p className="text-xs font-black uppercase">Hoje</p>
              <p className="text-2xl font-black">{todayCount}</p>
            </div>
            <div className={`rounded-xl border p-3 ${darkMode ? 'bg-[#0B2016] border-[#1E4D36]' : 'bg-green-50 border-green-100'}`}>
              <p className="text-xs font-black uppercase">Nesta semana</p>
              <p className="text-2xl font-black">{thisWeekCount}</p>
            </div>
            <div className={`rounded-xl border p-3 ${darkMode ? 'bg-[#0B2016] border-[#1E4D36]' : 'bg-green-50 border-green-100'}`}>
              <p className="text-xs font-black uppercase">Atrasadas</p>
              <p className="text-2xl font-black text-red-600">{overdueTasks.length}</p>
            </div>
          </div>

          <div className={`rounded-xl border p-3 ${darkMode ? 'bg-[#0B2016] border-[#1E4D36]' : 'bg-green-50 border-green-100'}`}>
            <p className="text-xs font-black uppercase mb-2">Próximos prazos</p>
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {upcomingTasks.map((task) => (
                <button key={task.id} onClick={() => openComments(task)} className="w-full rounded-lg border border-green-300/40 p-2 text-left hover:bg-green-500/10">
                  <p className="text-xs font-black uppercase leading-tight">{task.title}</p>
                  <p className="text-[11px] opacity-80">{new Date(`${task.dueDate}T00:00:00`).toLocaleDateString('pt-BR')}</p>
                </button>
              ))}
              {upcomingTasks.length === 0 && <p className="text-xs opacity-70">Sem prazos próximos.</p>}
            </div>
          </div>

          <div className={`rounded-xl border p-3 ${darkMode ? 'bg-[#0B2016] border-[#1E4D36]' : 'bg-green-50 border-green-100'}`}>
            <p className="text-xs font-black uppercase">Notificações não lidas</p>
            <p className="text-2xl font-black">{unreadNotifications.length}</p>
          </div>
        </aside>

        <section className={`rounded-3xl border p-4 shadow-xl ${darkMode ? 'bg-[#0A1324] border-[#1f2d48] text-white' : 'bg-white border-green-100 text-[#0F5132]'}`}>
          <div className={`mb-4 flex flex-col gap-3 rounded-2xl border p-3 lg:flex-row lg:items-center lg:justify-between ${darkMode ? 'border-[#1f2d48] bg-[#111d33]' : 'border-green-100 bg-green-50'}`}>
            <h4 className="text-lg font-black uppercase tracking-wider">
              {monthCursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </h4>
            <div className="flex flex-wrap items-center gap-2">
              <div className={`inline-flex items-center rounded-xl border ${darkMode ? 'border-[#2c3f63] bg-[#1a2943]' : 'border-green-200 bg-white'}`}>
                <button
                  type="button"
                  onClick={() => {
                    const next = new Date(monthCursor);
                    next.setMonth(monthCursor.getMonth() - 1);
                    setMonthCursor(next);
                  }}
                  className="rounded-l-xl px-3 py-2"
                  aria-label="Mês anterior"
                >
                  <FiChevronLeft />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMonthCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
                    setSelectedDate(dayKey(new Date()));
                  }}
                  className="border-x px-3 py-2 text-xs font-black uppercase"
                >
                  Hoje
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = new Date(monthCursor);
                    next.setMonth(monthCursor.getMonth() + 1);
                    setMonthCursor(next);
                  }}
                  className="rounded-r-xl px-3 py-2"
                  aria-label="Próximo mês"
                >
                  <FiChevronRight />
                </button>
              </div>

              <button type="button" className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black uppercase ${darkMode ? 'border-[#2c3f63] bg-[#1a2943]' : 'border-green-200 bg-white'}`}>
                <FiGrid />
                {boardView === 'calendar' ? 'Visão mensal' : 'Visão kanban'}
              </button>
              <button
                type="button"
                onClick={() => setBoardView((prev) => (prev === 'calendar' ? 'kanban' : 'calendar'))}
                data-testid="tasks-kanban-toggle"
                className="inline-flex items-center gap-2 rounded-xl bg-[#145A32] px-3 py-2 text-xs font-black uppercase text-white hover:bg-[#0F5132]"
              >
                <FiGrid />
                Alternar visão
              </button>

              <button
                type="button"
                onClick={() => {
                  setDayNoteInput(dayNotes[selectedDate] || '');
                  setIsDayModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-[#4F46E5] px-3 py-2 text-xs font-black uppercase text-white hover:bg-[#4338CA]"
              >
                <FiPlus />
                Adicionar evento
              </button>
            </div>
          </div>

          {boardView === 'calendar' ? (
          <>
          <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-black uppercase tracking-wider opacity-70">
            {weekDays.map((label) => (
              <div key={label}>{label}</div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-2">
            {calendarCells.map((date) => {
              const key = dayKey(date);
              const dayTasks = tasksByDate.get(key) || [];
              const isSelected = key === selectedDate;
              const isToday = key === today;
              const inMonth = sameMonth(date, monthCursor);

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setSelectedDate(key);
                    setDayNoteInput(dayNotes[key] || '');
                    setIsDayModalOpen(true);
                  }}
                  className={`min-h-24 rounded-xl border p-2 text-left transition-all ${isSelected ? 'border-[#4F46E5] ring-2 ring-[#4F46E5]/40' : darkMode ? 'border-[#1f2d48] bg-[#0C1A31]' : 'border-green-100 bg-green-50'} ${!inMonth ? 'opacity-45' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-black ${isToday ? 'text-[#60A5FA]' : ''}`}>{date.getDate()}</span>
                    {dayTasks.length > 0 && <span className="rounded-full bg-[#4F46E5] px-2 py-0.5 text-[10px] font-black text-white">{dayTasks.length}</span>}
                  </div>
                  <div className="mt-1 space-y-1">
                    {dayTasks.slice(0, 2).map((task) => (
                      <p key={task.id} className={`truncate rounded px-1 py-0.5 text-[10px] font-bold uppercase ${darkMode ? 'bg-slate-700/60' : 'bg-green-500/15'}`}>
                        {task.title}
                      </p>
                    ))}
                    {dayTasks.length > 2 && <p className="text-[10px] font-bold opacity-70">+{dayTasks.length - 2} mais</p>}
                  </div>
                </button>
              );
            })}
          </div>
          </>
          ) : (
            <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-4">
              {(['pendente', 'em_andamento', 'atrasada', 'concluida'] as Task['status'][]).map((status) => (
                <div
                  key={status}
                  data-testid={`kanban-column-${status}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={async () => {
                    if (!dragTaskId) return;
                    const task = filteredByCriteria.find((item) => item.id === dragTaskId);
                    if (!task) return;
                    await handleStatusChange(task, status);
                    setDragTaskId(null);
                  }}
                  className={`rounded-2xl border p-3 min-h-48 ${darkMode ? 'border-[#1E4D36] bg-[#0B2016]' : 'border-green-100 bg-green-50'}`}
                >
                  <p className="mb-2 text-xs font-black uppercase">{statusLabel[status]}</p>
                  <div className="space-y-2">
                    {filteredByCriteria.filter((task) => task.status === status).map((task) => (
                      <div
                        key={task.id}
                        draggable
                        data-testid={`kanban-card-${task.id}`}
                        onDragStart={() => setDragTaskId(task.id)}
                        className={`cursor-move rounded-lg border p-2 ${darkMode ? 'border-[#1E4D36] bg-[#10271b]' : 'border-green-100 bg-white'}`}
                      >
                        <p className="text-xs font-black uppercase">{task.title}</p>
                        <p className="text-[11px] opacity-80">{task.teamName || 'Sem equipe'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className={`rounded-2xl border p-3 ${darkMode ? 'border-[#1E4D36] bg-[#0B2016]' : 'border-green-100 bg-green-50'}`}>
              <p className="text-xs font-black uppercase">Agenda do dia {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('pt-BR')}</p>
              <div className="mt-2 space-y-2 max-h-72 overflow-y-auto">
                {selectedDayTasks.map((task) => (
                  <div key={task.id} className="rounded-lg border border-green-300/40 p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-black uppercase">{task.title}</p>
                        <p className="text-[11px] opacity-80">{task.teamName || 'Sem equipe'}</p>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${statusTone[task.status]}`}>{statusLabel[task.status]}</span>
                    </div>

                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr,140px,88px]">
                      <select
                        value={task.status}
                        onChange={(event) => handleStatusChange(task, event.target.value as Task['status'])}
                        className={`rounded-lg border px-2 py-1 text-xs ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-200 text-[#0F5132]'}`}
                      >
                        <option value="pendente">{statusLabel.pendente}</option>
                        <option value="em_andamento">{statusLabel.em_andamento}</option>
                        <option value="atrasada">{statusLabel.atrasada}</option>
                        <option value="concluida">{statusLabel.concluida}</option>
                      </select>

                      <input
                        type="date"
                        value={dueDateDrafts[task.id] || task.dueDate}
                        onChange={(event) => setDueDateDrafts((prev) => ({ ...prev, [task.id]: event.target.value }))}
                        className={`rounded-lg border px-2 py-1 text-xs ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-200 text-[#0F5132]'}`}
                      />

                      <button onClick={() => handleDueDateUpdate(task.id)} className="rounded-lg bg-amber-500 px-2 py-1 text-xs font-black uppercase text-white hover:bg-amber-600">
                        Adiar
                      </button>
                    </div>

                    <button onClick={() => openComments(task)} className="mt-2 rounded-lg bg-[#1E8449] px-2 py-1 text-xs font-black uppercase text-white hover:bg-[#145A32]">
                      Conversa
                    </button>
                  </div>
                ))}
                {selectedDayTasks.length === 0 && <p className="text-xs opacity-70">Nenhuma atividade neste dia.</p>}
              </div>
            </div>

            <div className={`rounded-2xl border p-3 ${darkMode ? 'border-[#1E4D36] bg-[#0B2016]' : 'border-green-100 bg-green-50'}`}>
              <p className="text-xs font-black uppercase">Atrasadas ({overdueTasks.length})</p>
              <div className="mt-2 space-y-2 max-h-72 overflow-y-auto">
                {overdueTasks.slice(0, 10).map((task) => (
                  <button key={task.id} onClick={() => openComments(task)} className="w-full rounded-lg border border-red-300/40 bg-red-500/10 p-2 text-left">
                    <p className="text-xs font-black uppercase">{task.title}</p>
                    <p className="text-[11px]">Prazo: {new Date(`${task.dueDate}T00:00:00`).toLocaleDateString('pt-BR')}</p>
                  </button>
                ))}
                {overdueTasks.length === 0 && <p className="text-xs opacity-70">Sem atrasos no momento.</p>}
              </div>
            </div>

            <div className={`rounded-2xl border p-3 ${darkMode ? 'border-[#1E4D36] bg-[#0B2016]' : 'border-green-100 bg-green-50'}`}>
              <p className="text-xs font-black uppercase">Concluídas ({completedTasks.length})</p>
              <div className="mt-2 space-y-2 max-h-72 overflow-y-auto">
                {completedTasks.slice(0, 10).map((task) => (
                  <button key={task.id} onClick={() => openComments(task)} className="w-full rounded-lg border border-emerald-300/40 bg-emerald-500/10 p-2 text-left">
                    <p className="text-xs font-black uppercase">{task.title}</p>
                    <p className="text-[11px]">Equipe: {task.teamName || 'Sem equipe'}</p>
                  </button>
                ))}
                {completedTasks.length === 0 && <p className="text-xs opacity-70">Nenhuma atividade concluída.</p>}
              </div>
            </div>
          </div>

          <div className={`mt-4 rounded-2xl border p-3 ${darkMode ? 'border-[#1E4D36] bg-[#0B2016]' : 'border-green-100 bg-green-50'}`}>
            <p className="text-xs font-black uppercase">Notificações</p>
            <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
              {notifications.map((item) => (
                <div key={item.id} className={`rounded-lg border p-2 ${item.readAt ? 'opacity-60' : ''}`}>
                  <p className="text-xs font-black uppercase">{item.title}</p>
                  <p className="text-xs">{item.message}</p>
                  {!item.readAt && (
                    <button onClick={() => handleReadNotification(item.id)} className="mt-1 rounded bg-[#1E8449] px-2 py-1 text-[10px] font-black uppercase text-white">
                      Marcar como lida
                    </button>
                  )}
                </div>
              ))}
              {notifications.length === 0 && <p className="text-xs opacity-70">Sem notificações.</p>}
            </div>
          </div>
        </section>
      </div>

      <ModalDialog
        open={isDayModalOpen}
        onClose={() => setIsDayModalOpen(false)}
        title={`Informações do dia ${new Date(`${selectedDate}T00:00:00`).toLocaleDateString('pt-BR')}`}
        titleIcon={<FiCalendar />}
        darkMode={darkMode}
        maxWidthClass="max-w-2xl"
      >
        <div className={`rounded-xl border p-3 ${darkMode ? 'border-[#1E4D36] bg-[#0B2016]' : 'border-green-100 bg-green-50/40'}`}>
          <p className="text-xs font-black uppercase">Atividades do dia ({selectedDayTasks.length})</p>
          <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
            {selectedDayTasks.map((task) => (
              <button key={task.id} onClick={() => openComments(task)} className="w-full rounded-lg border border-green-300/40 p-2 text-left">
                <p className="text-xs font-black uppercase">{task.title}</p>
                <p className="text-[11px] opacity-80">{task.teamName || 'Sem equipe'} • {statusLabel[task.status]}</p>
              </button>
            ))}
            {selectedDayTasks.length === 0 && <p className="text-xs opacity-70">Sem atividades neste dia.</p>}
          </div>
        </div>

        <div className="mt-3">
          <label className="mb-1 block text-xs font-black uppercase">Observações do dia</label>
          <textarea
            value={dayNoteInput}
            onChange={(event) => setDayNoteInput(event.target.value)}
            rows={4}
            placeholder="Escreva observações, lembretes ou eventos deste dia..."
            className={`w-full rounded-xl border px-3 py-2 text-sm ${darkMode ? 'bg-[#0B2016] border-[#1E4D36] text-white' : 'bg-white border-green-200 text-[#0F5132]'}`}
          />
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={() => {
              const next = { ...dayNotes };
              delete next[selectedDate];
              setDayNotes(next);
              setDayNoteInput('');
              window.localStorage.setItem(`tasks-day-notes:${currentUser.id}`, JSON.stringify(next));
            }}
            className="rounded-xl bg-gray-600 px-3 py-2 text-xs font-black uppercase text-white"
          >
            Limpar
          </button>
          <button
            onClick={() => {
              const value = dayNoteInput.trim();
              const next = { ...dayNotes };
              if (value) next[selectedDate] = value;
              else delete next[selectedDate];
              setDayNotes(next);
              window.localStorage.setItem(`tasks-day-notes:${currentUser.id}`, JSON.stringify(next));
              setAlert({ kind: 'success', message: 'Observação do dia salva.' });
            }}
            className="rounded-xl bg-[#1E8449] px-3 py-2 text-xs font-black uppercase text-white"
          >
            Salvar observação
          </button>
        </div>
      </ModalDialog>

      <ModalDialog
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        title={selectedTask ? `Conversa da atividade: ${selectedTask.title}` : 'Conversa da atividade'}
        titleIcon={<FiMessageSquare />}
        darkMode={darkMode}
        maxWidthClass="max-w-4xl"
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr,1fr]">
          <div className={`rounded-xl border p-3 max-h-72 overflow-y-auto ${darkMode ? 'border-[#1E4D36] bg-[#0B2016]' : 'border-green-100 bg-green-50/40'}`}>
            {comments.map((comment) => {
              const canManage = comment.userId === currentUser.id;
              return (
                <div key={comment.id} className={`mb-3 rounded-xl border p-2 last:mb-0 ${darkMode ? 'border-[#1E4D36] bg-[#10271b]' : 'border-green-100 bg-white'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-black">{comment.userName}</p>
                      {editingCommentId === comment.id ? (
                        <div className="mt-1 flex gap-2">
                          <input
                            value={editingCommentInput}
                            onChange={(event) => setEditingCommentInput(event.target.value)}
                            className={`flex-1 rounded-lg border px-2 py-1 text-xs ${darkMode ? 'bg-[#0B2016] border-[#1E4D36] text-white' : 'bg-white border-green-200 text-[#0F5132]'}`}
                          />
                          <button onClick={handleCommentEdit} className="rounded-lg bg-[#1E8449] px-2 py-1 text-xs font-black text-white"><FiSave /></button>
                        </div>
                      ) : (
                        <p className="text-sm">{comment.message}</p>
                      )}
                      <p className="text-[10px] opacity-70">
                        {new Date(comment.createdAt).toLocaleString('pt-BR')}
                        {comment.editedAt ? ' (editada)' : ''}
                      </p>
                    </div>
                    {canManage && editingCommentId !== comment.id && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setEditingCommentId(comment.id);
                            setEditingCommentInput(comment.message);
                          }}
                          className="rounded bg-amber-500 px-2 py-1 text-white"
                          title="Editar mensagem"
                        >
                          <FiEdit2 size={12} />
                        </button>
                        <button onClick={() => handleCommentDelete(comment.id)} className="rounded bg-red-600 px-2 py-1 text-white" title="Apagar mensagem">
                          <FiTrash2 size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {comments.length === 0 && <p className="text-sm opacity-80">Sem comentários ainda.</p>}
          </div>

          <div className={`rounded-xl border p-3 max-h-72 overflow-y-auto ${darkMode ? 'border-[#1E4D36] bg-[#0B2016]' : 'border-green-100 bg-green-50/40'}`}>
            <p className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase"><FiClock /> Fluxo da atividade</p>
            {timeline.map((event) => (
              <div key={event.id} className="mb-2 border-l-2 border-green-400 pl-2 text-xs last:mb-0">
                <p className="font-black">{event.userName}</p>
                <p>{event.message}</p>
                <p className="opacity-70">{new Date(event.createdAt).toLocaleString('pt-BR')}</p>
              </div>
            ))}
            {timeline.length === 0 && <p className="text-xs opacity-70">Sem eventos de fluxo.</p>}
          </div>
        </div>

        <div className={`mt-3 rounded-xl border p-2 ${darkMode ? 'border-[#1E4D36] bg-[#10271b]' : 'border-green-100 bg-green-50'}`}>
          <p className="text-[11px] font-black uppercase">
            Online: {onlineUsers.filter((user) => user.userId !== currentUser.id).map((user) => user.userName).join(', ') || 'Somente você'}
          </p>
          {typingUsers.length > 0 && (
            <p className="mt-1 text-[11px]">
              Digitando: {typingUsers.map((user) => user.userName).join(', ')}
            </p>
          )}
        </div>

        <div className={`mt-3 rounded-xl border p-3 ${darkMode ? 'border-[#1E4D36] bg-[#0B2016]' : 'border-green-100 bg-green-50/40'}`}>
          <p className="text-xs font-black uppercase">Anexos</p>
          <div className="mt-2 max-h-36 space-y-2 overflow-y-auto">
            {attachments.map((attachment) => (
              <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className={`block rounded-lg border p-2 ${darkMode ? 'border-[#1E4D36] hover:bg-[#10271b]' : 'border-green-100 hover:bg-white'}`}>
                <p className="text-xs font-black uppercase">{attachment.title}</p>
                <p className="text-[11px] opacity-70 truncate">{attachment.url}</p>
              </a>
            ))}
            {attachments.length === 0 && <p className="text-xs opacity-70">Sem anexos para esta atividade.</p>}
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[180px,1fr,100px]">
            <input
              value={attachmentTitleInput}
              onChange={(event) => setAttachmentTitleInput(event.target.value)}
              placeholder="Título do anexo"
              className={`rounded-xl border px-3 py-2 text-xs ${darkMode ? 'bg-[#0B2016] border-[#1E4D36] text-white' : 'bg-white border-green-200 text-[#0F5132]'}`}
            />
            <input
              value={attachmentUrlInput}
              onChange={(event) => setAttachmentUrlInput(event.target.value)}
              placeholder="https://..."
              className={`rounded-xl border px-3 py-2 text-xs ${darkMode ? 'bg-[#0B2016] border-[#1E4D36] text-white' : 'bg-white border-green-200 text-[#0F5132]'}`}
            />
            <button onClick={handleAttachmentSubmit} className="rounded-xl bg-[#1E8449] px-3 py-2 text-xs font-black uppercase text-white">
              Anexar
            </button>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr,120px]">
            <input
              type="file"
              onChange={(event) => setAttachmentFile(event.target.files?.[0] || null)}
              className={`rounded-xl border px-3 py-2 text-xs ${darkMode ? 'bg-[#0B2016] border-[#1E4D36] text-white' : 'bg-white border-green-200 text-[#0F5132]'}`}
            />
            <button onClick={handleAttachmentSubmit} className="rounded-xl bg-[#145A32] px-3 py-2 text-xs font-black uppercase text-white">
              Enviar arquivo
            </button>
          </div>
          <p className="mt-2 text-[11px] opacity-70">Dica: mencione pessoas no chat com `@nome` ou `@email`.</p>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {quickEmojis.map((emoji) => (
            <button key={emoji} onClick={() => setCommentInput((prev) => `${prev}${emoji}`)} className="rounded-lg border px-2 py-1 text-sm">
              {emoji}
            </button>
          ))}
        </div>

        <div className="mt-2 flex gap-2">
          <input
            value={commentInput}
            onChange={(event) => setCommentInput(event.target.value)}
            placeholder="Escreva uma mensagem para a atividade..."
            className={`flex-1 rounded-xl border px-3 py-2 text-sm ${darkMode ? 'bg-[#0B2016] border-[#1E4D36] text-white' : 'bg-white border-green-200 text-[#0F5132]'}`}
          />
          <button
            onClick={handleCommentSubmit}
            disabled={savingComment}
            className="rounded-xl bg-[#1E8449] px-4 py-2 text-sm font-black text-white disabled:opacity-60"
          >
            Enviar
          </button>
        </div>

        {selectedTask && (
          <div className={`mt-3 rounded-xl border p-2 ${darkMode ? 'border-[#1E4D36] bg-[#10271b]' : 'border-green-100 bg-green-50'}`}>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-[10px] font-black text-green-800"><FiCheckCircle /> Status: {statusLabel[selectedTask.status]}</span>
              {(selectedTask.overdue || selectedTask.status === 'atrasada') && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-[10px] font-black text-red-800"><FiAlertCircle /> Atrasada</span>}
            </div>
          </div>
        )}
      </ModalDialog>
    </div>
  );
};

export default TasksPanel;
