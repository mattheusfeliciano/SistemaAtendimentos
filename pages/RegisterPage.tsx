import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../services/api';

const PHONE_DIGITS = 11;

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, PHONE_DIGITS);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function isPhoneValid(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11;
}

const RegisterPage: React.FC = () => {
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const favicon = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
    const previousHref = favicon?.href || '';
    if (favicon) favicon.href = '/favicon1.jpeg';
    return () => {
      if (favicon && previousHref) favicon.href = previousHref;
    };
  }, []);

  const passwordRules = useMemo(
    () => [
      { label: 'Mínimo de 8 caracteres', valid: password.length >= 8 },
      { label: 'Pelo menos 1 letra maiúscula', valid: /[A-Z]/.test(password) },
      { label: 'Pelo menos 1 letra minúscula', valid: /[a-z]/.test(password) },
      { label: 'Pelo menos 1 número', valid: /\d/.test(password) },
      { label: 'Pelo menos 1 caractere especial', valid: /[^A-Za-z0-9]/.test(password) },
    ],
    [password]
  );

  const passwordStrong = passwordRules.every((rule) => rule.valid);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (password !== confirmPassword) {
      setError('As senhas não conferem.');
      return;
    }

    if (!passwordStrong) {
      setError('A senha não atende aos critérios de segurança.');
      return;
    }

    if (phone.trim() && !isPhoneValid(phone)) {
      setError('Telefone inválido. Use DDD + número.');
      return;
    }
    if (!acceptTerms || !acceptPrivacy) {
      setError('É obrigatório aceitar os Termos de Uso e a Política de Privacidade.');
      return;
    }

    setLoading(true);
    try {
      const result = await authService.register({
        fullName,
        email,
        password,
        department,
        phone: phone || undefined,
        termsAccepted: acceptTerms,
        privacyAccepted: acceptPrivacy,
      });
      setSuccess(result.message || 'Cadastro bem-sucedido! Agora aguarde aprovação do gestor.');
      setTimeout(() => navigate('/login', { replace: true }), 1800);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível concluir o cadastro. Verifique os dados.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-gradient-to-br from-[#effaf3] via-[#e2f5e9] to-[#d2ecde]">
      <div className="w-full max-w-3xl rounded-3xl border border-white/70 bg-white/90 backdrop-blur-sm shadow-[0_16px_40px_rgba(20,75,50,0.14)] p-8">
        <div className="mb-7 text-center">
          <img src="/sect-prefeitura.png" alt="SECT e Prefeitura de Toritama" className="h-14 mx-auto mb-5 object-contain" />
          <h1 className="text-4xl font-black text-[#0F5132] tracking-tight">Solicitar Cadastro</h1>
          <p className="text-base text-[#1f6d48] mt-2">Seu acesso será analisado e aprovado pelo gestor responsável.</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit} autoComplete="off">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[#0F5132]">Nome completo</label>
              <div className="relative mt-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#1E8449]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5.121 17.804A7 7 0 1118.88 17.8M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  minLength={5}
                  autoComplete="off"
                  className="w-full rounded-xl border border-[#b8dfc8] bg-[#f5fbf7] px-4 py-3 pl-10 outline-none focus:ring-2 focus:ring-[#1E8449]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#0F5132]">Setor/Departamento</label>
              <div className="relative mt-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#1E8449]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h16M4 12h16M4 17h10" />
                </svg>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  required
                  minLength={2}
                  autoComplete="off"
                  className="w-full rounded-xl border border-[#b8dfc8] bg-[#f5fbf7] px-4 py-3 pl-10 outline-none focus:ring-2 focus:ring-[#1E8449]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#0F5132]">Telefone com DDD</label>
              <div className="relative mt-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#1E8449]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.5 5.5A2 2 0 014.5 3.5h2.1a1 1 0 01.98.8l.6 3a1 1 0 01-.28.91l-1.3 1.3a16 16 0 007.2 7.2l1.3-1.3a1 1 0 01.91-.28l3 .6a1 1 0 01.8.98v2.1a2 2 0 01-2 2h-1C9.5 21.8 2.5 14.8 2.5 6.5v-1z" />
                </svg>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  placeholder="(81) 99999-9999"
                  autoComplete="off"
                  className="w-full rounded-xl border border-[#b8dfc8] bg-[#f5fbf7] px-4 py-3 pl-10 outline-none focus:ring-2 focus:ring-[#1E8449]"
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[#0F5132]">E-mail institucional</label>
              <div className="relative mt-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#1E8449]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l9 6 9-6M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
                </svg>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="off"
                  className="w-full rounded-xl border border-[#b8dfc8] bg-[#f5fbf7] px-4 py-3 pl-10 outline-none focus:ring-2 focus:ring-[#1E8449]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#0F5132]">Senha</label>
              <div className="relative mt-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#1E8449]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 11c1.105 0 2 .895 2 2v2h-4v-2c0-1.105.895-2 2-2zm6 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4m10 0V9a4 4 0 10-8 0v4" />
                </svg>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-[#b8dfc8] bg-[#f5fbf7] px-4 py-3 pl-10 outline-none focus:ring-2 focus:ring-[#1E8449]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#0F5132]">Confirmar senha</label>
              <div className="relative mt-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#1E8449]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 11c1.105 0 2 .895 2 2v2h-4v-2c0-1.105.895-2 2-2zm6 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4m10 0V9a4 4 0 10-8 0v4" />
                </svg>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-[#b8dfc8] bg-[#f5fbf7] px-4 py-3 pl-10 outline-none focus:ring-2 focus:ring-[#1E8449]"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#c7e9d5] bg-[#f3fbf6] p-4">
            <p className="text-xs font-black uppercase tracking-widest text-[#0F5132] mb-2">Senha forte recomendada</p>
            <ul className="space-y-1">
              {passwordRules.map((rule) => (
                <li key={rule.label} className={`text-sm font-semibold ${rule.valid ? 'text-emerald-700' : 'text-red-600'}`}>
                  {rule.valid ? '✅' : '⚠️'} {rule.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-[#c7e9d5] bg-[#f3fbf6] p-4 space-y-2">
            <label className="flex items-start gap-2 text-xs font-semibold text-[#0F5132]">
              <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#1E8449]" />
              <span>
                Li e aceito os{' '}
                <Link to="/termos-de-uso" target="_blank" rel="noopener noreferrer" className="font-black text-[#1E8449] hover:underline">
                  Termos de Uso
                </Link>
                .
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs font-semibold text-[#0F5132]">
              <input type="checkbox" checked={acceptPrivacy} onChange={(e) => setAcceptPrivacy(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#1E8449]" />
              <span>
                Li e aceito a{' '}
                <Link to="/politica-de-privacidade" target="_blank" rel="noopener noreferrer" className="font-black text-[#1E8449] hover:underline">
                  Política de Privacidade
                </Link>
                .
              </span>
            </label>
          </div>

          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
          {success && <p className="text-sm font-semibold text-emerald-700">{success}</p>}
          <button type="submit" disabled={loading} className="w-full rounded-xl bg-[#1E8449] hover:bg-[#145A32] text-white font-black py-3 uppercase tracking-[0.12em] transition-all disabled:opacity-60">
            {loading ? 'Enviando...' : 'Solicitar Cadastro'}
          </button>
        </form>

        <p className="text-sm text-center mt-5 text-[#0F5132]">
          Já tem conta?{' '}
          <Link to="/login" className="font-black text-[#1E8449] hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
