import React, { useState } from 'react';
import { FiBell, FiGlobe, FiLayout, FiMail, FiMonitor, FiMoon, FiSave, FiShield, FiSun, FiUser } from 'react-icons/fi';
import { AuthUser } from '../services/api';
import AlertBanner from './ui/AlertBanner';

interface SettingsScreenProps {
  darkMode: boolean;
  currentUser: AuthUser;
  onToggleDarkMode: (value: boolean) => void;
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({ darkMode, currentUser, onToggleDarkMode }) => {
  const [emailDigest, setEmailDigest] = useState(true);
  const [desktopAlerts, setDesktopAlerts] = useState(true);
  const [compactMode, setCompactMode] = useState(false);

  const cardClass = darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-green-100 text-[#0F5132]';
  const fieldClass = darkMode
    ? 'w-full rounded-xl border border-[#1E4D36] bg-[#0B2016] px-4 py-3 text-white outline-none'
    : 'w-full rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-[#0F5132] outline-none';

  return (
    <div className="space-y-6">
      <section className={`overflow-hidden rounded-3xl border shadow-xl ${cardClass}`}>
        <div className={`px-6 py-6 ${darkMode ? 'bg-gradient-to-r from-[#0B2016] to-[#122D21]' : 'bg-gradient-to-r from-green-50 to-white'}`}>
          <h3 className="text-2xl font-black">Configurações</h3>
          <p className="mt-1 text-sm opacity-80">Preferências da conta, notificações e experiência de uso.</p>
        </div>
      </section>

      <AlertBanner kind="info" message="As preferências abaixo são locais da sessão atual e podem evoluir para persistência por usuário." />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className={`rounded-3xl border p-6 shadow-xl xl:col-span-2 ${cardClass}`}>
          <h4 className="flex items-center gap-2 text-lg font-black uppercase tracking-widest"><FiUser /> Perfil da conta</h4>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider">Nome completo</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-70"><FiUser size={16} /></span>
                <input className={`${fieldClass} pl-10`} value={currentUser.fullName} disabled />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider">E-mail</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-70"><FiMail size={16} /></span>
                <input className={`${fieldClass} pl-10`} value={currentUser.email} disabled />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider">Perfil</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-70"><FiShield size={16} /></span>
                <input className={`${fieldClass} pl-10`} value={currentUser.role} disabled />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider">Departamento</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 opacity-70"><FiLayout size={16} /></span>
                <input className={`${fieldClass} pl-10`} value={currentUser.department} disabled />
              </div>
            </div>
          </div>
        </section>

        <section className={`rounded-3xl border p-6 shadow-xl ${cardClass}`}>
          <h4 className="flex items-center gap-2 text-lg font-black uppercase tracking-widest"><FiGlobe /> Contexto</h4>
          <div className="mt-4 space-y-3 text-sm font-semibold">
            <div className={`rounded-xl border p-3 ${darkMode ? 'border-[#1E4D36] bg-[#0B2016]' : 'border-green-100 bg-green-50'}`}>
              <p className="text-xs font-black uppercase">Idioma</p>
              <p>Português (Brasil)</p>
            </div>
            <div className={`rounded-xl border p-3 ${darkMode ? 'border-[#1E4D36] bg-[#0B2016]' : 'border-green-100 bg-green-50'}`}>
              <p className="text-xs font-black uppercase">Fuso horário</p>
              <p>America/Sao_Paulo</p>
            </div>
            <div className={`rounded-xl border p-3 ${darkMode ? 'border-[#1E4D36] bg-[#0B2016]' : 'border-green-100 bg-green-50'}`}>
              <p className="text-xs font-black uppercase">Tema atual</p>
              <p className="inline-flex items-center gap-2">{darkMode ? <FiMoon /> : <FiSun />}{darkMode ? 'Escuro' : 'Claro'}</p>
            </div>
          </div>
        </section>
      </div>

      <section className={`rounded-3xl border p-6 shadow-xl ${cardClass}`}>
        <h4 className="flex items-center gap-2 text-lg font-black uppercase tracking-widest"><FiMonitor /> Aparência</h4>
        <p className="mt-1 text-sm opacity-80">Escolha o tema de visualização do sistema.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => onToggleDarkMode(false)}
            className={`rounded-2xl border p-4 text-left ${!darkMode ? 'border-[#1E8449] bg-green-100 text-green-900' : darkMode ? 'border-[#1E4D36] bg-[#0B2016]' : 'border-green-100 bg-green-50'}`}
          >
            <p className="inline-flex items-center gap-2 text-sm font-black uppercase"><FiSun /> Modo claro</p>
            <p className="text-xs opacity-80">Fundo claro com alto contraste para uso diurno.</p>
          </button>
          <button
            type="button"
            onClick={() => onToggleDarkMode(true)}
            className={`rounded-2xl border p-4 text-left ${darkMode ? 'border-[#1E8449] bg-[#1E8449]/20 text-white' : 'border-green-100 bg-green-50'}`}
          >
            <p className="inline-flex items-center gap-2 text-sm font-black uppercase"><FiMoon /> Modo escuro</p>
            <p className="text-xs opacity-80">Visual confortável para ambientes com pouca luz.</p>
          </button>
        </div>
      </section>

      <section className={`rounded-3xl border p-6 shadow-xl ${cardClass}`}>
        <h4 className="flex items-center gap-2 text-lg font-black uppercase tracking-widest"><FiShield /> Preferências de experiência</h4>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className={`rounded-2xl border p-4 ${darkMode ? 'border-[#1E4D36] bg-[#0B2016]' : 'border-green-100 bg-green-50'}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="inline-flex items-center gap-2 text-xs font-black uppercase"><FiMail /> Resumo por e-mail</p>
                <p className="text-sm opacity-80">Receber resumo diário.</p>
              </div>
              <input type="checkbox" checked={emailDigest} onChange={(e) => setEmailDigest(e.target.checked)} className="h-5 w-5" />
            </div>
          </label>

          <label className={`rounded-2xl border p-4 ${darkMode ? 'border-[#1E4D36] bg-[#0B2016]' : 'border-green-100 bg-green-50'}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="inline-flex items-center gap-2 text-xs font-black uppercase"><FiBell /> Alertas desktop</p>
                <p className="text-sm opacity-80">Sinalizar novas tarefas.</p>
              </div>
              <input type="checkbox" checked={desktopAlerts} onChange={(e) => setDesktopAlerts(e.target.checked)} className="h-5 w-5" />
            </div>
          </label>

          <label className={`rounded-2xl border p-4 ${darkMode ? 'border-[#1E4D36] bg-[#0B2016]' : 'border-green-100 bg-green-50'}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="inline-flex items-center gap-2 text-xs font-black uppercase"><FiLayout /> Modo compacto</p>
                <p className="text-sm opacity-80">Densidade alta de informação.</p>
              </div>
              <input type="checkbox" checked={compactMode} onChange={(e) => setCompactMode(e.target.checked)} className="h-5 w-5" />
            </div>
          </label>
        </div>

        <div className="mt-5 flex justify-end">
          <button className="inline-flex items-center gap-2 rounded-xl bg-[#1E8449] px-4 py-2 text-sm font-black uppercase text-white hover:bg-[#145A32]">
            <FiSave />
            Salvar preferências
          </button>
        </div>
      </section>
    </div>
  );
};

export default SettingsScreen;
