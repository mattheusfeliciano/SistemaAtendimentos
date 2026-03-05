import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiAlertTriangle, FiDownload, FiRefreshCw, FiShield } from 'react-icons/fi';
import { auditService, AuditLogItem, notificationService, NotificationItem } from '../services/api';
import AlertBanner from './ui/AlertBanner';

interface AuditPanelProps {
  darkMode: boolean;
  onOpenUser?: (userId: string) => void;
}

const AuditPanel: React.FC<AuditPanelProps> = ({ darkMode, onOpenUser }) => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [alerts, setAlerts] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(40);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({
    action: '',
    entity: '',
    userId: '',
    dateFrom: '',
    dateTo: '',
    securityOnly: false,
  });

  const inputClass = darkMode
    ? 'w-full rounded-xl border border-[#1E4D36] bg-[#0B2016] text-white px-3 py-2 outline-none focus:ring-2 focus:ring-[#1E8449]'
    : 'w-full rounded-xl border border-green-200 bg-white text-[#0F5132] px-3 py-2 outline-none focus:ring-2 focus:ring-[#1E8449]';

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  const loadAlerts = useCallback(async () => {
    const list = await notificationService.list();
    const critical = list
      .filter((item) => item.kind === 'warning' && (item.relatedEntity === 'security' || item.relatedEntity === 'user' || item.relatedEntity === 'auth'))
      .slice(0, 10);
    setAlerts(critical);
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await auditService.list({
        ...filters,
        page,
        limit,
      });
      setLogs(response.data || []);
      setTotal(response.pagination?.total || 0);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar os logs de auditoria.');
    } finally {
      setLoading(false);
    }
  }, [filters, page, limit]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    loadAlerts().catch(() => setAlerts([]));
  }, [loadAlerts]);

  const handleExport = async () => {
    setExporting(true);
    setError('');
    setInfo('');
    try {
      const blob = await auditService.exportCsv({
        ...filters,
        limit: 5000,
      });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setInfo('Arquivo CSV de auditoria exportado com sucesso.');
    } catch (err: any) {
      setError(err?.message || 'Falha ao exportar auditoria.');
    } finally {
      setExporting(false);
    }
  };

  const formatDetails = (details?: Record<string, unknown> | null): string => {
    if (!details) return '-';
    try {
      return JSON.stringify(details);
    } catch (_error) {
      return '-';
    }
  };

  const handleMarkAlertRead = async (notificationId: string) => {
    setError('');
    try {
      await notificationService.markRead(notificationId);
      setAlerts((prev) => prev.map((item) => (item.id === notificationId ? { ...item, readAt: new Date().toISOString() } : item)));
      setInfo('Alerta marcado como lido.');
    } catch (err: any) {
      setError(err?.message || 'Falha ao marcar alerta como lido.');
    }
  };

  const handlePresetLast24h = () => {
    const now = new Date();
    const from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    setFilters((prev) => ({
      ...prev,
      dateFrom: from.toISOString().slice(0, 10),
      dateTo: now.toISOString().slice(0, 10),
    }));
    setPage(1);
  };

  const handlePresetSecurity = () => {
    setFilters((prev) => ({
      ...prev,
      action: '',
      entity: '',
      userId: '',
      securityOnly: true,
    }));
    setPage(1);
  };

  const handleClearFilters = () => {
    setFilters({ action: '', entity: '', userId: '', dateFrom: '', dateTo: '', securityOnly: false });
    setPage(1);
  };

  const resolveRelatedUserId = (log: AuditLogItem): string | null => {
    if (log.entity === 'user' && log.entityId) return log.entityId;
    if (log.userId) return log.userId;
    return null;
  };

  return (
    <div className="space-y-6">
      {error && <AlertBanner kind="error" message={error} />}
      {info && <AlertBanner kind="success" message={info} />}

      <section className={`rounded-3xl border p-6 shadow-xl ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-100 text-[#0F5132]'}`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="inline-flex items-center gap-2 text-2xl font-black"><FiShield /> Auditoria de Segurança</h3>
          <div className="flex flex-wrap gap-2">
            <button onClick={loadLogs} className="inline-flex items-center gap-2 rounded-xl border border-green-300 px-4 py-2 text-sm font-bold">
              <FiRefreshCw size={14} />
              Atualizar
            </button>
            <button onClick={handleExport} disabled={exporting} className="inline-flex items-center gap-2 rounded-xl bg-[#1E8449] px-4 py-2 text-sm font-black uppercase text-white hover:bg-[#145A32] disabled:opacity-60">
              <FiDownload size={14} />
              {exporting ? 'Exportando...' : 'Exportar CSV'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          <input className={inputClass} placeholder="Ação (ex: LOGIN_FAILED)" value={filters.action} onChange={(e) => setFilters((prev) => ({ ...prev, action: e.target.value }))} />
          <input className={inputClass} placeholder="Entidade (ex: user)" value={filters.entity} onChange={(e) => setFilters((prev) => ({ ...prev, entity: e.target.value }))} />
          <input className={inputClass} placeholder="ID do usuário" value={filters.userId} onChange={(e) => setFilters((prev) => ({ ...prev, userId: e.target.value }))} />
          <input className={inputClass} type="date" value={filters.dateFrom} onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))} />
          <input className={inputClass} type="date" value={filters.dateTo} onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))} />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => { setPage(1); loadLogs(); }} className="rounded-xl bg-[#1E8449] px-4 py-2 text-xs font-black uppercase text-white hover:bg-[#145A32]">
            Aplicar filtros
          </button>
          <button onClick={handlePresetLast24h} className="rounded-xl border border-green-300 px-4 py-2 text-xs font-bold">
            Últimas 24h
          </button>
          <button onClick={handlePresetSecurity} className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-900">
            Somente segurança
          </button>
          <button
            onClick={handleClearFilters}
            className="rounded-xl border border-green-300 px-4 py-2 text-xs font-bold"
          >
            Limpar
          </button>
          <label className="inline-flex items-center gap-2 rounded-xl border border-green-300 px-3 py-2 text-xs font-bold">
            <input type="checkbox" checked={filters.securityOnly} onChange={(e) => setFilters((prev) => ({ ...prev, securityOnly: e.target.checked }))} />
            Security only
          </label>
        </div>
      </section>

      <section className={`rounded-3xl border p-6 shadow-xl ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-100 text-[#0F5132]'}`}>
        <h4 className="mb-4 text-lg font-black">Alertas Críticos Recentes</h4>
        {alerts.length === 0 ? (
          <p className="text-sm opacity-70">Sem alertas críticos recentes.</p>
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div key={alert.id} className={`rounded-xl border p-3 ${darkMode ? 'border-[#1E4D36] bg-[#0B2016]' : 'border-red-100 bg-red-50/60'}`}>
                <p className="inline-flex items-center gap-2 text-xs font-black uppercase"><FiAlertTriangle /> {alert.title}</p>
                <p className="mt-1 text-sm">{alert.message}</p>
                <p className="mt-1 text-[11px] opacity-70">{new Date(alert.createdAt).toLocaleString('pt-BR')}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {!alert.readAt && (
                    <button onClick={() => handleMarkAlertRead(alert.id)} className="rounded-lg bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-200">
                      Marcar como lido
                    </button>
                  )}
                  {alert.relatedEntity === 'user' && alert.relatedId && (
                    <button onClick={() => onOpenUser?.(alert.relatedId as string)} className="rounded-lg bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800 hover:bg-blue-200">
                      Abrir usuário
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={`rounded-3xl border p-6 shadow-xl ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-100 text-[#0F5132]'}`}>
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-lg font-black">Registros de Auditoria</h4>
          <p className="text-xs font-bold uppercase">Total: {total}</p>
        </div>

        {loading ? (
          <p className="font-semibold">Carregando auditoria...</p>
        ) : logs.length === 0 ? (
          <p className="font-semibold opacity-70">Nenhum log encontrado para os filtros informados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-xs">
              <thead>
                <tr className="border-b border-green-200 text-left uppercase tracking-widest opacity-80">
                  <th className="py-3">Data/Hora</th>
                  <th className="py-3">Usuário</th>
                  <th className="py-3">Ação</th>
                  <th className="py-3">Entidade</th>
                  <th className="py-3">IP</th>
                  <th className="py-3">Detalhes</th>
                  <th className="py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-green-900/10 align-top">
                    <td className="py-3 whitespace-nowrap">{new Date(log.createdAt).toLocaleString('pt-BR')}</td>
                    <td className="py-3">{log.userName}</td>
                    <td className="py-3 font-black">{log.action}</td>
                    <td className="py-3">{log.entity}{log.entityId ? `:${log.entityId}` : ''}</td>
                    <td className="py-3">{log.ipAddress || '-'}</td>
                    <td className="py-3 break-all opacity-80">{formatDetails(log.details)}</td>
                    <td className="py-3">
                      {resolveRelatedUserId(log) ? (
                        <button onClick={() => onOpenUser?.(resolveRelatedUserId(log) as string)} className="rounded-lg bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800 hover:bg-blue-200">
                          Abrir usuário
                        </button>
                      ) : (
                        <span className="text-[11px] opacity-60">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page <= 1}
            className="rounded-xl border border-green-300 px-4 py-2 text-xs font-bold disabled:opacity-50"
          >
            Página anterior
          </button>
          <p className="text-xs font-bold uppercase">Página {page} de {totalPages}</p>
          <button
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={page >= totalPages}
            className="rounded-xl border border-green-300 px-4 py-2 text-xs font-bold disabled:opacity-50"
          >
            Próxima página
          </button>
        </div>
      </section>
    </div>
  );
};

export default AuditPanel;
