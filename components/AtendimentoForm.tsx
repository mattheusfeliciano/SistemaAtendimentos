import React, { useEffect, useMemo, useState } from 'react';
import { atendimentoService, catalogOptionsService, CatalogOption } from '../services/api';
import { Atendimento, Turno } from '../types';

interface AtendimentoFormProps {
  onSave: (data: Omit<Atendimento, 'id' | 'createdAt'>) => Promise<void> | void;
  onClose: () => void;
  isStandalone?: boolean;
  darkMode?: boolean;
  initialData?: Omit<Atendimento, 'id' | 'createdAt'>;
  submitLabel?: string;
}

type MultiField = 'departamento' | 'local' | 'responsavel' | 'atividade';
type PickerField = MultiField | null;

const fieldLabel: Record<MultiField, string> = {
  departamento: 'Departamento',
  local: 'Local',
  responsavel: 'Responsável',
  atividade: 'Atividade',
};

const MULTI_SEPARATOR = '|';

const splitMulti = (value: string): string[] => {
  const items = String(value || '')
    .split(/[|,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : [''];
};

const joinMulti = (items: string[]): string => items.map((item) => item.trim()).filter(Boolean).join(` ${MULTI_SEPARATOR} `);

const AtendimentoForm: React.FC<AtendimentoFormProps> = ({
  onSave,
  onClose,
  isStandalone,
  darkMode,
  initialData,
  submitLabel,
}) => {
  const [formData, setFormData] = useState({
    data: initialData?.data ?? '',
    turno: initialData?.turno ?? Turno.MANHA,
    departamento: initialData?.departamento ?? '',
    atividade: initialData?.atividade ?? '',
    responsavel: initialData?.responsavel ?? '',
    local: initialData?.local ?? '',
  });

  const [catalogOptions, setCatalogOptions] = useState<CatalogOption[]>([]);
  const [responsavelSuggestions, setResponsavelSuggestions] = useState<string[]>([]);
  const [pickerField, setPickerField] = useState<PickerField>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerSelected, setPickerSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!initialData) return;
    setFormData({
      data: initialData.data,
      turno: initialData.turno,
      departamento: initialData.departamento,
      atividade: initialData.atividade,
      responsavel: initialData.responsavel,
      local: initialData.local,
    });
  }, [initialData]);

  useEffect(() => {
    const load = async () => {
      try {
        const items = await catalogOptionsService.list();
        setCatalogOptions(items);
      } catch {
        setCatalogOptions([]);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const loadResponsaveis = async () => {
      try {
        const atendimentos = await atendimentoService.getAll();
        const unique = Array.from<string>(
          new Set(
            atendimentos.flatMap((item) =>
              splitMulti(String(item.responsavel || '')).filter(Boolean)
            )
          )
        ).sort((a, b) => a.localeCompare(b, 'pt-BR'));
        setResponsavelSuggestions(unique);
      } catch {
        setResponsavelSuggestions([]);
      }
    };
    loadResponsaveis();
  }, []);

  const groupedOptions = useMemo(
    () => ({
      departamento: catalogOptions.filter((item) => item.type === 'departamento'),
      local: catalogOptions.filter((item) => item.type === 'local'),
      atividade: catalogOptions.filter((item) => item.type === 'atividade'),
      responsavel: catalogOptions.filter((item) => item.type === 'responsavel'),
    }),
    [catalogOptions]
  );

  const pickerOptions = useMemo(() => {
    if (!pickerField) return [];
    if (pickerField === 'responsavel') {
      const merged = [
        ...groupedOptions.responsavel.map((item) => item.value),
        ...responsavelSuggestions,
      ];
      return Array.from(new Set(merged.map((item) => item.trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'pt-BR')
      );
    }
    return groupedOptions[pickerField].map((item) => item.value);
  }, [groupedOptions, pickerField, responsavelSuggestions]);

  const filteredPickerOptions = useMemo(() => {
    if (!pickerField) return [];
    const term = pickerSearch.trim().toLowerCase();
    if (!term) return pickerOptions;
    return pickerOptions.filter((item) => item.toLowerCase().includes(term));
  }, [pickerField, pickerOptions, pickerSearch]);

  const inputClass = `w-full border rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#1E8449] transition-all ${
    darkMode
      ? 'bg-[#0B2016] border-[#1E4D36] text-white focus:border-green-400 placeholder:text-green-900'
      : 'bg-green-50/50 border-green-100 text-[#0F5132] placeholder:text-green-300'
  }`;
  const labelClass = `text-sm font-semibold uppercase tracking-wider ${darkMode ? 'text-green-400' : 'text-[#0F5132]'}`;

  const setMultiField = (field: MultiField, items: string[]) => {
    setFormData((prev) => ({ ...prev, [field]: joinMulti(items) }));
  };

  const getMultiItems = (field: MultiField) => splitMulti(formData[field]);

  const updateMultiItem = (field: MultiField, index: number, value: string) => {
    const next = [...getMultiItems(field)];
    next[index] = value;
    setMultiField(field, next);
  };

  const removeMultiItem = (field: MultiField, index: number) => {
    const next = getMultiItems(field).filter((_, i) => i !== index);
    setMultiField(field, next.length ? next : ['']);
  };

  const togglePickerOption = (value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    setPickerSelected((prev) => {
      const hasValue = prev.some((item) => item.toLowerCase() === normalized.toLowerCase());
      if (hasValue) return prev.filter((item) => item.toLowerCase() !== normalized.toLowerCase());
      return [...prev, normalized];
    });
  };

  const closePicker = () => {
    setPickerField(null);
    setPickerSearch('');
    setPickerSelected([]);
  };

  const openPicker = (field: MultiField) => {
    setPickerField(field);
    setPickerSearch('');
    setPickerSelected(getMultiItems(field).filter(Boolean));
  };

  const applyPickerSelection = () => {
    if (!pickerField || pickerSelected.length === 0) return;
    const existing = getMultiItems(pickerField).filter(Boolean);
    const merged = [...existing];
    pickerSelected.forEach((value) => {
      const normalized = value.trim();
      if (!normalized) return;
      const alreadyExists = merged.some((item) => item.toLowerCase() === normalized.toLowerCase());
      if (!alreadyExists) merged.push(normalized);
    });
    setMultiField(pickerField, merged.length ? merged : ['']);
    closePicker();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    if (!formData.data) {
      setSubmitError('Por favor, preencha a data.');
      return;
    }
    if (!joinMulti(getMultiItems('departamento')) || !joinMulti(getMultiItems('local')) || !joinMulti(getMultiItems('responsavel')) || !joinMulti(getMultiItems('atividade'))) {
      setSubmitError('Preencha os campos obrigatórios do atendimento.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        ...formData,
        departamento: joinMulti(getMultiItems('departamento')),
        local: joinMulti(getMultiItems('local')),
        responsavel: joinMulti(getMultiItems('responsavel')),
        atividade: joinMulti(getMultiItems('atividade')),
      });

      if (!isStandalone) onClose();
      if (isStandalone && !initialData) {
        setFormData({
          data: '',
          turno: Turno.MANHA,
          departamento: '',
          atividade: '',
          responsavel: '',
          local: '',
        });
      }
    } catch (error: any) {
      setSubmitError(error?.message || 'Não foi possível salvar o atendimento.');
    } finally {
      setSaving(false);
    }
  };

  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    const [year, rest] = value.split('-', 2);
    if (year && year.length > 4) {
      const normalized = `${year.slice(0, 4)}${rest ? `-${rest}` : ''}`;
      setFormData((prev) => ({ ...prev, data: normalized }));
      return;
    }
    setFormData((prev) => ({ ...prev, data: value }));
  };

  const renderMultiField = (
    field: MultiField,
    label: string,
    iconPath: string,
    placeholder: string,
    withPicker = false
  ) => {
    const items = getMultiItems(field);
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <label className={labelClass}>{label}</label>
          <div className="flex items-center gap-2">
            {withPicker && (
              <button
                type="button"
                onClick={() => openPicker(field)}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  darkMode ? 'border-[#1E4D36] text-green-300 hover:bg-[#0B2016]' : 'border-green-200 text-[#1E8449] hover:bg-green-50'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m-7-7h14" />
                </svg>
                Adicionar
              </button>
            )}
          </div>
        </div>
        <div className="space-y-2">
          {items.map((item, index) => (
            <div className="flex items-center gap-2" key={`${field}-${index}`}>
              <div className="relative flex-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#1E8449]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={iconPath} />
                </svg>
                <input
                  type="text"
                  required={index === 0}
                  value={item}
                  onChange={(e) => updateMultiItem(field, index, e.target.value)}
                  placeholder={placeholder}
                  className={`${inputClass} pl-10`}
                  autoComplete="off"
                />
              </div>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeMultiItem(field, index)}
                  className="rounded-lg border border-red-200 px-2 py-2 text-red-700 transition-colors hover:bg-red-50"
                  aria-label="Remover campo"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const formContent = (
    <div className={`font-['Segoe_UI',sans-serif] border rounded-3xl w-full shadow-lg overflow-hidden transition-colors ${darkMode ? 'bg-[#122D21] border-[#1E4D36]' : 'bg-white border-green-100'}`}>
      <div className={`px-4 py-4 sm:px-8 sm:py-6 border-b flex justify-between items-center ${darkMode ? 'bg-green-950/20 border-[#1E4D36]' : 'bg-green-50/30 border-green-50'}`}>
        <h2 className={`text-xl font-semibold uppercase tracking-tight flex items-center gap-2 ${darkMode ? 'text-white' : 'text-[#0F5132]'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#1E8449]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2a3 3 0 013-3h0a3 3 0 013 3v2m-9 4h12a2 2 0 002-2V7a2 2 0 00-2-2h-3.5l-1-2h-3l-1 2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Registro de Atendimento
        </h2>
        {!isStandalone && (
          <button onClick={onClose} className={darkMode ? 'text-green-400' : 'text-green-800'}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-5 sm:p-8 sm:space-y-6" autoComplete="off">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2 relative">
            <label className={labelClass}>Data do Atendimento</label>
            <input id="atendimento_data" type="date" name="data" required value={formData.data} onChange={handleDateChange} max="9999-12-31" className={`${inputClass} pr-10`} autoComplete="off" />
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute right-3 top-1/2 transform -translate-y-1/2 cursor-pointer calendar-icon" onClick={() => {
              const el = document.getElementById('atendimento_data') as HTMLInputElement | null;
              if (!el) return;
              if (typeof (el as HTMLInputElement & { showPicker?: () => void }).showPicker === 'function') {
                try {
                  (el as HTMLInputElement & { showPicker: () => void }).showPicker();
                  return;
                } catch {}
              }
              el.focus();
            }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="space-y-2 relative">
            <label className={labelClass}>Turno</label>
            <svg xmlns="http://www.w3.org/2000/svg" className="pointer-events-none absolute left-3 top-[42px] h-5 w-5 text-[#1E8449]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l2.5 2.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <select name="turno" required value={formData.turno} onChange={(e) => setFormData((prev) => ({ ...prev, turno: e.target.value as Turno }))} className={`${inputClass} pl-10`} autoComplete="off">
              {Object.values(Turno).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {renderMultiField('departamento', 'Departamento', 'M3 21h18M5 21V7l7-4 7 4v14M9 10h1m0 4h1m4-4h1m0 4h1M10 21v-4h4v4', 'Selecione ou digite', true)}
          {renderMultiField('responsavel', 'Responsável', 'M5.121 17.804A7 7 0 1118.88 17.8M15 11a3 3 0 11-6 0 3 3 0 016 0z', 'Nome do profissional', true)}
        </div>

        {renderMultiField('local', 'Local', 'M17.657 16.657L13.414 12.414a2 2 0 010-2.828l4.243-4.243a2 2 0 012.828 0l.707.707a2 2 0 010 2.828l-7.778 7.778a2 2 0 01-2.828 0L3.343 9.414a2 2 0 010-2.828l.707-.707a2 2 0 012.828 0l2.122 2.121', 'Selecione ou digite', true)}
        {renderMultiField('atividade', 'Atividade / Observações', 'M7 8h10M7 12h10M7 16h6M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z', 'Selecione ou descreva a atividade', true)}

        {submitError && <p className="text-sm font-bold text-red-600">{submitError}</p>}
        <button type="submit" disabled={saving} className="w-full bg-[#1E8449] hover:bg-[#145A32] text-white font-semibold py-5 rounded-xl transition-all shadow-md uppercase tracking-widest disabled:opacity-60">
          {saving ? 'Salvando...' : (submitLabel || 'Salvar Registro')}
        </button>
      </form>
    </div>
  );

  return (
    <>
      {isStandalone ? formContent : <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4"><div className="max-w-4xl w-full max-h-[92vh] overflow-y-auto">{formContent}</div></div>}

      {pickerField && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={closePicker}>
          <div className={`w-full max-w-2xl rounded-3xl border shadow-lg p-5 sm:p-8 ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-100 text-[#0F5132]'}`} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-[#1E8449]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m-7-7h14" />
              </svg>
              Adicionar {fieldLabel[pickerField]}
            </h3>
            <div className="relative mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1E8449]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.2-4.2m1.2-4.8a6 6 0 11-12 0 6 6 0 0112 0z" />
              </svg>
              <input value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} placeholder={`Buscar ${fieldLabel[pickerField].toLowerCase()}...`} className={`${inputClass} pl-10`} autoComplete="off" />
            </div>
            <div className={`rounded-2xl border ${darkMode ? 'border-[#1E4D36] bg-[#0B2016]' : 'border-green-100 bg-green-50/40'} p-3 max-h-80 overflow-y-auto`}>
              {filteredPickerOptions.length === 0 ? (
                <p className="text-sm font-semibold opacity-70 px-2 py-3">Nenhuma opção cadastrada.</p>
              ) : (
                <div className="space-y-2">
                  {filteredPickerOptions.map((item) => {
                    const isSelected = pickerSelected.some((selected) => selected.toLowerCase() === item.toLowerCase());
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => togglePickerOption(item)}
                        className={`w-full text-left px-4 py-3 rounded-xl font-semibold border transition-colors ${
                          isSelected
                            ? darkMode
                              ? 'border-green-400 bg-[#123b2a]'
                              : 'border-green-300 bg-green-100'
                            : darkMode
                            ? 'border-[#1E4D36] hover:bg-[#123b2a]'
                            : 'border-green-100 bg-white hover:bg-green-50'
                        }`}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="truncate">{item}</span>
                          {isSelected ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#1E8449]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <circle cx="12" cy="12" r="9" strokeWidth={2} />
                            </svg>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold opacity-80">{pickerSelected.length} selecionado(s)</p>
              <div className="flex gap-2">
                <button onClick={closePicker} className="px-5 py-2 rounded-lg border border-green-300 font-bold">
                  Cancelar
                </button>
                <button
                  onClick={applyPickerSelection}
                  disabled={pickerSelected.length === 0}
                  className="px-5 py-2 rounded-lg bg-[#1E8449] text-white font-black disabled:opacity-60"
                >
                  Adicionar selecionados
                </button>
              </div>
            </div>
            {pickerField === 'responsavel' && <p className="mt-3 text-xs opacity-70">Dica: selecione um ou mais responsáveis e confirme em "Adicionar selecionados".</p>}
          </div>
        </div>
      )}
    </>
  );
};

export default AtendimentoForm;

