import React, { useEffect, useMemo, useState } from 'react';
import { FiEdit2, FiList, FiTrash2 } from 'react-icons/fi';
import { catalogOptionsService, CatalogOption, CatalogOptionType, AuthUser } from '../services/api';
import AlertBanner from './ui/AlertBanner';
import ModalDialog from './ui/ModalDialog';

interface CatalogOptionsPanelProps {
  darkMode: boolean;
  currentUserRole?: AuthUser['role'];
}

const optionTypeLabel: Record<CatalogOptionType, string> = {
  departamento: 'Departamentos',
  local: 'Locais',
  atividade: 'Atividades',
  responsavel: 'Responsáveis',
};

const optionTypePlaceholder: Record<CatalogOptionType, string> = {
  departamento: 'Ex.: Coordenação Pedagógica, Secretaria Escolar',
  local: 'Ex.: Sala de Reunião 02, Biblioteca',
  atividade: 'Ex.: Atendimento ao professor, Reunião pedagógica',
  responsavel: 'Ex.: Matheus Silva, João Souza',
};

const splitBatchValues = (rawValue: string): string[] => {
  const parts = rawValue
    .split(/[\n,;|]+/)
    .map((item) => item.trim().toUpperCase())
    .filter((item) => item.length >= 2);

  const unique: string[] = [];
  const seen = new Set<string>();

  for (const item of parts) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  return unique;
};

