import React, { useEffect, useMemo, useState } from 'react';
import { FiBarChart2, FiCalendar, FiClipboard, FiClock, FiEdit2, FiFlag, FiLayers, FiMail, FiMessageCircle, FiMessageSquare, FiPlusCircle, FiSave, FiSend, FiTarget, FiTrash2, FiUsers } from 'react-icons/fi';
import { AdminUser, AuthUser, SecretaryMetrics, Task, TaskComment, TaskSlaProfile, TaskTemplate, TaskTimelineEvent, Team, notificationService, taskService, teamService, userAdminService } from '../services/api';
import AlertBanner from './ui/AlertBanner';
import ModalDialog from './ui/ModalDialog';

interface SecretaryPanelProps { darkMode: boolean; mode?: 'full' | 'team'; currentUser?: AuthUser | null; }
type MessageMode = 'all_teams' | 'selected_teams' | 'by_responsavel';

const defaultTaskForm = { title: '', description: '', dueDate: '', priority: 'media' as 'baixa' | 'media' | 'alta', taskType: 'administrativo', goalTarget: '', teamId: '', assigneeIds: [] as string[] };
const defaultMessageForm = { mode: 'all_teams' as MessageMode, teamIds: [] as string[], assigneeIds: [] as string[], title: '', message: '' };
const quickEmojis = ['🙂', '👍', '✅', '🚀', '⚠️'];

