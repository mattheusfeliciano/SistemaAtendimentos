import React, { useEffect, useMemo, useState } from 'react';
import { FiCheckCircle, FiCircle, FiEdit2, FiEye, FiEyeOff, FiShield, FiTrash2, FiUnlock, FiUserX } from 'react-icons/fi';
import { AdminUser, AuthUser, CreateUserPayload, UpdateUserPayload, userAdminService } from '../services/api';
import AlertBanner from './ui/AlertBanner';
import ModalDialog from './ui/ModalDialog';

interface AdminUsersPanelProps {
  darkMode: boolean;
  currentUserRole?: AuthUser['role'];
  currentUserId?: string;
  isSecretaryUser?: boolean;
  focusUserId?: string | null;
  onFocusHandled?: () => void;
}

const initialCreateForm: CreateUserPayload = {
  fullName: '',
  email: '',
  password: '',
  department: '',
  role: 'operador',
  phone: '',
};

const initialEditForm: UpdateUserPayload = {
  fullName: '',
  email: '',
  department: '',
  phone: '',
  role: 'operador',
};

const roleLabel: Record<AdminUser['role'], string> = {
  superadmin: 'ADMIN',
  admin: 'Admin',
  gestor: 'Gestor',
  operador: 'Operador',
};

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function isPhoneValid(value?: string | null): boolean {
  const digits = String(value || '').replace(/\D/g, '');
  return !digits || digits.length === 10 || digits.length === 11;
}

function isUserLocked(user: AdminUser): boolean {
  if (!user.lockedUntil) return false;
  return new Date(user.lockedUntil).getTime() > Date.now();
}