const CatalogOptionsPanel: React.FC<CatalogOptionsPanelProps> = ({ darkMode, currentUserRole }) => {
  const [options, setOptions] = useState<CatalogOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [type, setType] = useState<CatalogOptionType>('departamento');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [optionToDelete, setOptionToDelete] = useState<CatalogOption | null>(null);
  const [editingOption, setEditingOption] = useState<CatalogOption | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const panelClass = darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-100 text-[#0F5132]';
  const inputClass = darkMode
    ? 'w-full rounded-xl border border-[#1E4D36] bg-[#0B2016] text-white px-4 py-3 outline-none focus:ring-2 focus:ring-[#1E8449]'
    : 'w-full rounded-xl border border-green-200 bg-green-50 px-4 py-3 outline-none focus:ring-2 focus:ring-[#1E8449]';
  const canDelete = currentUserRole === 'admin' || currentUserRole === 'gestor';

  const loadOptions = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await catalogOptionsService.list();
      setOptions(data);
    } catch {
      setError('Não foi possível carregar as opções padronizadas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOptions();
  }, []);

  const grouped = useMemo(
    () => ({
      departamento: options.filter((item) => item.type === 'departamento'),
      local: options.filter((item) => item.type === 'local'),
      atividade: options.filter((item) => item.type === 'atividade'),
      responsavel: options.filter((item) => item.type === 'responsavel'),
    }),
    [options]
  );

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setInfo('');

    const valuesToCreate = splitBatchValues(value);
    if (valuesToCreate.length === 0) {
      setError('Informe ao menos 1 opção válida (mínimo 2 caracteres).');
      return;
    }

    setSaving(true);
    try {
      const failedValues: string[] = [];

      for (const item of valuesToCreate) {
        try {
          await catalogOptionsService.create(type, item);
        } catch {
          failedValues.push(item);
        }
      }

      const successCount = valuesToCreate.length - failedValues.length;
      if (successCount > 0 && failedValues.length === 0) {
        setInfo(`${successCount} ${optionTypeLabel[type].toLowerCase()} adicionada(s) com sucesso.`);
      } else if (successCount > 0) {
        setInfo(`${successCount} opção(ões) adicionada(s). Não foi possível adicionar: ${failedValues.join(', ')}.`);
      } else {
        setError('Nenhuma opção foi adicionada. Verifique se já existem valores iguais.');
      }

      setValue('');
      await loadOptions();
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (option: CatalogOption) => {
    setRemovingId(option.id);
    setError('');
    setInfo('');
    try {
      await catalogOptionsService.remove(option.id);
      setInfo('Opção removida com sucesso.');
      await loadOptions();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível remover esta opção.');
    } finally {
      setRemovingId(null);
    }
  };

  const openEdit = (option: CatalogOption) => {
    setEditingOption(option);
    setEditingValue(option.value);
    setError('');
    setInfo('');
  };

  const cancelEdit = () => {
    setEditingOption(null);
    setEditingValue('');
  };

  const handleSaveEdit = async (option: CatalogOption) => {
    const normalized = editingValue.trim().toUpperCase();
    if (normalized.length < 2) {
      setError('Informe ao menos 2 caracteres para editar a opção.');
      return;
    }

    setSavingEdit(true);
    setError('');
    setInfo('');
    try {
      await catalogOptionsService.update(option.id, normalized);
      setInfo('Opção atualizada com sucesso.');
      cancelEdit();
      await loadOptions();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível editar esta opção.');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className={`p-8 rounded-3xl border shadow-xl ${panelClass}`}>
        <h3 className="text-2xl font-black mb-2">Padronização de Cadastro</h3>
        <p className="text-sm font-semibold opacity-80 mb-6">
          Cadastre opções oficiais para manter departamentos, locais, atividades e responsáveis padronizados.
        </p>
        <p className="text-xs font-semibold opacity-70 mb-4">
          Dica: use vírgula, ponto e vírgula, barra vertical ou quebra de linha para adicionar várias opções de uma vez.
        </p>

        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-4" autoComplete="off">
          <select className={inputClass} value={type} onChange={(e) => setType(e.target.value as CatalogOptionType)}>
            <option value="departamento">Departamento</option>
            <option value="local">Local</option>
            <option value="atividade">Atividade</option>
            <option value="responsavel">Responsável</option>
          </select>
          <input className={`${inputClass} uppercase`} value={value} onChange={(e) => setValue(e.target.value.toUpperCase())} placeholder={optionTypePlaceholder[type]} />
          <button type="submit" disabled={saving} className="rounded-xl bg-[#1E8449] hover:bg-[#145A32] text-white font-black uppercase tracking-wider px-4 py-3 disabled:opacity-60">
            {saving ? 'Salvando...' : 'Adicionar'}
          </button>
        </form>

        {error && <div className="mt-4"><AlertBanner kind="error" message={error} /></div>}
        {info && <div className="mt-4"><AlertBanner kind="success" message={info} /></div>}
      </div>

      <div className={`p-8 rounded-3xl border shadow-xl ${panelClass}`}>
        <h4 className="text-xl font-black mb-5">Opções Cadastradas</h4>
        {loading ? (
          <p className="font-semibold">Carregando opções...</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {(Object.keys(grouped) as CatalogOptionType[]).map((groupType) => (
              <div key={groupType} className={`rounded-2xl border p-4 ${darkMode ? 'border-[#1E4D36] bg-[#0B2016]' : 'border-green-100 bg-green-50/50'}`}>
                <h5 className="text-sm font-black uppercase tracking-widest text-[#1E8449] mb-3">{optionTypeLabel[groupType]}</h5>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {grouped[groupType].length === 0 ? (
                    <p className="text-xs opacity-70">Nenhuma opção cadastrada.</p>
                  ) : (
                    grouped[groupType].map((item) => (
                      <div key={item.id} className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 border ${darkMode ? 'border-[#1E4D36]' : 'border-green-100 bg-white'}`}>
                        <span className="text-sm font-semibold">{item.value}</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(item)} className="inline-flex items-center justify-center rounded-lg bg-blue-100 p-2 text-blue-700 hover:bg-blue-200" aria-label="Editar opção" title="Editar">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487l2.651 2.651m-1.591-3.712a2.25 2.25 0 013.182 3.182L7.5 20.25 3 21l.75-4.5 13.522-13.074z" />
                            </svg>
                          </button>
                          {canDelete && (
                            <button onClick={() => setOptionToDelete(item)} disabled={removingId === item.id} className="inline-flex items-center justify-center rounded-lg bg-red-100 p-2 text-red-700 hover:bg-red-200 disabled:opacity-60" aria-label="Excluir opção" title="Excluir">
                              {removingId === item.id ? (
                                <span className="text-xs font-black">...</span>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0v12a1 1 0 001 1h8a1 1 0 001-1V7" />
                                </svg>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ModalDialog
        open={!!optionToDelete}
        onClose={() => setOptionToDelete(null)}
        title="Confirmar exclusão"
        titleIcon={<FiTrash2 />}
        darkMode={darkMode}
        maxWidthClass="max-w-md"
        footer={
          <>
            <button onClick={() => setOptionToDelete(null)} className="px-4 py-2 rounded-lg bg-gray-600 text-white font-bold hover:bg-gray-700">
              Cancelar
            </button>
            <button
              onClick={async () => {
                if (!optionToDelete) return;
                await handleRemove(optionToDelete);
                setOptionToDelete(null);
              }}
              className="px-4 py-2 rounded-lg bg-[#1E8449] text-white font-bold hover:bg-[#145A32]"
            >
              Excluir permanentemente
            </button>
          </>
        }
      >
        <p className="text-sm mb-3">Deseja excluir permanentemente esta opção padronizada?</p>
        <p className="text-sm font-bold">{optionToDelete?.value}</p>
      </ModalDialog>

      <ModalDialog
        open={!!editingOption}
        onClose={cancelEdit}
        title="Editar opção padronizada"
        titleIcon={<FiEdit2 />}
        darkMode={darkMode}
        maxWidthClass="max-w-md"
        footer={
          <>
            <button onClick={cancelEdit} className="px-4 py-2 rounded-lg bg-gray-600 text-white font-bold hover:bg-gray-700">
              Cancelar
            </button>
            <button
              onClick={() => editingOption && handleSaveEdit(editingOption)}
              disabled={savingEdit}
              className="px-4 py-2 rounded-lg bg-[#1E8449] text-white font-bold hover:bg-[#145A32] disabled:opacity-60"
            >
              {savingEdit ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        }
      >
        <p className="text-xs opacity-80 mb-3">Tipo: {editingOption ? optionTypeLabel[editingOption.type] : '-'}</p>
        <input value={editingValue} onChange={(e) => setEditingValue(e.target.value.toUpperCase())} className={inputClass} autoFocus />
        <div className={`mt-3 rounded-xl border p-3 ${darkMode ? 'border-[#1E4D36] bg-[#0B2016]' : 'border-green-100 bg-green-50'}`}>
          <p className="text-[11px] font-black uppercase tracking-wider opacity-80">Visualização completa</p>
          <p className="mt-1 text-sm font-semibold break-words">{editingValue || '-'}</p>
        </div>
      </ModalDialog>
    </div>
  );
};

export default CatalogOptionsPanel;