const SecretaryPanel: React.FC<SecretaryPanelProps> = ({ darkMode, mode = 'full', currentUser = null }) => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [slaProfiles, setSlaProfiles] = useState<TaskSlaProfile[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [metrics, setMetrics] = useState<SecretaryMetrics | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [panelAlert, setPanelAlert] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const [isCreateTeamOpen, setIsCreateTeamOpen] = useState(false);
  const [isEditTeamOpen, setIsEditTeamOpen] = useState(false);
  const [isMessageOpen, setIsMessageOpen] = useState(false);
  const [isTaskPlannerOpen, setIsTaskPlannerOpen] = useState(false);
  const [teamToDelete, setTeamToDelete] = useState<Team | null>(null);

  const [trackingUserId, setTrackingUserId] = useState<string | null>(null);
  const [trackingTaskId, setTrackingTaskId] = useState<string | null>(null);
  const [trackingTimeline, setTrackingTimeline] = useState<TaskTimelineEvent[]>([]);
  const [trackingComments, setTrackingComments] = useState<TaskComment[]>([]);
  const [trackingChatInput, setTrackingChatInput] = useState('');
  const [trackingOnlineUsers, setTrackingOnlineUsers] = useState<Array<{ userId: string; userName: string }>>([]);
  const [trackingTypingUsers, setTrackingTypingUsers] = useState<Array<{ userId: string; userName: string }>>([]);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentInput, setEditingCommentInput] = useState('');
  const [dueDateDraft, setDueDateDraft] = useState('');

  const [teamForm, setTeamForm] = useState({ name: '', description: '', memberIds: [] as string[] });
  const [editingTeam, setEditingTeam] = useState<{ id: string; name: string; description: string } | null>(null);
  const [editingTeamMemberIds, setEditingTeamMemberIds] = useState<string[]>([]);
  const [messageForm, setMessageForm] = useState(defaultMessageForm);
  const [taskForm, setTaskForm] = useState(defaultTaskForm);
  const [showTeamMembersPicker, setShowTeamMembersPicker] = useState(false);
  const [showMessageRecipients, setShowMessageRecipients] = useState(false);

  const shellClass = darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-100 text-[#0F5132]';
  const surfaceClass = darkMode ? 'bg-[#0B2016] border-[#1E4D36] text-white' : 'bg-green-50 border-green-100 text-[#0F5132]';
  const fieldClass = darkMode ? 'w-full rounded-xl border border-[#1E4D36] bg-[#0B2016] px-3 py-2 text-sm text-white' : 'w-full rounded-xl border border-green-200 bg-white px-3 py-2 text-sm text-[#0F5132]';
  const isTeamMode = mode === 'team';

  const activeUsers = useMemo(() => users.filter((u) => u.isActive), [users]);
  const filteredTasks = useMemo(() => (selectedTeamId ? tasks.filter((t) => t.teamId === selectedTeamId) : tasks), [tasks, selectedTeamId]);
  const selectedSla = useMemo(() => slaProfiles.find((s) => s.type === taskForm.taskType) || null, [slaProfiles, taskForm.taskType]);
  const trackingUserTasks = useMemo(() => !trackingUserId ? [] : tasks.filter((t) => t.assignees.some((a) => a.id === trackingUserId)), [tasks, trackingUserId]);
  const trackingTask = useMemo(() => trackingUserTasks.find((t) => t.id === trackingTaskId) || null, [trackingTaskId, trackingUserTasks]);

  const summary = useMemo(() => {
    const concluidas = filteredTasks.filter((t) => t.status === 'concluida').length;
    const open = filteredTasks.filter((t) => t.status !== 'concluida');
    return {
      projetos: new Set(filteredTasks.map((t) => t.taskType).filter(Boolean)).size,
      metas: new Set(filteredTasks.map((t) => t.goalTarget).filter(Boolean)).size,
      atividades: filteredTasks.length,
      concluidas,
      atrasadas: filteredTasks.filter((t) => t.status === 'atrasada' || t.overdue).length,
      operacionalProjetos: new Set(open.map((t) => t.taskType).filter(Boolean)).size,
      operacionalMetas: new Set(open.map((t) => t.goalTarget).filter(Boolean)).size,
      operacionalAtividades: open.length,
    };
  }, [filteredTasks]);

  const teamSummaries = useMemo(() => {
    const map = new Map<string, { total: number; concluidas: number; atrasadas: number; progresso: number }>();
    teams.forEach((team) => {
      const teamTasks = tasks.filter((task) => task.teamId === team.id);
      const total = teamTasks.length;
      const concluidas = teamTasks.filter((task) => task.status === 'concluida').length;
      const atrasadas = teamTasks.filter((task) => task.status === 'atrasada' || task.overdue).length;
      const progresso = total > 0 ? Math.round((concluidas / total) * 100) : 0;
      map.set(team.id, { total, concluidas, atrasadas, progresso });
    });
    return map;
  }, [teams, tasks]);

  const monthlyGoals = useMemo(() => metrics?.byTeamMonth || [], [metrics?.byTeamMonth]);
  const deliveryRanking = useMemo(() => (metrics?.ranking || []).slice(0, 8), [metrics?.ranking]);

  const loadData = async () => {
    const [usersData, teamsData, slaData, metricsData, tasksData, templatesData] = await Promise.all([
      userAdminService.list(),
      teamService.list(),
      taskService.listSlaProfiles(),
      taskService.secretaryMetrics(),
      taskService.list(),
      taskService.listTemplates(),
    ]);
    setUsers(usersData); setTeams(teamsData); setSlaProfiles(slaData); setMetrics(metricsData); setTasks(tasksData); setTemplates(templatesData);
  };

  useEffect(() => { loadData().finally(() => setLoading(false)); }, []);
  useEffect(() => { if (!panelAlert) return; const t = setTimeout(() => setPanelAlert(null), 3500); return () => clearTimeout(t); }, [panelAlert]);

  const toggleSelected = (id: string, values: string[], setter: (next: string[]) => void) => setter(values.includes(id) ? values.filter((v) => v !== id) : [...values, id]);

  const handleCreateTeam = async () => {
    await teamService.create({ name: teamForm.name.trim(), description: teamForm.description.trim(), memberIds: teamForm.memberIds });
    setTeamForm({ name: '', description: '', memberIds: [] });
    setShowTeamMembersPicker(false);
    setPanelAlert({ kind: 'success', text: 'Equipe criada.' });
    await loadData();
  };

  const handleEditTeam = async () => {
    if (!editingTeam) return;
    await teamService.update(editingTeam.id, { name: editingTeam.name.trim(), description: editingTeam.description.trim() });
    await teamService.updateMembers(editingTeam.id, editingTeamMemberIds);
    setPanelAlert({ kind: 'success', text: 'Equipe editada.' });
    await loadData();
  };

  const handleDeleteTeam = async () => {
    if (!teamToDelete) return;
    await teamService.remove(teamToDelete.id);
    setPanelAlert({ kind: 'success', text: 'Equipe excluída.' });
    setTeamToDelete(null);
    await loadData();
  };

  const handleCreateTask = async () => {
    await taskService.create({ ...taskForm, title: taskForm.title.trim(), description: taskForm.description.trim(), goalTarget: taskForm.goalTarget.trim(), teamId: taskForm.teamId || undefined });
    setTaskForm(defaultTaskForm);
    setPanelAlert({ kind: 'success', text: 'Atividade criada.' });
    setIsTaskPlannerOpen(false);
    await loadData();
  };

  const handleCreateTemplateFromForm = async () => {
    if (taskForm.title.trim().length < 3) {
      setPanelAlert({ kind: 'error', text: 'Preencha um título válido para salvar template.' });
      return;
    }
    try {
      await taskService.createTemplate({
        title: taskForm.title.trim(),
        description: taskForm.description.trim(),
        priority: taskForm.priority,
        taskType: taskForm.taskType,
        goalTarget: taskForm.goalTarget.trim(),
        defaultDueDays: 7,
      });
      setPanelAlert({ kind: 'success', text: 'Template salvo com sucesso.' });
      await loadData();
    } catch (error) {
      setPanelAlert({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao salvar template.' });
    }
  };

  const handleSendMessage = async () => {
    if (messageForm.mode === 'by_responsavel') {
      await notificationService.broadcastToUsers({ title: messageForm.title.trim(), message: messageForm.message.trim(), userIds: messageForm.assigneeIds });
    } else {
      const ids = messageForm.mode === 'all_teams' ? teams.map((t) => t.id) : messageForm.teamIds;
      await Promise.all(ids.map((id) => teamService.sendMessage(id, { title: messageForm.title.trim(), message: messageForm.message.trim() })));
    }
    setMessageForm(defaultMessageForm);
    setPanelAlert({ kind: 'success', text: 'Mensagem enviada.' });
  };

  const openTrackingForUser = (userId: string) => { setTrackingUserId(userId); setTrackingTaskId(null); setTrackingTimeline([]); setTrackingComments([]); };
  const loadTrackingTaskContext = async (taskId: string) => {
    setTrackingTaskId(taskId);
    const [timelineData, commentsData] = await Promise.all([taskService.listTimeline(taskId), taskService.listComments(taskId)]);
    setTrackingTimeline(timelineData); setTrackingComments(commentsData);
    const task = tasks.find((t) => t.id === taskId); setDueDateDraft(task?.dueDate || '');
  };

  const handleTrackingStatus = async (status: Task['status']) => { if (!trackingTaskId) return; await taskService.updateStatus(trackingTaskId, status); await loadData(); await loadTrackingTaskContext(trackingTaskId); };
  const handleTrackingDueDate = async () => { if (!trackingTaskId || !dueDateDraft) return; await taskService.updateDueDate(trackingTaskId, dueDateDraft); await loadData(); await loadTrackingTaskContext(trackingTaskId); };
  const handleTrackingComment = async () => { if (!trackingTaskId || trackingChatInput.trim().length < 2) return; await taskService.addComment(trackingTaskId, trackingChatInput.trim()); await taskService.setTyping(trackingTaskId, false).catch(() => null); setTrackingChatInput(''); await loadTrackingTaskContext(trackingTaskId); };
  const handleTrackingEditComment = async () => { if (!trackingTaskId || !editingCommentId) return; await taskService.updateComment(trackingTaskId, editingCommentId, editingCommentInput.trim()); setEditingCommentId(null); setEditingCommentInput(''); await loadTrackingTaskContext(trackingTaskId); };
  const handleTrackingDeleteComment = async (commentId: string) => { if (!trackingTaskId) return; await taskService.removeComment(trackingTaskId, commentId); await loadTrackingTaskContext(trackingTaskId); };

  useEffect(() => {
    const stream = new EventSource('/api/events', { withCredentials: true });
    const onTaskComment = (event: Event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data || '{}');
        if (!trackingTaskId || payload.taskId !== trackingTaskId) return;
        loadTrackingTaskContext(trackingTaskId).catch(() => null);
      } catch (_error) {
        // noop
      }
    };

    stream.addEventListener('task:comment', onTaskComment);
    stream.addEventListener('task:typing', (event: Event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data || '{}');
        if (!trackingTaskId || payload.taskId !== trackingTaskId) return;
        setTrackingTypingUsers((prev) => {
          const filtered = prev.filter((user) => user.userId !== payload.userId);
          if (!payload.typing || payload.userId === currentUser?.id) return filtered;
          return [...filtered, { userId: payload.userId, userName: payload.userName }];
        });
      } catch (_error) {
        // noop
      }
    });
    stream.addEventListener('task:presence', (event: Event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data || '{}');
        if (!trackingTaskId || payload.taskId !== trackingTaskId) return;
        setTrackingOnlineUsers(Array.isArray(payload.online) ? payload.online : []);
      } catch (_error) {
        // noop
      }
    });
    stream.onerror = () => stream.close();
    return () => {
      stream.removeEventListener('task:comment', onTaskComment);
      stream.close();
    };
  }, [trackingTaskId]);

  useEffect(() => {
    if (!trackingTaskId) return;
    let alive = true;
    const run = async () => {
      try {
        const data = await taskService.pingPresence(trackingTaskId);
        if (alive) setTrackingOnlineUsers(data.online || []);
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
  }, [trackingTaskId]);

  useEffect(() => {
    if (!trackingTaskId) return;
    const hasTyping = trackingChatInput.trim().length > 0;
    const timer = window.setTimeout(() => {
      taskService.setTyping(trackingTaskId, hasTyping).catch(() => null);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [trackingChatInput, trackingTaskId]);

  if (loading) return <div className={`rounded-3xl border p-6 ${shellClass}`}>Carregando painel da secretaria...</div>;

  return (
    <div className="space-y-6">
      {panelAlert && <AlertBanner kind={panelAlert.kind} message={panelAlert.text} />}
      <section className={`rounded-3xl border p-6 shadow-xl ${isTeamMode ? (darkMode ? 'bg-gradient-to-r from-[#0A1324] to-[#122D21] border-[#1E4D36] text-white' : 'bg-gradient-to-r from-white via-green-50 to-emerald-50 border-green-100 text-[#0F5132]') : shellClass}`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="inline-flex items-center gap-2 text-2xl font-black tracking-tight">{isTeamMode ? <><FiUsers /> Equipe</> : <><FiLayers /> Painel da Secretaria</>}</h3>
            <p className="text-sm opacity-80">{isTeamMode ? 'Central de gestão visual de equipes e comunicação.' : 'Gestão de equipes, atividades e comunicação operacional.'}</p>
            {isTeamMode && <p className="mt-2 text-xs font-black uppercase tracking-[0.16em] opacity-70">Fluxo simplificado para cadastro, edição e comunicação</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {isTeamMode && (
              <button
                onClick={() => {
                  setShowTeamMembersPicker(false);
                  setIsCreateTeamOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-[#1E8449] px-4 py-2 text-xs font-black uppercase text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#145A32]"
              >
                <FiPlusCircle />
                Adicionar equipe
              </button>
            )}
            {isTeamMode && (
              <button onClick={() => { setShowMessageRecipients(false); setIsMessageOpen(true); }} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-black uppercase transition-all duration-200 hover:-translate-y-0.5 ${surfaceClass}`}><FiMessageCircle />Enviar mensagem</button>
            )}
            {!isTeamMode && <button onClick={() => setIsTaskPlannerOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#1E8449] px-4 py-2 text-xs font-black uppercase text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#145A32]"><FiClipboard />Programar atividade</button>}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px,1fr]">
        <aside className={`rounded-3xl border p-4 shadow-lg ${shellClass}`}>
          <p className="text-base font-black uppercase">Equipes</p>
          <p className="text-xs opacity-75">Selecione uma equipe para abrir ações de gerenciamento.</p>
          <button onClick={() => setSelectedTeamId('')} className={`mt-3 w-full rounded-xl border p-2 text-left text-sm font-black transition-all duration-200 hover:-translate-y-0.5 ${selectedTeamId === '' ? 'bg-[#1E8449] text-white' : ''}`}>Visão geral</button>
          <div className="mt-2 space-y-2 max-h-[60vh] overflow-y-auto">
            {teams.map((team, index) => (
              <div
                key={team.id}
                className={`stagger-enter rounded-2xl border p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${surfaceClass}`}
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <button
                  onClick={() => {
                    setSelectedTeamId(team.id);
                    setEditingTeam({ id: team.id, name: team.name, description: team.description || '' });
                    setEditingTeamMemberIds(team.members.map((member) => member.id));
                    setIsEditTeamOpen(true);
                  }}
                  className={`w-full rounded-lg p-2 text-left ${selectedTeamId === team.id ? 'bg-[#1E8449] text-white' : ''}`}
                >
                  <p className="text-sm font-black uppercase leading-tight">{team.name}</p>
                  <p className="text-[11px] opacity-80">{teamSummaries.get(team.id)?.progresso ?? 0}% concluído</p>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-black/10">
                    <div className="h-1.5 rounded-full bg-[#1E8449]" style={{ width: `${teamSummaries.get(team.id)?.progresso ?? 0}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] font-black uppercase opacity-70">Clique para gerenciar</p>
                </button>
                <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] font-bold uppercase">
                  <span className="rounded bg-black/5 px-2 py-1 text-center">{teamSummaries.get(team.id)?.total ?? 0} atv</span>
                  <span className="rounded bg-emerald-500/15 px-2 py-1 text-center">{teamSummaries.get(team.id)?.concluidas ?? 0} concluídas</span>
                  <span className="rounded bg-red-500/15 px-2 py-1 text-center">{teamSummaries.get(team.id)?.atrasadas ?? 0} atrasadas</span>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="space-y-6">
          {!isTeamMode && (
            <section className={`rounded-3xl border p-6 ${shellClass}`}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className={`rounded-xl border p-3 ${surfaceClass}`}><p className="text-xs font-black uppercase inline-flex items-center gap-1"><FiLayers />Projetos</p><p className="text-2xl font-black">{summary.projetos}</p></div>
                <div className={`rounded-xl border p-3 ${surfaceClass}`}><p className="text-xs font-black uppercase inline-flex items-center gap-1"><FiTarget />Metas</p><p className="text-2xl font-black">{summary.metas}</p></div>
                <div className={`rounded-xl border p-3 ${surfaceClass}`}><p className="text-xs font-black uppercase inline-flex items-center gap-1"><FiClipboard />Atividades</p><p className="text-2xl font-black">{summary.atividades}</p></div>
                <div className={`rounded-xl border p-3 ${surfaceClass}`}><p className="text-xs font-black uppercase inline-flex items-center gap-1"><FiBarChart2 />Concluídas</p><p className="text-2xl font-black">{summary.concluidas}</p></div>
              </div>
              <div className={`mt-3 rounded-xl border p-3 ${surfaceClass}`}>
                <p className="text-xs font-black uppercase">Resumo operacional</p>
                <p className="text-sm">Projetos: {summary.operacionalProjetos} | Metas: {summary.operacionalMetas} | Atividades: {summary.operacionalAtividades}</p>
                <p className="text-sm">Concluídas: {summary.concluidas} | Atrasadas: {summary.atrasadas}</p>
              </div>
            </section>
          )}

          {!isTeamMode && (
            <section className={`rounded-3xl border p-6 ${shellClass}`}>
              <h4 className="text-lg font-black uppercase">Acompanhamento por usuário</h4>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead><tr><th className="text-left">Usuário</th><th className="text-left">Total</th><th className="text-left">Concluídas</th><th className="text-left">Atrasadas</th><th className="text-left">Fluxo</th></tr></thead>
                  <tbody>
                    {metrics?.byUser.map((item) => (
                      <tr key={item.id} className="border-t border-green-900/20"><td className="py-2">{item.fullName}</td><td>{item.total}</td><td>{item.concluidas}</td><td>{item.atrasadas}</td><td><button onClick={() => openTrackingForUser(item.id)} className="rounded bg-[#1E8449] px-3 py-1 text-xs font-black uppercase text-white">Acompanhar</button></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {!isTeamMode && (
            <section className={`rounded-3xl border p-6 ${shellClass}`}>
              <h4 className="text-lg font-black uppercase">Relatório executivo</h4>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className={`rounded-xl border p-3 ${surfaceClass}`}>
                  <p className="text-xs font-black uppercase">Ativas agora</p>
                  <p className="text-2xl font-black">{metrics?.executivo?.totalAtivas ?? 0}</p>
                </div>
                <div className={`rounded-xl border p-3 ${surfaceClass}`}>
                  <p className="text-xs font-black uppercase">Concluídas no mês</p>
                  <p className="text-2xl font-black">{metrics?.executivo?.totalConcluidasMes ?? 0}</p>
                </div>
                <div className={`rounded-xl border p-3 ${surfaceClass}`}>
                  <p className="text-xs font-black uppercase">Taxa no prazo</p>
                  <p className="text-2xl font-black">{metrics?.executivo?.taxaNoPrazo ?? 0}%</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className={`rounded-xl border p-3 ${surfaceClass}`}>
                  <p className="text-xs font-black uppercase">Metas por equipe (mês)</p>
                  <div className="mt-2 space-y-2">
                    {monthlyGoals.map((item) => (
                      <div key={item.teamId} className="rounded-lg border border-green-900/20 p-2">
                        <div className="flex items-center justify-between text-xs font-black uppercase">
                          <span>{item.teamName}</span>
                          <span>{item.progresso}%</span>
                        </div>
                        <div className="mt-2 h-2 w-full rounded-full bg-black/10">
                          <div className="h-2 rounded-full bg-[#1E8449]" style={{ width: `${item.progresso}%` }} />
                        </div>
                        <p className="mt-1 text-[11px]">Concluídas: {item.concluidas}/{item.total}</p>
                      </div>
                    ))}
                    {monthlyGoals.length === 0 && <p className="text-xs opacity-70">Sem dados mensais por equipe.</p>}
                  </div>
                </div>

                <div className={`rounded-xl border p-3 ${surfaceClass}`}>
                  <p className="text-xs font-black uppercase">Ranking de entrega e qualidade</p>
                  <div className="mt-2 space-y-2">
                    {deliveryRanking.map((item, index) => (
                      <div key={item.id} className="flex items-center justify-between rounded-lg border border-green-900/20 p-2 text-xs">
                        <div>
                          <p className="font-black uppercase">#{index + 1} {item.fullName}</p>
                          <p className="opacity-80">Concluídas: {item.concluidas} | No prazo: {item.noPrazo}</p>
                        </div>
                        <span className="rounded-full bg-[#1E8449] px-2 py-1 text-[10px] font-black text-white">{item.score}</span>
                      </div>
                    ))}
                    {deliveryRanking.length === 0 && <p className="text-xs opacity-70">Sem ranking disponível.</p>}
                  </div>
                </div>
              </div>
            </section>
          )}

          {isTeamMode && (
            <section className={`rounded-3xl border p-6 shadow-xl ${shellClass}`}>
              <h4 className="text-lg font-black uppercase tracking-wider">Ações da equipe</h4>
              <p className="mt-1 text-sm opacity-80">Fluxo rápido para criação, comunicação e manutenção das equipes.</p>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <button onClick={() => { setShowTeamMembersPicker(false); setIsCreateTeamOpen(true); }} className={`stagger-enter rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${surfaceClass}`} style={{ animationDelay: '40ms' }}>
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#1E8449] text-white"><FiPlusCircle /></span>
                  <p className="mt-3 inline-flex items-center gap-2 text-xs font-black uppercase">Adicionar equipe</p>
                  <p className="mt-2 text-sm opacity-80">Crie uma equipe e selecione membros apenas quando necessário.</p>
                </button>
                <button onClick={() => { setShowMessageRecipients(false); setIsMessageOpen(true); }} className={`stagger-enter rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${surfaceClass}`} style={{ animationDelay: '120ms' }}>
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#145A32] text-white"><FiSend /></span>
                  <p className="mt-3 inline-flex items-center gap-2 text-xs font-black uppercase">Enviar mensagem</p>
                  <p className="mt-2 text-sm opacity-80">Dispare comunicados por equipe ou por responsáveis específicos.</p>
                </button>
                <button
                  onClick={() => {
                    const firstTeam = teams[0];
                    if (!firstTeam) return;
                    setEditingTeam({ id: firstTeam.id, name: firstTeam.name, description: firstTeam.description || '' });
                    setEditingTeamMemberIds(firstTeam.members.map((member) => member.id));
                    setIsEditTeamOpen(true);
                  }}
                  className={`stagger-enter rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${surfaceClass}`}
                  style={{ animationDelay: '200ms' }}
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#0F5132] text-white"><FiEdit2 /></span>
                  <p className="mt-3 inline-flex items-center gap-2 text-xs font-black uppercase">Editar equipe</p>
                  <p className="mt-2 text-sm opacity-80">Ajuste nome, descrição e integrantes para manter organização visual.</p>
                </button>
              </div>
            </section>
          )}
        </div>
      </div>

      <ModalDialog open={isCreateTeamOpen} onClose={() => setIsCreateTeamOpen(false)} title="Adicionar equipe" titleIcon={<FiPlusCircle />} darkMode={darkMode}>
        <div className="space-y-3">
          <input value={teamForm.name} onChange={(e) => setTeamForm((p) => ({ ...p, name: e.target.value }))} className={fieldClass} placeholder="Nome da equipe" />
          <input value={teamForm.description} onChange={(e) => setTeamForm((p) => ({ ...p, description: e.target.value }))} className={fieldClass} placeholder="Descrição da equipe" />
          <button
            type="button"
            onClick={() => setShowTeamMembersPicker((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-xl border border-green-300 px-3 py-2 text-xs font-black uppercase"
          >
            <FiUsers />
            {showTeamMembersPicker ? 'Ocultar nomes' : 'Selecionar membros'}
          </button>
          {showTeamMembersPicker && (
            <div className={`max-h-56 overflow-y-auto rounded-xl border p-2 ${surfaceClass}`}>
              {activeUsers.map((u) => (
                <label key={u.id} className="mb-1 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={teamForm.memberIds.includes(u.id)} onChange={() => toggleSelected(u.id, teamForm.memberIds, (n) => setTeamForm((p) => ({ ...p, memberIds: n })))} />
                  {u.fullName}
                </label>
              ))}
            </div>
          )}
          <div className="flex justify-end"><button onClick={async () => { await handleCreateTeam(); setIsCreateTeamOpen(false); }} className="rounded-xl bg-[#1E8449] px-4 py-2 text-xs font-black uppercase text-white">Criar equipe</button></div>
        </div>
      </ModalDialog>

      <ModalDialog open={isEditTeamOpen} onClose={() => setIsEditTeamOpen(false)} title="Editar equipe" titleIcon={<FiEdit2 />} darkMode={darkMode}>
        <div className="space-y-2">
          <input value={editingTeam?.name || ''} onChange={(e) => setEditingTeam((p) => (p ? { ...p, name: e.target.value } : p))} className={fieldClass} placeholder="Nome" />
          <input value={editingTeam?.description || ''} onChange={(e) => setEditingTeam((p) => (p ? { ...p, description: e.target.value } : p))} className={fieldClass} placeholder="Descrição" />
          <div className={`max-h-40 overflow-y-auto rounded-xl border p-2 ${surfaceClass}`}>
            {activeUsers.map((user) => (
              <label key={user.id} className="mb-1 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editingTeamMemberIds.includes(user.id)}
                  onChange={() => toggleSelected(user.id, editingTeamMemberIds, setEditingTeamMemberIds)}
                />
                {user.fullName}
              </label>
            ))}
          </div>
          <div className="flex justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                const team = teams.find((t) => t.id === editingTeam?.id);
                if (team) setTeamToDelete(team);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-black uppercase text-white"
            >
              <FiTrash2 />
              Excluir
            </button>
          <div className="flex justify-end"><button onClick={async () => { await handleEditTeam(); setIsEditTeamOpen(false); }} className="inline-flex items-center gap-2 rounded-xl bg-[#1E8449] px-4 py-2 text-xs font-black uppercase text-white"><FiSave />Salvar</button></div>
          </div>
        </div>
      </ModalDialog>

      <ModalDialog open={!!teamToDelete} onClose={() => setTeamToDelete(null)} title="Excluir equipe" titleIcon={<FiTrash2 />} darkMode={darkMode} footer={<><button onClick={() => setTeamToDelete(null)} className="rounded bg-gray-600 px-4 py-2 text-white">Cancelar</button><button onClick={handleDeleteTeam} className="rounded bg-red-600 px-4 py-2 text-white">Excluir</button></>}>
        <p>Confirma exclusão da equipe {teamToDelete?.name}?</p>
      </ModalDialog>

      <ModalDialog open={isMessageOpen} onClose={() => setIsMessageOpen(false)} title="Enviar mensagem" titleIcon={<FiMail />} darkMode={darkMode}>
        <div className="space-y-3">
          <select value={messageForm.mode} onChange={(e) => setMessageForm((p) => ({ ...p, mode: e.target.value as MessageMode, teamIds: [], assigneeIds: [] }))} className={fieldClass}><option value="all_teams">Todas as equipes</option><option value="selected_teams">Selecionar equipes</option><option value="by_responsavel">Selecionar responsáveis</option></select>
          <button
            type="button"
            onClick={() => setShowMessageRecipients((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-xl border border-green-300 px-3 py-2 text-xs font-black uppercase"
          >
            <FiUsers />
            {showMessageRecipients ? 'Ocultar destinatários' : 'Escolher destinatários'}
          </button>
          {showMessageRecipients && messageForm.mode === 'selected_teams' && <div className={`max-h-44 overflow-y-auto rounded-xl border p-2 ${surfaceClass}`}>{teams.map((t) => <label key={t.id} className="mb-1 flex items-center gap-2"><input type="checkbox" checked={messageForm.teamIds.includes(t.id)} onChange={() => toggleSelected(t.id, messageForm.teamIds, (n) => setMessageForm((p) => ({ ...p, teamIds: n })))} />{t.name}</label>)}</div>}
          {showMessageRecipients && messageForm.mode === 'by_responsavel' && <div className={`max-h-44 overflow-y-auto rounded-xl border p-2 ${surfaceClass}`}>{activeUsers.map((u) => <label key={u.id} className="mb-1 flex items-center gap-2"><input type="checkbox" checked={messageForm.assigneeIds.includes(u.id)} onChange={() => toggleSelected(u.id, messageForm.assigneeIds, (n) => setMessageForm((p) => ({ ...p, assigneeIds: n })))} />{u.fullName}</label>)}</div>}
          <input value={messageForm.title} onChange={(e) => setMessageForm((p) => ({ ...p, title: e.target.value }))} className={fieldClass} placeholder="Título" />
          <textarea value={messageForm.message} onChange={(e) => setMessageForm((p) => ({ ...p, message: e.target.value }))} className={`${fieldClass} resize-none`} rows={5} placeholder="Digite a mensagem para a equipe..." />
          <div className="flex justify-end"><button onClick={async () => { await handleSendMessage(); setIsMessageOpen(false); }} className="inline-flex items-center gap-2 rounded-xl bg-[#1E8449] px-4 py-2 text-xs font-black uppercase text-white"><FiSend />Enviar</button></div>
        </div>
      </ModalDialog>

      <ModalDialog open={isTaskPlannerOpen} onClose={() => setIsTaskPlannerOpen(false)} title="Programar nova atividade" titleIcon={<FiClipboard />} darkMode={darkMode} maxWidthClass="max-w-4xl">
        <div className="mb-2">
          <select
            className={fieldClass}
            defaultValue=""
            onChange={(e) => {
              const templateId = e.target.value;
              const template = templates.find((item) => item.id === templateId);
              if (!template) return;
              const dueDate = new Date();
              dueDate.setDate(dueDate.getDate() + Number(template.defaultDueDays || 7));
              setTaskForm((prev) => ({
                ...prev,
                title: template.title,
                description: template.description || '',
                priority: template.priority || 'media',
                taskType: template.taskType || prev.taskType,
                goalTarget: template.goalTarget || '',
                dueDate: dueDate.toISOString().slice(0, 10),
              }));
            }}
          >
            <option value="">Aplicar template de atividade (opcional)</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.title} (D+{template.defaultDueDays})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          <div className="relative"><FiFlag className="absolute left-3 top-1/2 -translate-y-1/2" /><input value={taskForm.title} onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))} className={`${fieldClass} pl-9`} placeholder="Título" /></div>
          <div className="relative"><FiCalendar className="absolute left-3 top-1/2 -translate-y-1/2" /><input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm((p) => ({ ...p, dueDate: e.target.value }))} className={`${fieldClass} pl-9`} /></div>
          <div className="relative"><FiBarChart2 className="absolute left-3 top-1/2 -translate-y-1/2" /><select value={taskForm.priority} onChange={(e) => setTaskForm((p) => ({ ...p, priority: e.target.value as 'baixa' | 'media' | 'alta' }))} className={`${fieldClass} pl-9`}><option value="baixa">Prioridade baixa</option><option value="media">Prioridade média</option><option value="alta">Prioridade alta</option></select></div>
          <div className="relative"><FiLayers className="absolute left-3 top-1/2 -translate-y-1/2" /><select value={taskForm.taskType} onChange={(e) => setTaskForm((p) => ({ ...p, taskType: e.target.value }))} className={`${fieldClass} pl-9`}>{slaProfiles.map((s) => <option key={s.type} value={s.type}>{s.type} (SLA {s.slaDays})</option>)}</select></div>
          <div className="relative"><FiTarget className="absolute left-3 top-1/2 -translate-y-1/2" /><input value={taskForm.goalTarget} onChange={(e) => setTaskForm((p) => ({ ...p, goalTarget: e.target.value }))} className={`${fieldClass} pl-9`} placeholder="Meta" /></div>
          <div className="relative"><FiUsers className="absolute left-3 top-1/2 -translate-y-1/2" /><select value={taskForm.teamId} onChange={(e) => setTaskForm((p) => ({ ...p, teamId: e.target.value }))} className={`${fieldClass} pl-9`}><option value="">Sem equipe</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        </div>
        <input value={taskForm.description} onChange={(e) => setTaskForm((p) => ({ ...p, description: e.target.value }))} className={`mt-2 ${fieldClass}`} placeholder="Descrição" />
        {selectedSla && <p className="mt-2 text-xs">SLA recomendado: {selectedSla.slaDays} dia(s).</p>}
        <div className={`mt-3 max-h-36 overflow-y-auto rounded-xl border p-2 ${surfaceClass}`}>{activeUsers.map((u) => <label key={u.id} className="mb-1 flex items-center gap-2"><input type="checkbox" checked={taskForm.assigneeIds.includes(u.id)} onChange={() => toggleSelected(u.id, taskForm.assigneeIds, (n) => setTaskForm((p) => ({ ...p, assigneeIds: n })))} />{u.fullName}</label>)}</div>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={handleCreateTemplateFromForm} className="rounded-xl bg-[#145A32] px-4 py-2 text-xs font-black uppercase text-white">Salvar template</button>
          <button onClick={handleCreateTask} className="rounded-xl bg-[#1E8449] px-4 py-2 text-xs font-black uppercase text-white">Criar atividade</button>
        </div>
      </ModalDialog>

      <ModalDialog open={trackingUserId !== null} onClose={() => setTrackingUserId(null)} title={`Acompanhamento de ${users.find((u) => u.id === trackingUserId)?.fullName || ''}`} titleIcon={<FiMessageSquare />} darkMode={darkMode} maxWidthClass="max-w-6xl">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px,1fr]">
          <aside className={`rounded-xl border p-3 ${surfaceClass}`}>
            <p className="text-xs font-black uppercase">Atividades</p>
            <div className="mt-2 space-y-2 max-h-72 overflow-y-auto">{trackingUserTasks.map((t) => <button key={t.id} onClick={() => loadTrackingTaskContext(t.id)} className={`w-full rounded-lg border p-2 text-left ${trackingTaskId === t.id ? 'bg-[#1E8449] text-white' : ''}`}><p className="text-xs font-black uppercase">{t.title}</p><p className="text-[11px]">{t.status} | {t.dueDate}</p></button>)}</div>
          </aside>
          <section>
            {!trackingTask ? <p className="text-sm opacity-80">Selecione uma atividade.</p> : (
              <div className="space-y-3">
                <div className={`rounded-xl border p-3 ${surfaceClass}`}>
                  <p className="text-sm font-black uppercase">{trackingTask.title}</p>
                  <p className="text-xs">O que falta: {trackingTask.status === 'concluida' ? 'Nada pendente.' : 'Concluir atividade e validar entrega.'}</p>
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr,160px,100px]">
                    <select value={trackingTask.status} onChange={(e) => handleTrackingStatus(e.target.value as Task['status'])} className={fieldClass}><option value="pendente">Pendente</option><option value="em_andamento">Em andamento</option><option value="atrasada">Atrasada</option><option value="concluida">Concluída</option></select>
                    <input type="date" value={dueDateDraft} onChange={(e) => setDueDateDraft(e.target.value)} className={fieldClass} />
                    <button onClick={handleTrackingDueDate} className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-black uppercase text-white">Adiar</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  <div className={`rounded-xl border p-3 max-h-56 overflow-y-auto ${surfaceClass}`}><p className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase"><FiClock />Fluxo</p>{trackingTimeline.map((e) => <div key={e.id} className="mb-2 border-l-2 border-green-400 pl-2 text-xs"><p className="font-black">{e.userName}</p><p>{e.message}</p><p className="opacity-70">{new Date(e.createdAt).toLocaleString('pt-BR')}</p></div>)}</div>
                  <div className={`rounded-xl border p-3 ${surfaceClass}`}>
                    <p className="mb-2 inline-flex items-center gap-2 text-xs font-black uppercase"><FiMessageCircle />Chat</p>
                    <p className="mb-2 text-[11px] opacity-80">Online: {trackingOnlineUsers.filter((u) => u.userId !== currentUser?.id).map((u) => u.userName).join(', ') || 'Somente você'}</p>
                    {trackingTypingUsers.length > 0 && (
                      <p className="mb-2 text-[11px]">Digitando: {trackingTypingUsers.map((u) => u.userName).join(', ')}</p>
                    )}
                    <div className="max-h-40 overflow-y-auto space-y-2">
                      {trackingComments.map((c) => {
                        const canManage = c.userId === currentUser?.id;
                        return (
                          <div key={c.id} className="rounded-lg border p-2 bg-white/20">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-xs font-black">{c.userName}</p>
                                {editingCommentId === c.id ? (
                                  <div className="mt-1 flex gap-2">
                                    <input value={editingCommentInput} onChange={(e) => setEditingCommentInput(e.target.value)} className={`${fieldClass} py-1 text-xs`} />
                                    <button onClick={handleTrackingEditComment} className="rounded bg-[#1E8449] px-2 text-white"><FiSave size={12} /></button>
                                  </div>
                                ) : (
                                  <p className="text-sm">{c.message}</p>
                                )}
                              </div>
                              {canManage && (
                                <div className="flex gap-1">
                                  <button onClick={() => { setEditingCommentId(c.id); setEditingCommentInput(c.message); }} className="rounded bg-amber-500 px-2 py-1 text-white"><FiEdit2 size={12} /></button>
                                  <button onClick={() => handleTrackingDeleteComment(c.id)} className="rounded bg-red-600 px-2 py-1 text-white"><FiTrash2 size={12} /></button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">{quickEmojis.map((emoji) => <button key={emoji} onClick={() => setTrackingChatInput((p) => `${p}${emoji}`)} className="rounded-lg border px-2 py-1 text-sm">{emoji}</button>)}</div>
                    <div className="mt-2 flex gap-2"><input value={trackingChatInput} onChange={(e) => setTrackingChatInput(e.target.value)} className={fieldClass} placeholder="Mensagem" /><button onClick={handleTrackingComment} className="rounded-xl bg-[#1E8449] px-3 py-2 text-xs font-black uppercase text-white">Enviar</button></div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </ModalDialog>
    </div>
  );
};

export default SecretaryPanel;
