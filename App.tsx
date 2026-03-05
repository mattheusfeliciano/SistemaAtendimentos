
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiCalendar,
  FiBell,
  FiCheckSquare,
  FiClock,
  FiEdit3,
  FiFileText,
  FiGrid,
  FiLogOut,
  FiMenu,
  FiSearch,
  FiSettings,
  FiSliders,
  FiUserCheck,
  FiUsers,
  FiInfo,
  FiTrash2,
} from 'react-icons/fi';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend 
} from 'recharts';
import StatCard from './components/StatCard';
import AtendimentoForm from './components/AtendimentoForm';
import AdminUsersPanel from './components/AdminUsersPanel';
import CatalogOptionsPanel from './components/CatalogOptionsPanel';
import TasksPanel from './components/TasksPanel';
import SecretaryPanel from './components/SecretaryPanel';
import AuditPanel from './components/AuditPanel';
import SettingsScreen from './components/SettingsScreen';
import AlertBanner from './components/ui/AlertBanner';
import SidebarNavItem from './components/ui/SidebarNavItem';
import { Atendimento, Turno } from './types';
import { atendimentoService, authService, AuthUser, catalogOptionsService, notificationService, NotificationItem, taskService, teamService, userAdminService } from './services/api';

const LIGHT_COLORS = ['#0F5132', '#1E8449', '#2ECC71', '#27AE60', '#16A085', '#145A32'];
const DARK_COLORS = ['#2ECC71', '#48C9B0', '#52BE80', '#27AE60', '#A9DFBF', '#F4D03F'];
const MULTI_VALUE_SEPARATOR = '|';
const SECRETARY_DISPLAY_NAME = 'SECRETÁRIO';
type AppTab = 'dashboard' | 'registrar' | 'historico' | 'usuarios' | 'padronizacao' | 'relatorios' | 'atividades' | 'equipe' | 'secretaria' | 'auditoria' | 'configuracoes';
type GlobalSearchItemKind = 'atendimento' | 'atividade' | 'equipe' | 'usuario' | 'notificacao';
type GlobalSearchItem = { id: string; kind: GlobalSearchItemKind; title: string; subtitle: string };
const emptyAtendimentoDraft: Omit<Atendimento, 'id' | 'createdAt'> = {
  data: '',
  turno: Turno.MANHA,
  departamento: '',
  atividade: '',
  responsavel: '',
  local: '',
};