const AdminUsersPanel: React.FC<AdminUsersPanelProps> = ({ darkMode, currentUserRole, currentUserId, isSecretaryUser = false, focusUserId = null, onFocusHandled }) => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCreate, setSavingCreate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const [createForm, setCreateForm] = useState<CreateUserPayload>(initialCreateForm);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'active' | 'inactive'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | AdminUser['role']>('all');
  const [search, setSearch] = useState('');

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UpdateUserPayload>(initialEditForm);
  const [deleteConfirmMap, setDeleteConfirmMap] = useState<Record<string, string>>({});
  const [userToDeactivate, setUserToDeactivate] = useState<AdminUser | null>(null);
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  const [showCreatePassword, setShowCreatePassword] = useState(false);

  const isSuperAdmin = currentUserRole === 'superadmin';
  const isAdmin = currentUserRole === 'admin';
  const isGestor = currentUserRole === 'gestor';
  const isLimitedAdmin = isAdmin && isSecretaryUser;

  const inputClass = darkMode
    ? 'w-full rounded-xl border border-[#1E4D36] bg-[#0B2016] text-white px-3 py-2 outline-none focus:ring-2 focus:ring-[#1E8449]'
    : 'w-full rounded-xl border border-green-200 bg-white text-[#0F5132] px-3 py-2 outline-none focus:ring-2 focus:ring-[#1E8449]';

  const passwordRules = useMemo(
    () => [
      { label: '8+ caracteres', valid: createForm.password.length >= 8 },
      { label: '1 maiúscula', valid: /[A-Z]/.test(createForm.password) },
      { label: '1 minúscula', valid: /[a-z]/.test(createForm.password) },
      { label: '1 número', valid: /\d/.test(createForm.password) },
      { label: '1 especial', valid: /[^A-Za-z0-9]/.test(createForm.password) },
    ],
    [createForm.password]
  );
  const passwordStrong = passwordRules.every((rule) => rule.valid);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await userAdminService.list();
      setUsers(data);
    } catch {
      setError('Não foi possível carregar usuários.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (isGestor) setCreateForm((prev) => ({ ...prev, role: 'operador' }));
  }, [isGestor]);

  useEffect(() => {
    if (!focusUserId) return;
    const target = users.find((u) => u.id === focusUserId);
    if (!target) return;
    setSearch(target.email);
    openEditModal(target);
    setInfo(`Usuário ${target.fullName} aberto a partir da auditoria.`);
    onFocusHandled?.();
  }, [focusUserId, users]);

  const canManageUser = (user: AdminUser): boolean => {
    if (isSuperAdmin) return true;
    if (isLimitedAdmin) return user.role !== 'admin' && user.role !== 'superadmin';
    if (isAdmin) return user.role !== 'superadmin';
    if (isGestor) return user.role === 'operador';
    return false;
  };

  const canDeleteUser = (user: AdminUser): boolean => {
    if (isSuperAdmin) return user.id !== currentUserId;
    if (!isAdmin) return false;
    if (user.role === 'superadmin') return false;
    if (isLimitedAdmin && user.role === 'admin') return false;
    return user.id !== currentUserId;
  };

  const filteredUsers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return users.filter((u) => {
      const statusMatch =
        statusFilter === 'all' ||
        (statusFilter === 'pending' && !u.approvedAt) ||
        (statusFilter === 'active' && !!u.approvedAt && u.isActive) ||
        (statusFilter === 'inactive' && !u.isActive);
      const roleMatch = roleFilter === 'all' || u.role === roleFilter;
      const searchMatch =
        !normalizedSearch ||
        u.fullName.toLowerCase().includes(normalizedSearch) ||
        u.email.toLowerCase().includes(normalizedSearch);
      return statusMatch && roleMatch && searchMatch;
    });
  }, [users, statusFilter, roleFilter, search]);

  const pendingUsersCount = useMemo(() => users.filter((u) => !u.approvedAt).length, [users]);

  const openEditModal = (user: AdminUser) => {
    setEditingUserId(user.id);
    setEditForm({
      fullName: user.fullName,
      email: user.email,
      department: user.department,
      phone: user.phone || '',
      role: user.role,
    });
  };

  const closeEditModal = () => {
    setEditingUserId(null);
    setEditForm(initialEditForm);
  };

  const validateEditForm = (): string | null => {
    if ((editForm.fullName || '').trim().length < 5) return 'Nome completo inválido.';
    if (!/^\S+@\S+\.\S+$/.test((editForm.email || '').trim())) return 'E-mail inválido.';
    if ((editForm.department || '').trim().length < 2) return 'Setor obrigatório.';
    if (!isPhoneValid(editForm.phone || '')) return 'Telefone inválido. Use DDD + número.';
    if (isGestor && editForm.role !== 'operador') return 'Gestor não pode promover perfil acima de operador.';
    if (!isSuperAdmin && editForm.role === 'superadmin') return 'Apenas o ADMIN pode promover usuário para ADMIN.';
    if (isLimitedAdmin && (editForm.role === 'admin' || editForm.role === 'superadmin')) return 'Secretário não pode promover usuário para perfil administrativo.';
    return null;
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setInfo('');

    if (!isPhoneValid(createForm.phone || '')) return setError('Telefone inválido. Use DDD + número.');
    if (!isSuperAdmin && createForm.role === 'superadmin') return setError('Apenas o ADMIN pode criar outro ADMIN.');
    if (isLimitedAdmin && (createForm.role === 'admin' || createForm.role === 'superadmin')) return setError('Secretário não pode criar usuários administrativos.');
    if (isGestor && createForm.role !== 'operador') return setError('Gestor só pode criar usuário operador.');
    if (!passwordStrong) return setError('A senha não atende aos critérios de segurança.');

    setSavingCreate(true);
    try {
      const result = await userAdminService.create(createForm);
      setInfo(result.message);
      setCreateForm(isGestor ? { ...initialCreateForm, role: 'operador' } : initialCreateForm);
      await loadUsers();
    } catch (err: any) {
      setError(err?.message || 'Falha ao criar usuário.');
    } finally {
      setSavingCreate(false);
    }
  };

  const handleApprove = async (userId: string) => {
    setError('');
    setInfo('');
    try {
      await userAdminService.approve(userId);
      await loadUsers();
      setInfo('Usuário aprovado com sucesso.');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível aprovar o usuário.');
    }
  };

  const handleDeactivate = async (userId: string) => {
    setError('');
    setInfo('');
    try {
      await userAdminService.deactivate(userId);
      await loadUsers();
      setInfo('Usuário desativado com sucesso.');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível desativar o usuário.');
    }
  };

  const handleActivate = async (userId: string) => {
    setError('');
    setInfo('');
    try {
      await userAdminService.activate(userId);
      await loadUsers();
      setInfo('Usuário ativado com sucesso.');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível ativar o usuário.');
    }
  };

  const handleUnlock = async (userId: string) => {
    setError('');
    setInfo('');
    try {
      await userAdminService.unlock(userId);
      await loadUsers();
      setInfo('Conta desbloqueada com sucesso.');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível desbloquear a conta.');
    }
  };

  const handleSaveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingUserId) return;

    const validationError = validateEditForm();
    if (validationError) return setError(validationError);

    setSavingEdit(true);
    setError('');
    setInfo('');
    try {
      await userAdminService.update(editingUserId, {
        fullName: editForm.fullName?.trim(),
        email: editForm.email?.trim(),
        department: editForm.department?.trim(),
        phone: editForm.phone?.trim() ? formatPhone(editForm.phone) : '',
        role: editForm.role,
      });
      setInfo('Usuário atualizado com sucesso.');
      closeEditModal();
      await loadUsers();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível atualizar o usuário.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (user: AdminUser) => {
    const token = deleteConfirmMap[user.id] || '';
    if (token !== 'EXCLUIR') return setError('Para excluir definitivamente, digite EXCLUIR no campo da linha.');

    setDeletingId(user.id);
    setError('');
    setInfo('');
    try {
      await userAdminService.remove(user.id);
      setInfo(`Usuário ${user.fullName} excluído definitivamente.`);
      await loadUsers();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível excluir o usuário.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && <AlertBanner kind="error" message={error} />}
      {info && <AlertBanner kind="success" message={info} />}

      <section className={`rounded-3xl border p-6 shadow-xl ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-100 text-[#0F5132]'}`}>
        <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="inline-flex items-center gap-2 text-2xl font-black"><FiShield /> Administração de Usuários</h3>
          </div>
          <span className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-black uppercase ${darkMode ? 'bg-[#0B2016] text-green-300' : 'bg-green-50 text-green-700'}`}>
            Pendentes: {pendingUsersCount}
          </span>
        </div>

        <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3 md:grid-cols-2" autoComplete="off">
          <input className={inputClass} placeholder="Nome completo" value={createForm.fullName} onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })} required minLength={5} />
          <input className={inputClass} placeholder="E-mail institucional" type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} required />

          <div className="relative">
            <input className={inputClass} placeholder="Senha inicial forte" type={showCreatePassword ? 'text' : 'password'} value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} required minLength={8} />
            <button type="button" onClick={() => setShowCreatePassword((prev) => !prev)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-green-100 p-2 text-green-800" aria-label={showCreatePassword ? 'Ocultar senha' : 'Mostrar senha'}>
              {showCreatePassword ? <FiEyeOff size={14} /> : <FiEye size={14} />}
            </button>
            <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] font-semibold sm:grid-cols-3">
              {passwordRules.map((rule) => (
                <span key={rule.label} className={`inline-flex items-center gap-1 ${rule.valid ? 'text-emerald-600' : darkMode ? 'text-red-300' : 'text-red-600'}`}>
                  {rule.valid ? <FiCheckCircle size={10} /> : <FiCircle size={10} />}
                  {rule.label}
                </span>
              ))}
            </div>
          </div>

          <input className={inputClass} placeholder="Setor/Departamento" value={createForm.department} onChange={(e) => setCreateForm({ ...createForm, department: e.target.value })} required />
          <select className={inputClass} value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as CreateUserPayload['role'] })} disabled={isGestor}>
            <option value="operador">Operador</option>
            {!isGestor && <option value="gestor">Gestor</option>}
            {!isGestor && !isLimitedAdmin && <option value="admin">Admin</option>}
            {isSuperAdmin && <option value="superadmin">ADMIN</option>}
          </select>
          <input className={inputClass} placeholder="Telefone (DDD + número)" value={createForm.phone || ''} onChange={(e) => setCreateForm({ ...createForm, phone: formatPhone(e.target.value) })} />

          <div className="md:col-span-2 flex flex-wrap gap-2">
            <button type="submit" disabled={savingCreate} className="rounded-xl bg-[#1E8449] px-4 py-2 text-sm font-black uppercase text-white hover:bg-[#145A32] disabled:opacity-60">
              {savingCreate ? 'Criando...' : 'Criar usuário'}
            </button>
            <button type="button" onClick={loadUsers} className="rounded-xl border border-green-300 px-4 py-2 text-sm font-bold">
              Atualizar lista
            </button>
          </div>
        </form>
      </section>

      <section className={`rounded-3xl border p-6 shadow-xl ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-100 text-[#0F5132]'}`}>
        <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-4">
          <select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="all">Status: Todos</option>
            <option value="pending">Status: Pendente</option>
            <option value="active">Status: Ativo</option>
            <option value="inactive">Status: Inativo</option>
          </select>
          <select className={inputClass} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}>
            <option value="all">Perfil: Todos</option>
            <option value="operador">Operador</option>
            <option value="gestor">Gestor</option>
            <option value="admin">Admin</option>
            <option value="superadmin">ADMIN</option>
          </select>
          <input className={inputClass} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nome ou e-mail" />
          <button onClick={() => setSearch('')} className="rounded-xl border border-green-300 px-3 py-2 text-sm font-bold">Limpar busca</button>
        </div>

        {loading ? (
          <p className="font-semibold">Carregando usuários...</p>
        ) : filteredUsers.length === 0 ? (
          <p className="font-semibold opacity-70">Nenhum usuário encontrado para os filtros selecionados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-green-200 text-left text-[11px] uppercase tracking-widest opacity-80">
                  <th className="py-3">Nome</th>
                  <th className="py-3">E-mail</th>
                  <th className="py-3">Perfil</th>
                  <th className="py-3">Setor</th>
                  {isSuperAdmin && <th className="py-3">Aprovado por</th>}
                  <th className="py-3">Status</th>
                  <th className="py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const canManage = canManageUser(u);
                  const canDelete = canDeleteUser(u);
                  const locked = isUserLocked(u);
                  return (
                    <tr key={u.id} className="border-b border-green-900/10 align-top">
                      <td className="py-3 font-bold">{u.fullName}</td>
                      <td className="py-3">{u.email}</td>
                      <td className="py-3">{roleLabel[u.role]}</td>
                      <td className="py-3">{u.department}</td>
                      {isSuperAdmin && <td className="py-3">{u.approvedByName || '-'}</td>}
                      <td className="py-3">
                        <span className={`rounded-lg px-2 py-1 text-xs font-bold ${u.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                          {u.isActive ? 'Ativo' : 'Inativo'}
                        </span>
                        {!u.approvedAt && <span className="ml-2 rounded-lg bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">Pendente</span>}
                        {locked && (
                          <span className="ml-2 rounded-lg bg-red-100 px-2 py-1 text-xs font-bold text-red-800">
                            Bloqueado
                          </span>
                        )}
                        {locked && <div className="mt-1 text-[11px] opacity-70">Até {new Date(String(u.lockedUntil)).toLocaleString('pt-BR')}</div>}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {canManage && <button onClick={() => openEditModal(u)} className="rounded-lg bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-200">Editar</button>}
                          {!u.approvedAt && canManage && <button onClick={() => handleApprove(u.id)} className="rounded-lg bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800 hover:bg-blue-200">Aprovar</button>}
                          {locked && canManage && (
                            <button onClick={() => handleUnlock(u.id)} className="inline-flex items-center gap-1 rounded-lg bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-800 hover:bg-indigo-200">
                              <FiUnlock size={12} />
                              Desbloquear
                            </button>
                          )}
                          {u.isActive && canManage && <button onClick={() => setUserToDeactivate(u)} className="rounded-lg bg-red-100 px-3 py-1 text-xs font-bold text-red-800 hover:bg-red-200">Desativar</button>}
                          {!u.isActive && canManage && <button onClick={() => handleActivate(u.id)} className="rounded-lg bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-200">Ativar</button>}
                        </div>

                        {canDelete && (
                          <div className="mt-2 flex items-center gap-2">
                            <input
                              value={deleteConfirmMap[u.id] || ''}
                              onChange={(e) => setDeleteConfirmMap({ ...deleteConfirmMap, [u.id]: e.target.value })}
                              placeholder="Digite EXCLUIR"
                              className="rounded-lg border border-red-300 bg-white/90 px-2 py-1 text-xs text-[#6b1111] outline-none focus:ring-2 focus:ring-red-400"
                            />
                            <button disabled={deletingId === u.id} onClick={() => setUserToDelete(u)} className="rounded-lg bg-red-100 px-3 py-1 text-xs font-bold text-red-800 hover:bg-red-200 disabled:opacity-60">
                              {deletingId === u.id ? 'Excluindo...' : 'Excluir'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ModalDialog open={!!editingUserId} onClose={closeEditModal} title="Editar usuário" titleIcon={<FiEdit2 />} darkMode={darkMode} maxWidthClass="max-w-2xl">
        <form className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={handleSaveEdit} autoComplete="off">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider">Nome completo</label>
            <input className={inputClass} value={editForm.fullName || ''} onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })} required minLength={5} />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider">E-mail</label>
            <input className={inputClass} type="email" value={editForm.email || ''} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} required />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider">Setor</label>
            <input className={inputClass} value={editForm.department || ''} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })} required minLength={2} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider">Telefone</label>
            <input className={inputClass} value={editForm.phone || ''} onChange={(e) => setEditForm({ ...editForm, phone: formatPhone(e.target.value) })} placeholder="(81) 99999-9999" />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider">Perfil</label>
            <select className={inputClass} value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value as AdminUser['role'] })} disabled={isGestor}>
              <option value="operador">Operador</option>
              {!isGestor && <option value="gestor">Gestor</option>}
              {!isGestor && !isLimitedAdmin && <option value="admin">Admin</option>}
              {isSuperAdmin && <option value="superadmin">ADMIN</option>}
            </select>
          </div>
          <div className="md:col-span-2 mt-2 flex justify-end gap-2">
            <button type="button" onClick={closeEditModal} className="rounded-xl bg-gray-600 px-4 py-2 font-bold text-white hover:bg-gray-700">Cancelar</button>
            <button type="submit" disabled={savingEdit} className="rounded-xl bg-[#1E8449] px-4 py-2 font-black uppercase text-white hover:bg-[#145A32] disabled:opacity-60">{savingEdit ? 'Salvando...' : 'Salvar alterações'}</button>
          </div>
        </form>
      </ModalDialog>

      <ModalDialog
        open={!!userToDeactivate}
        onClose={() => setUserToDeactivate(null)}
        title="Confirmar desativação"
        titleIcon={<FiUserX />}
        darkMode={darkMode}
        maxWidthClass="max-w-md"
        footer={
          <>
            <button onClick={() => setUserToDeactivate(null)} className="rounded-lg bg-gray-600 px-4 py-2 font-bold text-white hover:bg-gray-700">Cancelar</button>
            <button
              onClick={async () => {
                if (!userToDeactivate) return;
                await handleDeactivate(userToDeactivate.id);
                setUserToDeactivate(null);
              }}
              className="rounded-lg bg-[#1E8449] px-4 py-2 font-bold text-white hover:bg-[#145A32]"
            >
              Confirmar
            </button>
          </>
        }
      >
        <p className="text-sm">Tem certeza que deseja desativar este usuário e revogar sessões ativas?</p>
        <p className="mt-2 text-sm font-bold">{userToDeactivate?.fullName}</p>
      </ModalDialog>

      <ModalDialog
        open={!!userToDelete}
        onClose={() => setUserToDelete(null)}
        title="Confirmar exclusão"
        titleIcon={<FiTrash2 />}
        darkMode={darkMode}
        maxWidthClass="max-w-md"
        footer={
          <>
            <button onClick={() => setUserToDelete(null)} className="rounded-lg bg-gray-600 px-4 py-2 font-bold text-white hover:bg-gray-700">Cancelar</button>
            <button
              disabled={!!userToDelete && deletingId === userToDelete.id}
              onClick={async () => {
                if (!userToDelete) return;
                await handleDelete(userToDelete);
                setUserToDelete(null);
              }}
              className="rounded-lg bg-red-600 px-4 py-2 font-bold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {!!userToDelete && deletingId === userToDelete.id ? 'Excluindo...' : 'Excluir permanentemente'}
            </button>
          </>
        }
      >
        <p className="text-sm">Esta ação é permanente. Confirma a exclusão?</p>
        <p className="mt-2 text-sm font-bold">{userToDelete?.fullName}</p>
        <p className="text-xs opacity-80">{userToDelete?.email}</p>
      </ModalDialog>
    </div>
  );
};

export default AdminUsersPanel;