function splitCompositeValues(value: string): string[] {
  return String(value || '')
    .split(/[|,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeComparable(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRoleValue(value?: string | null): 'superadmin' | 'admin' | 'gestor' | 'operador' | '' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'superadmin' || normalized === 'admin' || normalized === 'gestor' || normalized === 'operador') {
    return normalized;
  }
  return '';
}

const App: React.FC = () => {
  const navigate = useNavigate();
  const [atendimentos, setAtendimentos] = useState<Atendimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [darkMode, setDarkMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showAbout, setShowAbout] = useState(false);
  const [selectedAtendimento, setSelectedAtendimento] = useState<Atendimento | null>(null);
  const [editingAtendimento, setEditingAtendimento] = useState<Atendimento | null>(null);
  const [atendimentoToDelete, setAtendimentoToDelete] = useState<Atendimento | null>(null);
  const [successNotice, setSuccessNotice] = useState('');
  const [welcomeNotice, setWelcomeNotice] = useState('');
  const [notificationNotice, setNotificationNotice] = useState('');
  const [appAlert, setAppAlert] = useState<{ kind: 'warning' | 'error'; text: string } | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsRender, setNotificationsRender] = useState(false);
  const [notificationReplyMap, setNotificationReplyMap] = useState<Record<string, string>>({});
  const [repliedNotificationMap, setRepliedNotificationMap] = useState<Record<string, boolean>>({});
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [registerWorkspace, setRegisterWorkspace] = useState<'' | 'atendimento' | 'departamento' | 'local' | 'atividade' | 'responsavel'>('');
  const [registerDraft, setRegisterDraft] = useState<Omit<Atendimento, 'id' | 'createdAt'>>(emptyAtendimentoDraft);
  const [globalSearchData, setGlobalSearchData] = useState<GlobalSearchItem[]>([]);
  const [focusUserIdInAdmin, setFocusUserIdInAdmin] = useState<string | null>(null);
  const lastUnreadCountRef = useRef<number | null>(null);
  const notificationsPanelRef = useRef<HTMLDivElement | null>(null);
  const notificationsCloseTimerRef = useRef<number | undefined>(undefined);
  const globalSearchInputRef = useRef<HTMLInputElement | null>(null);

  // Filtros Histórico
  const [filters, setFilters] = useState({
    data: '',
    local: '',
    departamento: '',
    responsavel: ''
  });
  const [departamentos, setDepartamentos] = useState<string[]>([]);
  const [responsaveis, setResponsaveis] = useState<string[]>([]);
  const [locais, setLocais] = useState<string[]>([]);
  const [atividades, setAtividades] = useState<string[]>([]);
  const [reportScope, setReportScope] = useState<'geral' | 'dia' | 'mes' | 'ano'>('geral');
  const [reportDay, setReportDay] = useState(new Date().toISOString().slice(0, 10));
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7));
  const [reportYear, setReportYear] = useState(String(new Date().getFullYear()));
  const [reportFilters, setReportFilters] = useState({
    responsavel: '',
    local: '',
    departamento: '',
    atividade: '',
    turno: '',
  });
  const editingInitialData = useMemo(
    () =>
      editingAtendimento
        ? {
            data: editingAtendimento.data,
            turno: editingAtendimento.turno,
            departamento: editingAtendimento.departamento,
            atividade: editingAtendimento.atividade,
            responsavel: editingAtendimento.responsavel,
            local: editingAtendimento.local,
          }
        : undefined,
    [editingAtendimento]
  );
  const normalizedCurrentRole = normalizeRoleValue(currentUser?.role);
  const canManageUsers = normalizedCurrentRole === 'superadmin' || normalizedCurrentRole === 'admin' || normalizedCurrentRole === 'gestor';

  const fetchData = useCallback(async () => {
    try {
      const data = await atendimentoService.getAll();
      setAtendimentos(data);
    } catch (error) {
      console.error("Erro ao buscar dados:", error);
      if (error instanceof Error && (error.message.includes('Não autenticado') || error.message.includes('Sessão inválida'))) {
        navigate('/login', { replace: true });
      }
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    document.body.className = darkMode ? 'theme-dark' : 'theme-light';
  }, [darkMode]);

  useEffect(() => {
    fetchData();
    authService.me().then(setCurrentUser).catch(() => setCurrentUser(null));
    window.addEventListener('storage', fetchData);
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 1000);
    
    return () => {
      window.removeEventListener('storage', fetchData);
      clearInterval(clockTimer);
    };
  }, [fetchData]);

  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth);
      if (window.innerWidth >= 920) setIsSidebarOpen(true);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setGlobalSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setGlobalSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!globalSearchOpen) return;
    const timer = window.setTimeout(() => globalSearchInputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [globalSearchOpen]);

  useEffect(() => {
    if (!globalSearchOpen || !currentUser) return;
    let alive = true;
    (async () => {
      try {
        const [tasksList, teamsList, notificationsList] = await Promise.all([
          taskService.list(),
          teamService.list(),
          notificationService.list(),
        ]);
        let usersList: Array<{ id: string; fullName: string; email: string }> = [];
        try {
          if (canManageUsers) {
            const rawUsers = await userAdminService.list();
            usersList = rawUsers.map((user) => ({ id: user.id, fullName: user.fullName, email: user.email }));
          }
        } catch (_error) {
          usersList = [];
        }

        if (!alive) return;
        const atendimentoItems = atendimentos.slice(0, 200).map((item) => ({
          id: item.id,
          kind: 'atendimento' as const,
          title: item.atividade,
          subtitle: `${item.responsavel} • ${item.departamento}`,
        }));
        const taskItems = tasksList.map((item) => ({
          id: item.id,
          kind: 'atividade' as const,
          title: item.title,
          subtitle: `${item.teamName || 'Sem equipe'} • ${item.status}`,
        }));
        const teamItems = teamsList.map((item) => ({
          id: item.id,
          kind: 'equipe' as const,
          title: item.name,
          subtitle: `${item.members.length} membro(s)`,
        }));
        const userItems = usersList.map((item) => ({
          id: item.id,
          kind: 'usuario' as const,
          title: item.fullName,
          subtitle: item.email,
        }));
        const notifItems = notificationsList.map((item) => ({
          id: item.id,
          kind: 'notificacao' as const,
          title: item.title,
          subtitle: item.message,
        }));
        setGlobalSearchData([...taskItems, ...teamItems, ...userItems, ...notifItems, ...atendimentoItems]);
      } catch (error) {
        console.error('Erro ao carregar busca global:', error);
      }
    })();
    return () => {
      alive = false;
    };
  }, [globalSearchOpen, currentUser, atendimentos, canManageUsers]);

  const globalSearchResults = useMemo(() => {
    const query = normalizeComparable(globalSearchQuery);
    if (!query) return globalSearchData.slice(0, 18);
    return globalSearchData.filter((item) => {
      return normalizeComparable(`${item.title} ${item.subtitle} ${item.kind}`).includes(query);
    }).slice(0, 25);
  }, [globalSearchData, globalSearchQuery]);

  const canCreateAtendimento = !!currentUser;
  const canDeleteAtendimento = normalizedCurrentRole === 'superadmin' || normalizedCurrentRole === 'admin' || normalizedCurrentRole === 'gestor';
  const canEditAtendimento = !!currentUser;
  const canManageCatalog = !!currentUser;
  const isSecretaryUser = normalizeComparable(currentUser?.fullName || '') === normalizeComparable(SECRETARY_DISPLAY_NAME);
  const canManageSecretary = !!currentUser && (isSecretaryUser || normalizedCurrentRole === 'superadmin' || normalizedCurrentRole === 'admin');
  const canViewAudit = normalizedCurrentRole === 'superadmin';
  const currentRoleLabel =
    isSecretaryUser
      ? 'Secretário'
      : currentUser?.role === 'superadmin'
      ? 'ADMIN'
      : currentUser?.role === 'admin'
      ? 'Admin'
      : currentUser?.role === 'gestor'
        ? 'Gestão'
        : currentUser?.role === 'operador'
          ? 'Operador'
          : '';
  const roleInstructions = useMemo(() => {
    if (currentUser?.role === 'operador') {
      return [
        'Registrar novos atendimentos.',
        'Editar atendimentos existentes.',
        'Consultar dashboard, histórico e relatórios.',
        'Visualizar e editar itens de padronização.',
        'Executar atividades com prazo e atualizar status.',
      ];
    }
    if (currentUser?.role === 'gestor') {
      return [
        'Tudo que o Operador faz.',
        'Excluir atendimentos e itens da padronização.',
        'Gerenciar usuários e aprovar acessos.',
        'Acompanhar atividades e definir prazos.',
      ];
    }
    if (currentUser?.role === 'superadmin') {
      return [
        'Controle total da plataforma.',
        'Gerenciar perfis ADMIN, Admin, Gestor e Operador.',
        'Aprovar, ativar, desativar e excluir qualquer usuário.',
        'Acesso completo a todos os painéis e métricas.',
      ];
    }
    if (currentUser?.role === 'admin') {
      return [
        'Acesso administrativo avançado do sistema.',
        'Gerenciar usuários, permissões e exclusões (exceto ADMIN).',
        'Acompanhar histórico, dashboard e relatórios.',
        'Acesso ao painel do secretário para coordenação e melhorias administrativas.',
      ];
    }
    return [
      'Consulte a equipe de gestão para liberação de perfil.',
    ];
  }, [currentUser?.role, isSecretaryUser]);

  useEffect(() => {
    const loadOptionsFromDb = async () => {
      try {
        const options = await catalogOptionsService.list();
        setDepartamentos(options.filter((item) => item.type === 'departamento').map((item) => item.value));
        setLocais(options.filter((item) => item.type === 'local').map((item) => item.value));
        setAtividades(options.filter((item) => item.type === 'atividade').map((item) => item.value));
      } catch (error) {
        console.error('Erro ao buscar opções padronizadas:', error);
      }
    };
    loadOptionsFromDb();
  }, [atendimentos.length]);

  useEffect(() => {
    const responsaveisUnicos = Array.from<string>(
      new Set(atendimentos.flatMap((a) => splitCompositeValues(String(a.responsavel ?? ''))))
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    setResponsaveis(responsaveisUnicos);
  }, [atendimentos]);

  const reportLocais = useMemo(() => {
    const fromRecords = atendimentos.flatMap((a) => splitCompositeValues(String(a.local || '')));
    return Array.from(new Set([...locais, ...fromRecords])).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [atendimentos, locais]);

  const reportDepartamentos = useMemo(() => {
    const fromRecords = atendimentos.flatMap((a) => splitCompositeValues(String(a.departamento || '')));
    return Array.from(new Set([...departamentos, ...fromRecords])).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [atendimentos, departamentos]);

  const reportAtividades = useMemo(() => {
    const fromRecords = atendimentos.flatMap((a) => splitCompositeValues(String(a.atividade || '')));
    return Array.from(new Set([...atividades, ...fromRecords])).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [atendimentos, atividades]);

  useEffect(() => {
    if (activeTab === 'padronizacao') {
      if (canManageCatalog) {
        setRegisterWorkspace('departamento');
        setActiveTab('registrar');
      } else {
        setActiveTab('dashboard');
      }
      return;
    }
    if (activeTab === 'usuarios' && !canManageUsers) {
      setActiveTab('dashboard');
    }
    if (activeTab === 'registrar' && !canCreateAtendimento) {
      setActiveTab('dashboard');
    }
    if (activeTab === 'relatorios' && !currentUser) {
      setActiveTab('dashboard');
    }
    if (activeTab === 'atividades' && !currentUser) {
      setActiveTab('dashboard');
    }
    if (activeTab === 'secretaria' && !canManageSecretary) {
      setActiveTab('dashboard');
    }
    if (activeTab === 'equipe' && !canManageSecretary) {
      setActiveTab('dashboard');
    }
    if (activeTab === 'configuracoes' && !currentUser) {
      setActiveTab('dashboard');
    }
    if (activeTab === 'auditoria' && !canViewAudit) {
      setActiveTab('dashboard');
    }
  }, [activeTab, canManageUsers, canCreateAtendimento, canManageCatalog, canManageSecretary, canViewAudit, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const firstAccessKey = `dashEducacao:firstAccess:${currentUser.id}`;
    const alreadySeen = window.localStorage.getItem(firstAccessKey);
    if (alreadySeen) return;

    setWelcomeNotice(`Bem-vindo, ${currentUser.fullName}!`);
    setShowAbout(true);
    window.localStorage.setItem(firstAccessKey, new Date().toISOString());

    const timer = window.setTimeout(() => setWelcomeNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [currentUser]);

  useEffect(() => {
    if (isFullScreen) {
      setNotificationNotice('');
    }
  }, [isFullScreen]);

  useEffect(() => {
    if (!appAlert) return;
    const timer = window.setTimeout(() => setAppAlert(null), 3500);
    return () => window.clearTimeout(timer);
  }, [appAlert]);

  useEffect(() => {
    if (!currentUser) {
      setUnreadNotificationCount(0);
      setNotifications([]);
      setNotificationsOpen(false);
      setNotificationsRender(false);
      setRepliedNotificationMap({});
      setNotificationNotice('');
      lastUnreadCountRef.current = null;
      return;
    }

    let isMounted = true;
    let noticeTimer: number | undefined;

    const loadNotifications = async () => {
      try {
        const list = await notificationService.list();
        if (!isMounted) return;

        const unreadCount = list.filter((item) => !item.readAt).length;
        const previousCount = lastUnreadCountRef.current;
        setNotifications(list);
        setUnreadNotificationCount(unreadCount);

        const shouldShowNotice = !isFullScreen && unreadCount > 0 && (previousCount === null || unreadCount > previousCount);
        if (shouldShowNotice) {
          setNotificationNotice(`Você tem ${unreadCount} notificação(ões) pendente(s).`);
          if (noticeTimer) window.clearTimeout(noticeTimer);
          noticeTimer = window.setTimeout(() => setNotificationNotice(''), 4000);
        }

        lastUnreadCountRef.current = unreadCount;
      } catch (error) {
        console.error('Erro ao carregar notificações:', error);
      }
    };

    loadNotifications();
    const pollTimer = window.setInterval(loadNotifications, 20000);

    return () => {
      isMounted = false;
      if (noticeTimer) window.clearTimeout(noticeTimer);
      window.clearInterval(pollTimer);
    };
  }, [currentUser, isFullScreen]);

  useEffect(() => {
    if (!currentUser) return;
    try {
      const raw = window.localStorage.getItem(`dashEducacao:repliedNotifications:${currentUser.id}`);
      setRepliedNotificationMap(raw ? JSON.parse(raw) : {});
    } catch (_error) {
      setRepliedNotificationMap({});
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) return;
    const stream = new EventSource('/api/events', { withCredentials: true });

    const onNotification = (event: Event) => {
      try {
        const parsed = JSON.parse((event as MessageEvent).data || '{}');
        const incoming: NotificationItem = {
          id: `sse-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          userId: currentUser.id,
          title: String(parsed.title || 'Notificação'),
          message: String(parsed.message || ''),
          kind: 'info',
          relatedEntity: parsed.relatedEntity || null,
          relatedId: parsed.relatedId || null,
          readAt: null,
          createdAt: new Date().toISOString(),
        };
        setNotifications((prev) => [incoming, ...prev]);
        setUnreadNotificationCount((prev) => prev + 1);
      } catch (_error) {
        // Ignore payload inválido para evitar quebra do stream.
      }
    };

    stream.addEventListener('notification:new', onNotification);
    stream.onerror = () => {
      stream.close();
    };

    return () => {
      stream.removeEventListener('notification:new', onNotification);
      stream.close();
    };
  }, [currentUser]);

  useEffect(() => {
    if (!notificationsRender) return;
    const onClickOutside = (event: MouseEvent) => {
      if (!notificationsPanelRef.current) return;
      const target = event.target as Node;
      if (!notificationsPanelRef.current.contains(target)) {
        setNotificationsOpen(false);
        if (notificationsCloseTimerRef.current) window.clearTimeout(notificationsCloseTimerRef.current);
        notificationsCloseTimerRef.current = window.setTimeout(() => setNotificationsRender(false), 180);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [notificationsRender]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const onEsc = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setNotificationsOpen(false);
      if (notificationsCloseTimerRef.current) window.clearTimeout(notificationsCloseTimerRef.current);
      notificationsCloseTimerRef.current = window.setTimeout(() => setNotificationsRender(false), 180);
    };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [notificationsOpen]);

  useEffect(() => {
    return () => {
      if (notificationsCloseTimerRef.current) window.clearTimeout(notificationsCloseTimerRef.current);
    };
  }, []);

  const handleMarkNotificationRead = async (notificationId: string) => {
    try {
      await notificationService.markRead(notificationId);
      setNotifications((prev) =>
        prev.map((item) => (item.id === notificationId ? { ...item, readAt: new Date().toISOString() } : item))
      );
      setUnreadNotificationCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Erro ao marcar notificação como lida:', error);
      setAppAlert({ kind: 'error', text: 'Não foi possível marcar a notificação como lida.' });
    }
  };

  const handleReplyNotification = async (notification: NotificationItem) => {
    const text = (notificationReplyMap[notification.id] || '').trim();
    if (!text) return;
    if (notification.relatedEntity !== 'task' || !notification.relatedId) {
      setAppAlert({ kind: 'warning', text: 'Só é possível responder notificações vinculadas a atividades.' });
      return;
    }
    try {
      await taskService.addComment(notification.relatedId, text);
      setNotificationReplyMap((prev) => ({ ...prev, [notification.id]: '' }));
      setRepliedNotificationMap((prev) => {
        const next = { ...prev, [notification.id]: true };
        if (currentUser) {
          window.localStorage.setItem(`dashEducacao:repliedNotifications:${currentUser.id}`, JSON.stringify(next));
        }
        return next;
      });
      await handleMarkNotificationRead(notification.id);
      setNotificationNotice('Resposta enviada no chat da atividade.');
      window.setTimeout(() => setNotificationNotice(''), 3000);
    } catch (error) {
      console.error('Erro ao responder notificação:', error);
      setAppAlert({ kind: 'error', text: 'Não foi possível enviar a resposta da notificação.' });
    }
  };

  const handleGlobalSearchNavigate = (item: GlobalSearchItem) => {
    if (item.kind === 'atividade') {
      setActiveTab('atividades');
    } else if (item.kind === 'equipe') {
      setActiveTab('equipe');
    } else if (item.kind === 'usuario') {
      if (canManageUsers) setActiveTab('usuarios');
    } else if (item.kind === 'notificacao') {
      if (notificationsCloseTimerRef.current) window.clearTimeout(notificationsCloseTimerRef.current);
      setNotificationsRender(true);
      window.requestAnimationFrame(() => setNotificationsOpen(true));
    } else {
      setActiveTab('historico');
    }
    setGlobalSearchOpen(false);
  };

  // Auto-refresh a cada 10s para modo TV
  useEffect(() => {
    let refreshTimer: number | undefined;
    if (isFullScreen) {
      refreshTimer = window.setInterval(() => {
        fetchData();
      }, 10000);
    }
    return () => {
      if (refreshTimer) clearInterval(refreshTimer);
    };
  }, [isFullScreen, fetchData]);

  const handleSaveAtendimento = async (data: Omit<Atendimento, 'id' | 'createdAt'>) => {
    if (!canCreateAtendimento) {
      setAppAlert({ kind: 'warning', text: 'Seu perfil não pode registrar atendimento.' });
      return;
    }
    await atendimentoService.create(data);
    setRegisterDraft(emptyAtendimentoDraft);
    await fetchData();
    setSuccessNotice('Atendimento registrado com sucesso.');
    window.setTimeout(() => setSuccessNotice(''), 3500);
  };

  const handleUpdateAtendimento = async (data: Omit<Atendimento, 'id' | 'createdAt'>) => {
    if (!editingAtendimento) return;
    await atendimentoService.update(editingAtendimento.id, data);
    setEditingAtendimento(null);
    await fetchData();
    setSuccessNotice('Atendimento atualizado com sucesso.');
    window.setTimeout(() => setSuccessNotice(''), 3500);
  };

  const handleDeleteAtendimento = async (id: string) => {
    if (!canDeleteAtendimento) {
      setAppAlert({ kind: 'warning', text: 'Seu perfil não pode excluir atendimento.' });
      return;
    }
    await atendimentoService.remove(id);
    if (selectedAtendimento?.id === id) setSelectedAtendimento(null);
    await fetchData();
  };

  const handleLogout = async () => {
    await authService.logout();
    navigate('/login', { replace: true });
  };
  const closeAbout = () => {
    setShowAbout(false);
    setWelcomeNotice('');
  };

  const buildReportHtml = (records: Atendimento[], title: string, periodLabel: string, filterLabel: string) => {
    const responsavelCount: Record<string, number> = {};
    records.forEach((item) => {
      splitCompositeValues(item.responsavel).forEach((name) => {
        responsavelCount[name] = (responsavelCount[name] || 0) + 1;
      });
    });
    const ranking = Object.entries(responsavelCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, total]) => `<li><strong>${name}</strong>: ${total}</li>`)
      .join('');

    const rows = records
      .map(
        (item) => `
        <tr>
          <td>${new Date(item.data + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
          <td>${item.turno}</td>
          <td>${item.responsavel}</td>
          <td>${item.local}</td>
          <td>${item.departamento}</td>
          <td>${item.atividade}</td>
        </tr>
      `
      )
      .join('');

    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { font-family: 'Segoe UI', sans-serif; margin: 24px; color: #0F5132; }
    h1, h2 { margin: 0 0 12px 0; }
    .meta { margin-bottom: 16px; font-size: 14px; }
    .cards { display: grid; grid-template-columns: repeat(3, minmax(120px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .card { border: 1px solid #cdebd9; border-radius: 10px; padding: 10px; background: #f5fbf7; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid #dcefe4; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #edf8f2; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta"><strong>Período:</strong> ${periodLabel} | <strong>Emitido em:</strong> ${new Date().toLocaleString('pt-BR')}</div>
  <div class="meta"><strong>Filtros:</strong> ${filterLabel}</div>
  <div class="cards">
    <div class="card"><strong>Total</strong><br/>${records.length}</div>
    <div class="card"><strong>Responsáveis</strong><br/>${Object.keys(responsavelCount).length}</div>
    <div class="card"><strong>Ranking (Top 10)</strong><ol>${ranking || '<li>Sem dados</li>'}</ol></div>
  </div>
  <h2>Detalhamento</h2>
  <table>
    <thead>
      <tr>
        <th>Data</th><th>Turno</th><th>Responsável</th><th>Local</th><th>Departamento</th><th>Atividade</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
  };

  const downloadFile = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const reportRecords = useMemo(() => {
    const normalize = (value: string) => value.toLowerCase().trim();
    const byPeriod = atendimentos.filter((item) => {
      if (reportScope === 'dia') return item.data === reportDay;
      if (reportScope === 'mes') return item.data.startsWith(reportMonth);
      if (reportScope === 'ano') return item.data.startsWith(reportYear);
      return true;
    });

    return byPeriod.filter((item) => {
      const responsavelMatch =
        !reportFilters.responsavel.trim() ||
        splitCompositeValues(item.responsavel).some((v) =>
          normalize(v).includes(normalize(reportFilters.responsavel))
        );
      const localMatch =
        !reportFilters.local.trim() ||
        splitCompositeValues(item.local).some((v) =>
          normalize(v).includes(normalize(reportFilters.local))
        );
      const departamentoMatch =
        !reportFilters.departamento.trim() ||
        splitCompositeValues(item.departamento).some((v) =>
          normalize(v).includes(normalize(reportFilters.departamento))
        );
      const atividadeMatch =
        !reportFilters.atividade.trim() ||
        splitCompositeValues(item.atividade).some((v) =>
          normalize(v).includes(normalize(reportFilters.atividade))
        );
      const turnoMatch =
        !reportFilters.turno.trim() ||
        normalize(item.turno) === normalize(reportFilters.turno);

      return responsavelMatch && localMatch && departamentoMatch && atividadeMatch && turnoMatch;
    });
  }, [atendimentos, reportScope, reportDay, reportMonth, reportYear, reportFilters]);

  const exportReport = (format: 'html' | 'pdf') => {
    const records = reportRecords;
    if (records.length === 0) {
      setAppAlert({ kind: 'warning', text: 'Não há atendimentos para o período selecionado.' });
      return;
    }
    const title =
      reportScope === 'dia'
        ? 'Relatório Diário de Atendimentos'
        : reportScope === 'mes'
          ? 'Relatório Mensal de Atendimentos'
          : reportScope === 'ano'
            ? 'Relatório Anual de Atendimentos'
            : 'Relatório Geral de Atendimentos';
    const periodLabel =
      reportScope === 'dia' ? reportDay : reportScope === 'mes' ? reportMonth : reportScope === 'ano' ? reportYear : 'Geral';
    const filterLabel = [
      reportFilters.responsavel ? `Responsável: ${reportFilters.responsavel}` : '',
      reportFilters.local ? `Local: ${reportFilters.local}` : '',
      reportFilters.departamento ? `Depto: ${reportFilters.departamento}` : '',
      reportFilters.atividade ? `Atividade: ${reportFilters.atividade}` : '',
      reportFilters.turno ? `Turno: ${reportFilters.turno}` : '',
    ]
      .filter(Boolean)
      .join(' | ') || 'Sem filtros adicionais';
    const html = buildReportHtml(records, title, periodLabel, filterLabel);

    if (format === 'html') {
      downloadFile(`relatorio-${reportScope}-${periodLabel}.html`, html, 'text/html;charset=utf-8');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=1000,height=700');
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 350);
  };

  const exportBackup = (type: 'mensal' | 'quinzenal-1' | 'quinzenal-2') => {
    const monthRecords = atendimentos.filter((item) => item.data.startsWith(reportMonth));
    const records =
      type === 'mensal'
        ? monthRecords
        : monthRecords.filter((item) => {
            const day = Number(item.data.slice(8, 10));
            return type === 'quinzenal-1' ? day <= 15 : day >= 16;
          });

    if (records.length === 0) {
      setAppAlert({ kind: 'warning', text: 'Não há dados para gerar backup neste período.' });
      return;
    }

    const payload = {
      generatedAt: new Date().toISOString(),
      period: reportMonth,
      mode: type,
      total: records.length,
      atendimentos: records,
    };

    downloadFile(`backup-${type}-${reportMonth}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
  };

  const filteredAtendimentos = useMemo(() => {
    const normalize = (value: string) => value.toLowerCase().trim();
    return atendimentos.filter((a) => {
      const localList = splitCompositeValues(a.local);
      const deptoList = splitCompositeValues(a.departamento);
      const responsavelList = splitCompositeValues(a.responsavel);
      const filterLocal = normalize(filters.local);
      const filterDepto = normalize(filters.departamento);
      const filterResponsavel = normalize(filters.responsavel);

      return (
        (filters.data === '' || a.data === filters.data) &&
        (filterLocal === '' || localList.some((item) => normalize(item).includes(filterLocal))) &&
        (filterDepto === '' || deptoList.some((item) => normalize(item).includes(filterDepto))) &&
        (filterResponsavel === '' || responsavelList.some((item) => normalize(item).includes(filterResponsavel)))
      );
    });
  }, [atendimentos, filters]);

  const timeStats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const monthStr = todayStr.substring(0, 7);
    const yearStr = todayStr.substring(0, 4);
    return {
      hoje: atendimentos.filter(a => a.data === todayStr).length,
      mes: atendimentos.filter(a => a.data.startsWith(monthStr)).length,
      ano: atendimentos.filter(a => a.data.startsWith(yearStr)).length,
      total: atendimentos.length
    };
  }, [atendimentos]);

  const turnosData = useMemo(() => {
    const counts: Record<string, number> = {};
    atendimentos.forEach(a => counts[a.turno] = (counts[a.turno] || 0) + 1);
    return Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
  }, [atendimentos]);

  const responsavelData = useMemo(() => {
    const counts: Record<string, number> = {};
    atendimentos.forEach((a) => {
      splitCompositeValues(a.responsavel).forEach((item) => {
        counts[item] = (counts[item] || 0) + 1;
      });
    });
    return Object.entries(counts).sort(([, a], [, b]) => b - a).map(([name, value]) => ({
      name,
      shortName: name.trim().split(/\s+/)[0] || name,
      value,
    }));
  }, [atendimentos]);
  const topResponsavelData = useMemo(() => responsavelData.slice(0, 5), [responsavelData]);

  const deptoData = useMemo(() => {
    const counts: Record<string, number> = {};
    atendimentos.forEach((a) => {
      splitCompositeValues(a.departamento).forEach((item) => {
        counts[item] = (counts[item] || 0) + 1;
      });
    });
    return Object.keys(counts).map((key) => ({ name: key, value: counts[key] }));
  }, [atendimentos]);

  const chartColors = darkMode ? DARK_COLORS : LIGHT_COLORS;
  const logoSrc = darkMode ? '/sect-branco.png' : '/sect.png';
  const footerLogoSrc = darkMode ? '/LOGO-BRANCA.png' : '/logo-prefeitura.PNG';
  const sidebarVisible = !isFullScreen;
  const footerVisible = !isFullScreen;
  const shouldDockSidebar = sidebarVisible && viewportWidth >= 920;
  const panelSidebarWidth = viewportWidth >= 1536 ? '19rem' : viewportWidth >= 1280 ? '17rem' : viewportWidth >= 920 ? '15rem' : 'min(88vw, 22rem)';
  const dockedSidebarWidth = shouldDockSidebar && isSidebarOpen ? panelSidebarWidth : '0px';
  const handleSidebarTabClick = (tab: AppTab) => {
    setActiveTab(tab);
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  };
  const navItems = [
    { key: 'dashboard' as AppTab, label: 'Dashboard', icon: FiGrid, visible: true },
    { key: 'registrar' as AppTab, label: 'Registrar Atendimento', icon: FiEdit3, visible: canCreateAtendimento },
    { key: 'historico' as AppTab, label: 'Histórico Geral', icon: FiClock, visible: true },
    { key: 'atividades' as AppTab, label: 'Atividades', icon: FiCalendar, visible: !!currentUser },
    { key: 'equipe' as AppTab, label: 'Equipe', icon: FiUsers, visible: canManageSecretary },
    { key: 'secretaria' as AppTab, label: 'Painel da Secretaria', icon: FiCheckSquare, visible: canManageSecretary },
    { key: 'usuarios' as AppTab, label: 'Usuários', icon: FiUserCheck, visible: canManageUsers },
    { key: 'auditoria' as AppTab, label: 'Auditoria', icon: FiSliders, visible: canViewAudit },
    { key: 'relatorios' as AppTab, label: 'Relatórios', icon: FiFileText, visible: !!currentUser },
    { key: 'configuracoes' as AppTab, label: 'Configurações', icon: FiSettings, visible: !!currentUser },
  ].filter((item) => item.visible);

  // Tamanhos de fonte dinâmicos para Modo TV
  const headingSize = isFullScreen ? 'text-4xl' : 'text-2xl';
  const labelSize = isFullScreen ? 'text-xl' : 'text-sm';

  if (loading && atendimentos.length === 0) {
    return (
      <div className={`flex items-center justify-center min-h-screen ${darkMode ? 'bg-[#0B2016]' : 'bg-[#E9F5EE]'}`}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-[#1E8449] border-t-transparent rounded-full animate-spin"></div>
          <p className="font-bold text-[#1E8449] uppercase tracking-widest">Sincronizando Sistema...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex min-h-screen transition-colors duration-300 ${darkMode ? 'bg-[#0B2016]' : 'bg-[#E9F5EE]'}`}>
      
      {/* Menu Lateral */}
      {sidebarVisible && (
        <aside className={`fixed inset-y-0 left-0 z-50 overflow-y-auto transform transition-transform duration-300 ease-in-out border-r ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${darkMode ? 'bg-[#122D21] border-green-900/40' : 'bg-white border-green-200 shadow-xl'}`} style={{ width: panelSidebarWidth }}>
          <div className="flex flex-col h-full">
            <div className="p-6 border-b border-green-900/10">
              <div className="flex items-center gap-3">
                
                <img src={logoSrc} alt="Secretaria de Educação, Ciência e Tecnologia" className="h-10 w-auto object-contain" />
              </div>
              {currentUser && (
                <div className={`mt-4 rounded-xl border px-3 py-2 ${darkMode ? 'border-[#1E4D36] bg-[#0B2016]' : 'border-green-200 bg-green-50'}`}>
                  <p className={`text-xs font-black uppercase tracking-widest ${darkMode ? 'text-green-400' : 'text-[#1E8449]'}`}>Usuário logado</p>
                  <p className={`text-sm font-bold truncate ${darkMode ? 'text-white' : 'text-[#0F5132]'}`}>{currentUser.fullName}</p>
                  <p className={`text-xs font-semibold ${darkMode ? 'text-green-300' : 'text-green-700'}`}>{currentRoleLabel}</p>
                </div>
              )}
            </div>

            <nav className="flex-1 space-y-4 overflow-y-auto p-4">
              <div className="space-y-2">
                <p className={`px-2 text-[10px] font-black uppercase tracking-[0.2em] ${darkMode ? 'text-green-400/80' : 'text-[#1E8449]'}`}>
                  Navegação
                </p>
                {navItems.map((item) => (
                  <SidebarNavItem
                    key={item.key}
                    label={item.label}
                    icon={item.icon}
                    active={activeTab === item.key}
                    darkMode={darkMode}
                    onClick={() => handleSidebarTabClick(item.key)}
                  />
                ))}
              </div>
            </nav>

            <div className="p-4 border-t border-green-900/10">
              <button
                onClick={handleLogout}
                className={`mt-2 w-full px-4 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                  darkMode ? 'bg-red-900/30 text-red-300 hover:bg-red-900/40' : 'bg-red-50 text-red-700 hover:bg-red-100'
                }`}
              >
                <FiLogOut size={16} />
                Sair
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Conteúdo Principal */}
      <main className="flex-1 flex flex-col transition-all duration-300" style={{ paddingLeft: dockedSidebarWidth }}>
        
        {/* Top Bar */}
        <header className={`sticky top-0 z-40 px-6 py-4 flex items-center justify-between border-b transition-colors ${
          darkMode ? 'bg-[#0B2016]/95 border-green-900/40 backdrop-blur-md' : 'bg-[#E9F5EE]/95 border-green-200 backdrop-blur-md'
        }`}>
          <div className="flex items-center gap-4">
            {sidebarVisible && (
              <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className={`p-2 rounded-lg ${darkMode ? 'text-white hover:bg-white/10' : 'text-[#0F5132] hover:bg-green-100'}`}
              >
                <FiMenu size={24} />
              </button>
            )}
            <div className="flex items-center gap-3">
              
              <div className="flex flex-col">
                <h1 className={`${isFullScreen ? 'text-3xl' : 'text-lg'} font-black leading-tight ${darkMode ? 'text-white' : 'text-[#0F5132]'}`}>
                  {activeTab === 'dashboard'
                    ? 'Dashboard de Atendimentos/Atividades'
                    : activeTab === 'registrar'
                      ? 'Cadastro e Padronização'
                      : activeTab === 'historico'
                        ? 'Histórico de Atendimentos'
                        : activeTab === 'atividades'
                          ? 'Painel de Atividades'
                          : activeTab === 'equipe'
                            ? 'Gestão de Equipe'
                          : activeTab === 'secretaria'
                            ? 'Painel Geral da Secretaria'
                        : activeTab === 'usuarios'
                          ? 'Gestão de Usuários'
                        : activeTab === 'auditoria'
                          ? 'Auditoria e Alertas de Segurança'
                        : activeTab === 'padronizacao'
                            ? 'Padronização de Cadastros'
                            : activeTab === 'configuracoes'
                              ? 'Configurações'
                              : 'Relatórios'}
                </h1>
                <p className={`${isFullScreen ? 'text-sm' : 'text-[10px]'} font-bold uppercase tracking-widest ${darkMode ? 'text-green-500' : 'text-[#1E8449]'}`}>
                  Secretaria de Educação, Ciência e Tecnologia
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {!isFullScreen && currentUser && (
              <button
                type="button"
                onClick={() => setGlobalSearchOpen(true)}
                data-testid="global-search-trigger"
                className={`hidden md:inline-flex items-center gap-2 rounded-xl border px-3 py-2 ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-green-200' : 'bg-white border-green-200 text-[#0F5132]'}`}
              >
                <FiSearch className="h-4 w-4 text-[#1E8449]" />
                <span className="text-[11px] font-black uppercase">Busca global</span>
                <span className="rounded bg-black/10 px-1.5 py-0.5 text-[10px] font-black">Ctrl+K</span>
              </button>
            )}
            {!isFullScreen && currentUser && (
              <div className="relative" ref={notificationsPanelRef}>
                <button
                  type="button"
                  onClick={() => {
                    if (notificationsOpen) {
                      setNotificationsOpen(false);
                      if (notificationsCloseTimerRef.current) window.clearTimeout(notificationsCloseTimerRef.current);
                      notificationsCloseTimerRef.current = window.setTimeout(() => setNotificationsRender(false), 180);
                      return;
                    }
                    if (notificationsCloseTimerRef.current) window.clearTimeout(notificationsCloseTimerRef.current);
                    setNotificationsRender(true);
                    window.requestAnimationFrame(() => setNotificationsOpen(true));
                  }}
                  data-testid="notifications-trigger"
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-green-200' : 'bg-white border-green-200 text-[#0F5132]'}`}
                >
                  <FiBell className="h-4 w-4 text-[#1E8449]" />
                  <span className="text-[11px] font-black uppercase">{unreadNotificationCount} pendente(s)</span>
                </button>

                {notificationsRender && (
                  <div className={`absolute right-0 mt-2 w-[360px] max-w-[90vw] rounded-2xl border p-3 shadow-2xl z-50 origin-top-right transition-all duration-200 ease-out ${notificationsOpen ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' : 'opacity-0 -translate-y-1 scale-95 pointer-events-none'} ${darkMode ? 'bg-[#0B2016] border-[#1E4D36] text-white' : 'bg-white border-green-100 text-[#0F5132]'}`}>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-black uppercase">Notificações</p>
                      <button
                        onClick={() => {
                          setNotificationsOpen(false);
                          if (notificationsCloseTimerRef.current) window.clearTimeout(notificationsCloseTimerRef.current);
                          notificationsCloseTimerRef.current = window.setTimeout(() => setNotificationsRender(false), 180);
                        }}
                        className="text-[10px] font-black uppercase opacity-70 hover:opacity-100"
                      >
                        Fechar
                      </button>
                    </div>
                    <div className="max-h-80 space-y-2 overflow-y-auto">
                      {notifications.map((item) => (
                        <div key={item.id} className={`rounded-xl border p-2 ${item.readAt ? 'opacity-70' : ''} ${darkMode ? 'border-[#1E4D36] bg-[#10271b]' : 'border-green-100 bg-green-50/60'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-black uppercase">{item.title}</p>
                            {repliedNotificationMap[item.id] && (
                              <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-black uppercase text-white">
                                Respondida
                              </span>
                            )}
                          </div>
                          <p className="text-xs">{item.message}</p>
                          <p className="mt-1 text-[10px] opacity-70">{new Date(item.createdAt).toLocaleString('pt-BR')}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {!item.readAt && (
                              <button onClick={() => handleMarkNotificationRead(item.id)} className="rounded bg-[#1E8449] px-2 py-1 text-[10px] font-black uppercase text-white">
                                Marcar lida
                              </button>
                            )}
                            {item.relatedEntity === 'task' && item.relatedId && (
                              <>
                                <input
                                  value={notificationReplyMap[item.id] || ''}
                                  onChange={(e) => setNotificationReplyMap((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                  placeholder="Responder atividade..."
                                  className={`flex-1 rounded-lg border px-2 py-1 text-[11px] ${darkMode ? 'bg-[#0B2016] border-[#1E4D36] text-white' : 'bg-white border-green-200 text-[#0F5132]'}`}
                                />
                                <button onClick={() => handleReplyNotification(item)} className="rounded bg-[#145A32] px-2 py-1 text-[10px] font-black uppercase text-white">
                                  Responder
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                      {notifications.length === 0 && <p className="text-xs opacity-70">Sem notificações no momento.</p>}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="text-right hidden md:block">
              <div className={`${isFullScreen ? 'text-5xl' : 'text-2xl'} font-black tabular-nums transition-all ${darkMode ? 'text-white' : 'text-[#0F5132]'}`}>
                {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className={`${isFullScreen ? 'text-base' : 'text-[10px]'} font-bold uppercase ${darkMode ? 'text-green-500' : 'text-green-700'}`}>
                {currentTime.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
              </div>
            </div>
            <button 
              onClick={() => {
                if(!isFullScreen) setActiveTab('dashboard'); 
                setIsFullScreen(!isFullScreen);
              }}
              className={`p-2 rounded-lg transition-all ${darkMode ? 'text-white bg-white/5 hover:bg-white/10' : 'text-[#0F5132] bg-white hover:bg-green-50 border border-green-200 shadow-sm'}`}
              title={isFullScreen ? "Sair da Tela Cheia" : "Modo Monitor / Tela Cheia"}
            >
              {isFullScreen ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
              )}
            </button>
          </div>
        </header>

        {/* Área Principal */}
        <div className={`flex-1 p-3 sm:p-6 lg:p-8 ${isFullScreen ? 'max-w-full' : 'max-w-[1600px] mx-auto w-full'} pb-24`}>
          
          {activeTab === 'registrar' && !isFullScreen && canCreateAtendimento && (
            <div className="max-w-6xl mx-auto py-2 sm:py-6 space-y-6">
              <section className={`p-6 rounded-3xl border shadow-xl ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-100 text-[#0F5132]'}`}>
                <h3 className="text-2xl font-black mb-2">Seleção de Cadastro</h3>
                <p className="text-sm font-semibold opacity-80 mb-4">
                  Use um único lugar para registrar atendimento e padronizar opções oficiais.
                </p>
                <div className="max-w-xl">
                  <div className="relative">
                    <FiSliders className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#1E8449]" />
                    <select
                      value={registerWorkspace}
                      onChange={(event) => setRegisterWorkspace(event.target.value as typeof registerWorkspace)}
                      className={`w-full rounded-xl border px-4 py-3 pl-10 font-black uppercase tracking-wider outline-none focus:ring-2 focus:ring-[#1E8449] ${
                        darkMode
                          ? 'border-[#1E4D36] bg-[#0B2016] text-white'
                          : 'border-green-200 bg-green-50 text-[#0F5132]'
                      }`}
                    >
                      <option value="">Selecionar</option>
                      <option value="atendimento">Cadastrar Atendimento/Atividade</option>
                      <option value="departamento">Departamento</option>
                      <option value="local">Locais</option>
                      <option value="atividade">Atividades</option>
                      <option value="responsavel">Responsáveis</option>
                    </select>
                  </div>
                </div>
              </section>

              {registerWorkspace === 'atendimento' ? (
                <div className="max-w-3xl mx-auto">
                  <AtendimentoForm
                    onSave={handleSaveAtendimento}
                    onClose={() => setActiveTab('dashboard')}
                    isStandalone={true}
                    darkMode={darkMode}
                    initialData={registerDraft}
                    onDraftChange={setRegisterDraft}
                  />
                </div>
              ) : registerWorkspace ? (
                <CatalogOptionsPanel
                  darkMode={darkMode}
                  currentUserRole={currentUser?.role}
                  initialType={registerWorkspace}
                />
              ) : (
                <div className={`rounded-3xl border p-8 text-center font-semibold ${darkMode ? 'border-[#1E4D36] bg-[#122D21] text-green-100' : 'border-green-100 bg-white text-[#0F5132]'}`}>
                  Selecione uma opção acima para continuar.
                </div>
              )}
            </div>
          )}

          {activeTab === 'dashboard' && (
            <div className="space-y-10">
              <div className={`grid grid-cols-1 sm:grid-cols-2 ${isFullScreen ? 'xl:grid-cols-4 gap-12' : 'xl:grid-cols-4 gap-6'}`}>
                <StatCard label="ATENDIMENTOS/ATIVIDADES (DIA)" value={timeStats.hoje} icon={<svg xmlns="http://www.w3.org/2000/svg" className={`${isFullScreen ? 'h-12 w-12' : 'h-8 w-8'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>} darkMode={darkMode} isFullScreen={isFullScreen} />
                <StatCard label="ATENDIMENTOS/ATIVIDADES (MÊS)" value={timeStats.mes} icon={<svg xmlns="http://www.w3.org/2000/svg" className={`${isFullScreen ? 'h-12 w-12' : 'h-8 w-8'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>} darkMode={darkMode} isFullScreen={isFullScreen} />
                <StatCard label="ATENDIMENTOS/ATIVIDADES (ANO)" value={timeStats.ano} icon={<svg xmlns="http://www.w3.org/2000/svg" className={`${isFullScreen ? 'h-12 w-12' : 'h-8 w-8'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>} darkMode={darkMode} isFullScreen={isFullScreen} />
                <StatCard label="TOTAL ATENDIMENTOS/ATIVIDADES" value={timeStats.total} icon={<svg xmlns="http://www.w3.org/2000/svg" className={`${isFullScreen ? 'h-12 w-12' : 'h-8 w-8'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>} darkMode={darkMode} isFullScreen={isFullScreen} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <div className={`p-8 rounded-[2rem] border shadow-xl transition-colors ${darkMode ? 'bg-[#122D21] border-[#1E4D36]' : 'bg-white border-green-100'}`}>
                  <h3 className={`${headingSize} font-black mb-10 flex items-center gap-4 ${darkMode ? 'text-white' : 'text-[#0F5132]'}`}>
                    <div className="w-1.5 h-8 bg-[#1E8449] rounded-full"></div> Ranking por Responsável
                  </h3>
                  <div className={`${isFullScreen ? 'h-[550px]' : 'h-[400px]'} w-full`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topResponsavelData}>
                        <CartesianGrid strokeDasharray="4 4" stroke={darkMode ? "#1E4D36" : "#F0F9F4"} vertical={false} />
                        <XAxis dataKey="shortName" stroke={darkMode ? "#FFF" : "#0F5132"} fontSize={isFullScreen ? 18 : 12} fontWeight="bold" axisLine={false} tickLine={false} interval={0} angle={0} textAnchor="middle" tickMargin={14} />
                        <YAxis stroke={darkMode ? "#FFF" : "#0F5132"} fontSize={isFullScreen ? 18 : 14} fontWeight="bold" axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip 
                          cursor={{ fill: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(15,81,50,0.05)' }}
                          contentStyle={{ backgroundColor: '#0F5132', border: 'none', borderRadius: '12px', padding: '12px' }}
                          labelStyle={{ color: '#FFF', fontWeight: 'bold' }}
                          itemStyle={{ fontSize: isFullScreen ? '24px' : '18px', fontWeight: 'bold', color: '#FFF' }}
                          formatter={(value: number) => [value, 'ATENDIMENTOS/ATIVIDADES']}
                          labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''}
                        />
                        <Bar dataKey="value" name="ATENDIMENTOS/ATIVIDADES" radius={[8, 8, 0, 0]} barSize={isFullScreen ? 100 : 50}>
                          {topResponsavelData.map((entry, index) => <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />)}
                          
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className={`p-8 rounded-[2rem] border shadow-xl transition-colors ${darkMode ? 'bg-[#122D21] border-[#1E4D36]' : 'bg-white border-green-100'}`}>
                  <h3 className={`${headingSize} font-black mb-10 flex items-center gap-4 ${darkMode ? 'text-white' : 'text-[#0F5132]'}`}>
                    <div className="w-1.5 h-8 bg-[#2ECC71] rounded-full"></div> Distribuição por Turno
                  </h3>
                  <div className={`${isFullScreen ? 'h-[550px]' : 'h-[400px]'} w-full`}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={turnosData} cx="50%" cy="50%" innerRadius={isFullScreen ? 140 : 110} outerRadius={isFullScreen ? 220 : 140} paddingAngle={6} dataKey="value" nameKey="name" stroke={darkMode ? "#122D21" : "#FFF"} strokeWidth={3}>
                          {turnosData.map((entry, index) => <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#0F5132', border: 'none', borderRadius: '12px' }} itemStyle={{ fontSize: isFullScreen ? '24px' : '18px', fontWeight: 'bold', color: '#FFF' }} labelStyle={{ color: '#FFF' }} formatter={(value: number) => [value, 'ATENDIMENTOS/ATIVIDADES']} />
                        <Legend verticalAlign="bottom" height={isFullScreen ? 60 : 40} iconSize={isFullScreen ? 24 : 16} wrapperStyle={{ fontSize: isFullScreen ? '18px' : '14px', fontWeight: 'bold', color: darkMode ? '#FFF' : '#0F5132', paddingTop: '20px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
                <div className={`xl:col-span-2 p-8 rounded-[2.5rem] border shadow-xl transition-colors ${darkMode ? 'bg-[#122D21] border-[#1E4D36]' : 'bg-white border-green-100'}`}>
                  <h4 className={`${labelSize} font-bold uppercase tracking-[0.2em] mb-8 ${darkMode ? 'text-green-400' : 'text-[#1E8449]'}`}>Fluxo por Departamento</h4>
                  <div className="space-y-6">
                    {deptoData.slice(0, 5).sort((a,b) => b.value - a.value).map((d) => (
                      <div key={d.name} className="flex items-center justify-between">
                        <span className={`${isFullScreen ? 'text-3xl' : 'text-xl'} font-bold w-64 truncate ${darkMode ? 'text-white' : 'text-[#0F5132]'}`}>{d.name}</span>
                        <div className={`flex-1 mx-6 h-6 rounded-full overflow-hidden border ${darkMode ? 'bg-green-950/40 border-[#1E4D36]' : 'bg-green-50 border-green-100'}`}>
                          <div className="h-full bg-gradient-to-r from-[#1E8449] to-[#2ECC71] rounded-full transition-all duration-1000 shadow-sm" style={{ width: `${(d.value / Math.max(...deptoData.map(x => x.value))) * 100}%` }} />
                        </div>
                        <span className={`${isFullScreen ? 'text-4xl' : 'text-2xl'} font-black tabular-nums ${darkMode ? 'text-white' : 'text-[#0F5132]'}`}>{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Ajustado: Card de Tempo Real agora segue o tema light corretamente */}
                <div className={`p-8 rounded-[2.5rem] border shadow-2xl transition-all ${
                  darkMode 
                    ? 'bg-green-900/40 border-green-500/30 text-white' 
                    : 'bg-white border-green-200 text-[#0F5132]'
                }`}>
                  <h4 className={`${darkMode ? 'text-green-300' : 'text-[#1E8449]'} font-bold uppercase tracking-[0.2em] text-xs mb-6 flex items-center gap-2`}>
                    <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"></div> TEMPO REAL
                  </h4>
                  {atendimentos[0] ? (
                    <div className="space-y-6">
                      <div className="flex flex-col gap-1">
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${darkMode ? 'opacity-60' : 'text-gray-400'}`}>Horário do Registro</span>
                        <span className={`${isFullScreen ? 'text-3xl' : 'text-xl'} font-black tabular-nums`}>{new Date(atendimentos[0].createdAt).toLocaleTimeString()}</span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className={`text-[10px] font-bold uppercase tracking-widest ${darkMode ? 'opacity-60' : 'text-gray-400'}`}>Responsável</span>
                        <span className={`${isFullScreen ? 'text-2xl' : 'text-base'} font-bold px-4 py-2 rounded-xl border ${
                            darkMode
                              ? 'bg-green-950/60 border-green-700'
                              : 'bg-green-50 border-green-100'
                          }`}>{atendimentos[0].responsavel}</span>
                      </div>
                      <div className={`space-y-4 pt-4 border-t ${darkMode ? 'border-white/10' : 'border-green-100'}`}>
                        <div className="flex flex-col gap-1">
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${darkMode ? 'opacity-60' : 'text-gray-400'}`}>Local</span>
                          <span className={`${isFullScreen ? 'text-2xl' : 'text-base'} font-bold px-4 py-2 rounded-xl border ${
                            darkMode 
                              ? 'bg-green-950/60 border-green-700' 
                              : 'bg-green-50 border-green-100'
                          }`}>{atendimentos[0].local}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${darkMode ? 'opacity-60' : 'text-gray-400'}`}>Setor</span>
                          <span className={`${isFullScreen ? 'text-2xl' : 'text-base'} font-bold px-4 py-2 rounded-xl border ${
                            darkMode 
                              ? 'bg-green-950/60 border-green-700' 
                              : 'bg-green-50 border-green-100'
                          }`}>{atendimentos[0].departamento}</span>
                        </div>
                      </div>
                    </div>
                  ) : <p className={`${darkMode ? 'text-green-400' : 'text-[#1E8449]'} font-bold italic`}>Sincronizando registros...</p>}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'relatorios' && !isFullScreen && currentUser && (
            <div className={`p-4 sm:p-8 rounded-3xl border shadow-xl transition-colors ${darkMode ? 'bg-[#122D21] border-[#1E4D36]' : 'bg-white border-green-100'}`}>
              <h3 className={`text-2xl font-black uppercase tracking-tight mb-6 ${darkMode ? 'text-white' : 'text-[#0F5132]'}`}>Relatórios</h3>
              <div className={`rounded-2xl border p-4 ${darkMode ? 'border-[#1E4D36] bg-[#0B2016]' : 'border-green-100 bg-green-50/40'}`}>
                <p className={`text-sm mb-4 ${darkMode ? 'text-green-200' : 'text-[#0F5132]'}`}>
                  Gere relatórios com filtros avançados em HTML ou PDF.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 mb-3">
                  <select value={reportScope} onChange={(e) => setReportScope(e.target.value as typeof reportScope)} className={`px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-200 text-[#0F5132]'}`}>
                    <option value="geral">Período: Geral</option>
                    <option value="dia">Período: Dia</option>
                    <option value="mes">Período: Mês</option>
                    <option value="ano">Período: Ano</option>
                  </select>
                  {reportScope === 'dia' && (
                    <input type="date" value={reportDay} onChange={(e) => setReportDay(e.target.value)} className={`px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-200 text-[#0F5132]'}`} />
                  )}
                  {reportScope === 'mes' && (
                    <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} className={`px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-200 text-[#0F5132]'}`} />
                  )}
                  {reportScope === 'ano' && (
                    <input type="number" min={2000} max={9999} value={reportYear} onChange={(e) => setReportYear(e.target.value.slice(0, 4))} className={`w-full px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-200 text-[#0F5132]'}`} />
                  )}
                  <select value={reportFilters.turno} onChange={(e) => setReportFilters((prev) => ({ ...prev, turno: e.target.value }))} className={`px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-200 text-[#0F5132]'}`}>
                    <option value="">Turno: Todos</option>
                    <option value={Turno.MANHA}>{Turno.MANHA}</option>
                    <option value={Turno.TARDE}>{Turno.TARDE}</option>
                    <option value={Turno.NOITE}>{Turno.NOITE}</option>
                  </select>
                  <input list="report-responsaveis" value={reportFilters.responsavel} onChange={(e) => setReportFilters((prev) => ({ ...prev, responsavel: e.target.value }))} placeholder="Responsável" className={`px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-200 text-[#0F5132]'}`} />
                  <datalist id="report-responsaveis">{responsaveis.map((v) => <option key={v} value={v} />)}</datalist>
                  <input list="report-locais" value={reportFilters.local} onChange={(e) => setReportFilters((prev) => ({ ...prev, local: e.target.value }))} placeholder="Local" className={`px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-200 text-[#0F5132]'}`} />
                  <datalist id="report-locais">{reportLocais.map((v) => <option key={v} value={v} />)}</datalist>
                  <input list="report-departamentos" value={reportFilters.departamento} onChange={(e) => setReportFilters((prev) => ({ ...prev, departamento: e.target.value }))} placeholder="Departamento" className={`px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-200 text-[#0F5132]'}`} />
                  <datalist id="report-departamentos">{reportDepartamentos.map((v) => <option key={v} value={v} />)}</datalist>
                  <input list="report-atividades" value={reportFilters.atividade} onChange={(e) => setReportFilters((prev) => ({ ...prev, atividade: e.target.value }))} placeholder="Atividade" className={`px-3 py-2 rounded-xl border text-sm ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-200 text-[#0F5132]'}`} />
                  <datalist id="report-atividades">{reportAtividades.map((v) => <option key={v} value={v} />)}</datalist>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <button onClick={() => exportReport('html')} className="px-3 py-2 rounded-lg bg-[#1E8449] text-white text-xs font-black uppercase">Exportar HTML</button>
                  <button onClick={() => exportReport('pdf')} className="px-3 py-2 rounded-lg bg-[#145A32] text-white text-xs font-black uppercase">Exportar PDF</button>
                  <button
                    onClick={() =>
                      setReportFilters({
                        responsavel: '',
                        local: '',
                        departamento: '',
                        atividade: '',
                        turno: '',
                      })
                    }
                    className="px-3 py-2 rounded-lg border border-red-300 text-red-700 text-xs font-black uppercase"
                  >
                    Limpar filtros
                  </button>
                  <span className={`text-xs font-bold ${darkMode ? 'text-green-300' : 'text-[#1E8449]'}`}>
                    {reportRecords.length} registro(s) no resultado
                  </span>
                </div>
              </div>
              <div className={`rounded-2xl border p-4 mt-4 ${darkMode ? 'border-[#1E4D36] bg-[#0B2016]' : 'border-green-100 bg-white'}`}>
                <h4 className={`text-sm font-black uppercase tracking-widest mb-2 ${darkMode ? 'text-green-300' : 'text-[#1E8449]'}`}>Backup padronizado</h4>
                <p className={`text-sm ${darkMode ? 'text-green-100' : 'text-[#0F5132]'}`}>
                  Padrão atual: backup operacional em arquivo JSON com execução mensal. Para quinzena, usar duas janelas fixas (1-15 e 16-fim) na estratégia de infraestrutura.
                </p>
                <p className={`text-xs mt-2 ${darkMode ? 'text-green-400' : 'text-green-700'}`}>
                  Recomenda-se automatizar em armazenamento externo (S3, Blob ou similar) com retenção mínima de 6 meses.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => exportBackup('mensal')} className="px-3 py-2 rounded-lg border border-green-300 text-xs font-black uppercase">Backup mensal (JSON)</button>
                  <button onClick={() => exportBackup('quinzenal-1')} className="px-3 py-2 rounded-lg border border-green-300 text-xs font-black uppercase">Backup 1ª quinzena</button>
                  <button onClick={() => exportBackup('quinzenal-2')} className="px-3 py-2 rounded-lg border border-green-300 text-xs font-black uppercase">Backup 2ª quinzena</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'historico' && !isFullScreen && (
            <div className={`p-4 sm:p-8 rounded-3xl border shadow-xl transition-colors ${darkMode ? 'bg-[#122D21] border-[#1E4D36]' : 'bg-white border-green-100'}`}>
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
                <h3 className={`text-2xl font-black uppercase tracking-tight ${darkMode ? 'text-white' : 'text-[#0F5132]'}`}>Histórico de Gestão</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 w-full md:w-auto items-end">
                   <div className="flex flex-col gap-1 relative">
                     <span className={`text-[10px] font-bold uppercase ${darkMode ? 'text-green-500' : 'text-[#1E8449]'}`}>Filtrar Data</span>
                     <input id="filter_data" type="date" value={filters.data} onChange={(e) => {
                       const value = e.target.value;
                       const [year, rest] = value.split('-', 2);
                       if (year && year.length > 4) {
                         const normalized = `${year.slice(0, 4)}${rest ? `-${rest}` : ''}`;
                         setFilters({...filters, data: normalized});
                         return;
                       }
                       setFilters({...filters, data: value});
                     }} max="9999-12-31" className={`px-4 py-2 rounded-xl border text-sm outline-none transition-all pr-10 ${darkMode ? 'bg-[#0B2016] border-[#1E4D36] text-white' : 'bg-green-50 border-green-100'}`} />
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute right-3 top-1/2 transform -translate-y-1/2 cursor-pointer calendar-icon" onClick={() => {
                       const el = document.getElementById('filter_data') as HTMLInputElement | null;
                       if (!el) return; if (typeof (el as any).showPicker === 'function') { try { (el as any).showPicker(); return; } catch {} } el.focus();
                     }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                     </svg>
                   </div>
                   <div className="flex flex-col gap-1">
                     <span className={`text-[10px] font-bold uppercase ${darkMode ? 'text-green-500' : 'text-[#1E8449]'}`}>Local</span>
                     <input list="locais" type="text" placeholder="Local..." value={filters.local} onChange={(e) => setFilters({...filters, local: e.target.value})} className={`px-4 py-2 rounded-xl border text-sm outline-none transition-all ${darkMode ? 'bg-[#0B2016] border-[#1E4D36] text-white' : 'bg-green-50 border-green-100'}`} />
                     <datalist id="locais">
                       {locais.map(l => <option key={l} value={l} />)}
                     </datalist>
                   </div>
                   <div className="flex flex-col gap-1">
                     <span className={`text-[10px] font-bold uppercase ${darkMode ? 'text-green-500' : 'text-[#1E8449]'}`}>Departamento</span>
                     <input list="departamentos" type="text" placeholder="Depto..." value={filters.departamento} onChange={(e) => setFilters({...filters, departamento: e.target.value})} className={`px-4 py-2 rounded-xl border text-sm outline-none transition-all ${darkMode ? 'bg-[#0B2016] border-[#1E4D36] text-white' : 'bg-green-50 border-green-100'}`} />
                     <datalist id="departamentos">
                       {departamentos.map(d => <option key={d} value={d} />)}
                     </datalist>
                   </div>
                   <div className="flex flex-col gap-1">
                     <span className={`text-[10px] font-bold uppercase ${darkMode ? 'text-green-500' : 'text-[#1E8449]'}`}>Responsável</span>
                     <input list="responsaveis" type="text" placeholder="Nome..." value={filters.responsavel} onChange={(e) => setFilters({...filters, responsavel: e.target.value})} className={`px-4 py-2 rounded-xl border text-sm outline-none transition-all ${darkMode ? 'bg-[#0B2016] border-[#1E4D36] text-white' : 'bg-green-50 border-green-100'}`} />
                     <datalist id="responsaveis">
                       {responsaveis.map(r => <option key={r} value={r} />)}
                     </datalist>
                   </div>
                    <button onClick={() => setFilters({data:'', local:'', departamento:'', responsavel:''})} className="px-4 py-2 bg-red-500 text-white font-bold rounded-xl text-xs uppercase transition-all hover:bg-red-600 shadow-lg shadow-red-500/20 w-full">Limpar</button>
                 </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-green-200">
                <table className="w-full min-w-[860px] border-collapse">
                  <thead>
                    <tr className={`border-b-2 ${darkMode ? 'border-green-900/40 text-green-400 bg-green-950/20' : 'border-green-100 text-[#1E8449] bg-green-50'}`}>
                      <th className="text-left py-4 px-6 font-black uppercase text-xs tracking-widest">Data</th>
                      <th className="text-left py-4 px-6 font-black uppercase text-xs tracking-widest">Responsável</th>
                      <th className="text-left py-4 px-6 font-black uppercase text-xs tracking-widest">Local</th>
                      <th className="text-left py-4 px-6 font-black uppercase text-xs tracking-widest">Departamento</th>
                      <th className="text-left py-4 px-6 font-black uppercase text-xs tracking-widest">Turno</th>
                      <th className="text-left py-4 px-6 font-black uppercase text-xs tracking-widest">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-green-900/10">
                    {filteredAtendimentos.length > 0 ? filteredAtendimentos.map(a => (
                      <tr key={a.id} className={`transition-colors ${darkMode ? 'hover:bg-white/5 text-white' : 'hover:bg-green-50 text-[#0F5132]'}`}>
                        <td className="py-4 px-6 text-sm font-bold tabular-nums whitespace-nowrap">{new Date(a.data + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                        <td className="py-4 px-6 text-sm font-black uppercase tracking-tight">{a.responsavel}</td>
                        <td className="py-4 px-6 text-sm font-medium">{a.local}</td>
                        <td className="py-4 px-6 text-sm font-medium">{a.departamento}</td>
                        <td className="py-4 px-6">
                          <span className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm border ${
                            a.turno === Turno.MANHA ? 'bg-green-100 text-green-800 border-green-200' : 
                            a.turno === Turno.TARDE ? 'bg-green-50 text-green-800 border-green-100' : 'bg-green-200 text-green-900 border-green-300'
                          }`}>{a.turno}</span>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                            <button onClick={() => setSelectedAtendimento(a)} className="px-3 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors">Ver</button>
                            {canEditAtendimento && (
                              <button onClick={() => setEditingAtendimento(a)} className="px-3 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors">Editar</button>
                            )}
                            {canDeleteAtendimento && (
                              <button onClick={() => setAtendimentoToDelete(a)} className="px-3 py-1 rounded-lg text-xs font-bold bg-red-100 text-red-800 hover:bg-red-200 transition-colors">Excluir</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={6} className="py-20 text-center font-bold text-gray-400 uppercase tracking-[0.2em] italic">Nenhum registro encontrado...</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'atividades' && !isFullScreen && currentUser && (
            <TasksPanel darkMode={darkMode} currentUser={currentUser} isSecretaryUser={isSecretaryUser} />
          )}

          {activeTab === 'equipe' && !isFullScreen && canManageSecretary && (
            <SecretaryPanel darkMode={darkMode} mode="team" currentUser={currentUser} />
          )}

          {activeTab === 'secretaria' && !isFullScreen && canManageSecretary && (
            <SecretaryPanel darkMode={darkMode} mode="full" currentUser={currentUser} />
          )}

          {activeTab === 'usuarios' && !isFullScreen && canManageUsers && (
            <AdminUsersPanel
              darkMode={darkMode}
              currentUserRole={(normalizedCurrentRole || undefined) as AuthUser['role'] | undefined}
              currentUserId={currentUser?.id}
              isSecretaryUser={isSecretaryUser}
              focusUserId={focusUserIdInAdmin}
              onFocusHandled={() => setFocusUserIdInAdmin(null)}
            />
          )}
          {activeTab === 'auditoria' && !isFullScreen && canViewAudit && (
            <AuditPanel
              darkMode={darkMode}
              onOpenUser={(userId) => {
                if (!canManageUsers) return;
                setFocusUserIdInAdmin(userId);
                setActiveTab('usuarios');
              }}
            />
          )}
          {activeTab === 'configuracoes' && !isFullScreen && currentUser && (
            <SettingsScreen darkMode={darkMode} currentUser={currentUser} onToggleDarkMode={setDarkMode} />
          )}
        </div>

        {/* Rodapé Reduzido */}
        {footerVisible && (
          <footer
            className={`fixed bottom-0 right-0 z-40 border-t px-6 py-3 flex flex-col sm:flex-row items-center justify-between shadow-2xl transition-colors ${
              darkMode ? 'bg-[#0B2016] border-green-900/60' : 'bg-white border-green-100'
            }`}
            style={{ left: dockedSidebarWidth }}
          >
            <div className="flex items-center gap-4">
              <img src={footerLogoSrc} alt="Prefeitura de Toritama" className="w-28 h-auto object-contain" onError={(e) => (e.currentTarget.style.display = 'none')} />
            </div>
            
            <div className="flex items-center gap-6 mt-2 sm:mt-0">
              <span className={`text-[9px] font-bold uppercase tracking-widest hidden lg:block ${darkMode ? 'text-green-500/40' : 'text-gray-400'}`}>
                © 2026 Secretaria de Educação, Ciência e Tecnologia - Toritama/PE
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowAbout(true)} className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded ${darkMode ? 'text-green-500/60 hover:text-green-400 hover:bg-white/5' : 'text-gray-500 hover:text-gray-600 hover:bg-gray-100'} transition-colors`}>
                  Sobre
                </button>
                <span className="bg-[#1E8449] text-white px-3 py-1 rounded-lg text-[10px] font-black shadow-md">v1.1.0</span>
              </div>
            </div>
          </footer>
        )}
      </main>

      {globalSearchOpen && (
        <div className="fixed inset-0 z-[90] bg-black/50 p-4 backdrop-blur-sm" onClick={() => setGlobalSearchOpen(false)}>
          <div
            className={`mx-auto mt-12 w-full max-w-2xl rounded-2xl border p-3 shadow-2xl ${darkMode ? 'bg-[#0B2016] border-[#1E4D36] text-white' : 'bg-white border-green-100 text-[#0F5132]'}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${darkMode ? 'bg-[#122D21] border-[#1E4D36]' : 'bg-green-50 border-green-100'}`}>
              <FiSearch className="h-4 w-4 text-[#1E8449]" />
              <input
                ref={globalSearchInputRef}
                value={globalSearchQuery}
                onChange={(event) => setGlobalSearchQuery(event.target.value)}
                data-testid="global-search-input"
                placeholder="Buscar usuário, equipe, atividade, atendimento ou notificação..."
                className="w-full bg-transparent text-sm outline-none"
              />
              <span className="rounded bg-black/10 px-1.5 py-0.5 text-[10px] font-black uppercase">Esc</span>
            </div>

            <div className="mt-3 max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {globalSearchResults.map((item) => (
                <button
                  key={`${item.kind}:${item.id}`}
                  type="button"
                  onClick={() => handleGlobalSearchNavigate(item)}
                  data-testid={`global-search-result-${item.kind}`}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${darkMode ? 'border-[#1E4D36] bg-[#122D21] hover:bg-[#173826]' : 'border-green-100 bg-green-50/50 hover:bg-green-100/70'}`}
                >
                  <p className="text-xs font-black uppercase">{item.title}</p>
                  <p className="text-xs opacity-80">{item.subtitle}</p>
                  <p className="mt-1 text-[10px] font-black uppercase opacity-70">{item.kind}</p>
                </button>
              ))}
              {globalSearchResults.length === 0 && (
                <p className="rounded-xl border border-dashed p-3 text-xs opacity-75">Nenhum resultado encontrado.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedAtendimento && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setSelectedAtendimento(null)}>
          <div className={`w-full max-w-xl sm:max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl border shadow-2xl p-4 sm:p-6 ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-100 text-[#0F5132]'}`} onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-6 inline-flex items-center gap-2 text-2xl font-black"><FiInfo /> Detalhes do Atendimento</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div><span className="font-bold">Data:</span> {new Date(selectedAtendimento.data + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
              <div><span className="font-bold">Turno:</span> {selectedAtendimento.turno}</div>
              <div><span className="font-bold">Responsável:</span> {selectedAtendimento.responsavel}</div>
              <div><span className="font-bold">Departamento:</span> {selectedAtendimento.departamento}</div>
              <div><span className="font-bold">Local:</span> {selectedAtendimento.local}</div>
              <div><span className="font-bold">Criado em:</span> {new Date(selectedAtendimento.createdAt).toLocaleString('pt-BR')}</div>
              <div><span className="font-bold">Criado por:</span> {selectedAtendimento.createdByName || 'Não identificado'}</div>
              <div>
                <span className="font-bold">Editado por:</span>{' '}
                {selectedAtendimento.updatedByName
                  ? `${selectedAtendimento.updatedByName} em ${selectedAtendimento.updatedAt ? new Date(selectedAtendimento.updatedAt).toLocaleString('pt-BR') : '--'}`
                  : 'Sem edição'}
              </div>
            </div>
            <div className="mt-4">
              <span className="font-bold">Atividade/Observações:</span>
              <p className={`mt-2 p-3 rounded-xl border ${darkMode ? 'bg-[#0B2016] border-[#1E4D36]' : 'bg-green-50 border-green-100'}`}>{selectedAtendimento.atividade}</p>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              {canEditAtendimento && (
                <button
                  onClick={() => {
                    setEditingAtendimento(selectedAtendimento);
                    setSelectedAtendimento(null);
                  }}
                  className="px-5 py-2 rounded-lg bg-amber-100 text-amber-800 font-bold hover:bg-amber-200 transition-colors"
                >
                  Editar
                </button>
              )}
              {canDeleteAtendimento && (
                <button
                  onClick={() => {
                    setAtendimentoToDelete(selectedAtendimento);
                    setSelectedAtendimento(null);
                  }}
                  className="px-5 py-2 rounded-lg bg-red-100 text-red-800 font-bold hover:bg-red-200 transition-colors"
                >
                  Excluir
                </button>
              )}
              <button onClick={() => setSelectedAtendimento(null)} className="px-5 py-2 rounded-lg bg-[#1E8449] text-white font-bold hover:bg-[#145A32] transition-colors">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {atendimentoToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setAtendimentoToDelete(null)}>
          <div className={`w-full max-w-md rounded-3xl border p-6 shadow-2xl ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-100 text-[#0F5132]'}`} onClick={(e) => e.stopPropagation()}>
            <h4 className="mb-2 inline-flex items-center gap-2 text-xl font-black"><FiTrash2 /> Confirmar exclusão</h4>
            <p className="text-sm mb-4">Tem certeza que deseja excluir permanentemente este atendimento?</p>
            <div className="text-xs mb-5 opacity-80">
              <div><strong>Data:</strong> {new Date(atendimentoToDelete.data + 'T00:00:00').toLocaleDateString('pt-BR')}</div>
              <div><strong>Responsável:</strong> {atendimentoToDelete.responsavel}</div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setAtendimentoToDelete(null)} className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold hover:bg-red-700">
                Cancelar
              </button>
              <button
                onClick={async () => {
                  await handleDeleteAtendimento(atendimentoToDelete.id);
                  setAtendimentoToDelete(null);
                }}
                className="px-4 py-2 rounded-lg bg-[#1E8449] text-white font-bold hover:bg-[#145A32]"
              >
                Excluir permanentemente
              </button>
            </div>
          </div>
        </div>
      )}

      {editingAtendimento && (
        <AtendimentoForm
          onSave={handleUpdateAtendimento}
          onClose={() => setEditingAtendimento(null)}
          darkMode={darkMode}
          initialData={editingInitialData}
          submitLabel="Salvar Alterações"
        />
      )}

      {successNotice && (
        <div className="fixed top-5 right-5 z-[80] w-full max-w-md px-4">
          <AlertBanner kind="success" title="Confirmação" message={successNotice} className="shadow-xl" onClose={() => setSuccessNotice('')} />
        </div>
      )}
      {welcomeNotice && (
        <div className="fixed top-5 left-1/2 z-[80] w-full max-w-md -translate-x-1/2 px-4">
          <AlertBanner kind="success" title="Bem-vindo" message={welcomeNotice} className="shadow-xl" onClose={() => setWelcomeNotice('')} />
        </div>
      )}
      {!isFullScreen && notificationNotice && (
        <div className="fixed top-20 left-1/2 z-[80] w-full max-w-md -translate-x-1/2 px-4">
          <AlertBanner
            kind="info"
            title="Notificações"
            message={notificationNotice}
            className="shadow-xl"
            actionLabel="Ir para Atividades"
            onAction={() => setActiveTab('atividades')}
            onClose={() => setNotificationNotice('')}
          />
        </div>
      )}
      {appAlert && (
        <div className="fixed top-36 left-1/2 z-[80] -translate-x-1/2 px-4">
          <AlertBanner kind={appAlert.kind === 'warning' ? 'warning' : 'error'} message={appAlert.text} className="shadow-xl" onClose={() => setAppAlert(null)} />
        </div>
      )}

      {/* Overlay Mobile */}
      {isSidebarOpen && sidebarVisible && (
        <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" />
      )}

      {/* Modal Sobre */}
      {showAbout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={closeAbout}>
          <div className={`max-w-2xl w-full mx-4 p-8 rounded-[2rem] border shadow-2xl max-h-[80vh] overflow-y-auto ${darkMode ? 'bg-[#122D21] border-[#1E4D36]' : 'bg-white border-green-100'}`} onClick={e => e.stopPropagation()}>
            <h2 className={`${headingSize} font-black mb-6 flex items-center gap-3 ${darkMode ? 'text-white' : 'text-[#0F5132]'}`}>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#1E8449] text-white animate-pulse">i</span>
              Sobre o Sistema
            </h2>
            <div className="space-y-5">
              <div className={`rounded-2xl border p-5 transition-transform hover:-translate-y-1 ${darkMode ? 'bg-[#0B2016] border-[#1E4D36] text-white' : 'bg-green-50 border-green-100 text-[#0F5132]'}`}>
                <h3 className="text-lg font-black uppercase tracking-wide">Dashboard de Atendimentos/Atividades</h3>
                <p className="mt-2 text-sm leading-relaxed">
                  Plataforma interna da Secretaria de Educação para registro, acompanhamento e análise dos atendimentos por setor.
                </p>
                {currentUser && (
                  <p className="mt-2 text-sm font-bold text-[#1E8449]">
                    Usuário: {currentUser.fullName} | Perfil: {currentRoleLabel}
                  </p>
                )}
              </div>

              <div className={`rounded-2xl border p-5 transition-transform hover:-translate-y-1 ${darkMode ? 'bg-[#0B2016] border-[#1E4D36] text-white' : 'bg-white border-green-100 text-[#0F5132]'}`}>
                <h4 className="text-sm font-black uppercase tracking-widest text-[#1E8449]">O que seu perfil pode fazer</h4>
                <ul className="mt-3 space-y-2 text-sm">
                  {roleInstructions.map((instruction) => (
                    <li className="flex items-center gap-2" key={instruction}>
                      <span className="inline-flex h-2 w-2 rounded-full bg-[#1E8449]" />
                      {instruction}
                    </li>
                  ))}
                </ul>
              </div>

              <div className={`rounded-2xl border p-5 transition-transform hover:-translate-y-1 ${darkMode ? 'bg-[#0B2016] border-[#1E4D36] text-white' : 'bg-white border-green-100 text-[#0F5132]'}`}>
                <h4 className="text-sm font-black uppercase tracking-widest text-[#1E8449]">Como usar</h4>
                <p className="mt-2 text-sm leading-relaxed">
                  Use o menu lateral para navegar entre Dashboard, Novo Registro, Histórico, Atividades, Padronização e Relatórios.
                  No painel do secretário, programe atividades por equipe e acompanhe prazos/fluxo.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={closeAbout} className="px-6 py-2 bg-[#1E8449] text-white rounded-lg font-bold hover:bg-[#0F5132] transition-colors">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;


