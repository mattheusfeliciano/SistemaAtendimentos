import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, authService } from '../services/api';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/dashboard';

  useEffect(() => {
    const favicon = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
    const previousHref = favicon?.href || '';
    if (favicon) favicon.href = '/favicon1.jpeg';
    return () => {
      if (favicon && previousHref) favicon.href = previousHref;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      await authService.login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.message.includes('pendente de aprovação')) {
        setError('Seu acesso ainda está pendente de aprovação do gestor responsável.');
      } else {
        setError('Falha no login. Verifique e-mail e senha.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 pb-24 overflow-hidden bg-gradient-to-br from-[#f3fcf6] via-[#e1f3e8] to-[#c8e8d6]">
      <div className="absolute -top-20 -left-16 w-72 h-72 rounded-full bg-[#54b57d]/30 blur-2xl animate-pulse" />
      <div className="absolute bottom-[-70px] right-[-40px] w-80 h-80 rounded-full bg-[#2e8f5a]/25 blur-2xl animate-pulse [animation-delay:900ms]" />
      <div className="absolute top-1/2 left-0 right-0 h-24 bg-gradient-to-r from-transparent via-white/35 to-transparent -rotate-12 animate-[pulse_5s_ease-in-out_infinite]" />

      <div className="relative mb-16 w-full max-w-md rounded-3xl border border-white/80 bg-white/85 backdrop-blur-md shadow-[0_18px_42px_rgba(10,62,38,0.16)] p-8">
        <div className="mb-7 text-center">
          <div className="mb-5 flex items-center justify-center">
            <img src="/sect-prefeitura.png" alt="SECT e Prefeitura de Toritama" className="h-14 object-contain" />
          </div>
          <h1 className="text-4xl font-black text-[#0F5132] tracking-tight">Acesso ao Sistema</h1>
          <p className="text-base text-[#1f6d48] mt-2">Entre com seu e-mail institucional.</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit} autoComplete="off">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#0F5132]">E-mail</label>
            <div className="relative mt-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#1E8449]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l9 6 9-6M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
              </svg>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="login-email"
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
                data-testid="login-password"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-xl border border-[#b8dfc8] bg-[#f5fbf7] px-4 py-3 pl-10 outline-none focus:ring-2 focus:ring-[#1E8449]"
              />
            </div>
          </div>

          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            data-testid="login-submit"
            className="w-full rounded-xl bg-[#1E8449] hover:bg-[#145A32] text-white font-black py-3 uppercase tracking-[0.12em] transition-all disabled:opacity-60"
          >
            {loading ? 'Validando...' : 'Entrar'}
          </button>
        </form>

        <div className="text-sm text-center mt-5 text-[#0F5132] space-y-1">
          <p>Novo usuário? Solicite seu cadastro para aprovação de gestor.</p>
          <Link to="/register" className="font-black text-[#1E8449] hover:underline">
            Ir para cadastro
          </Link>
        </div>
      </div>

      <footer className="fixed bottom-0 left-0 z-40 w-full border-t border-green-100 bg-white px-6 py-3 shadow-2xl">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between sm:flex-row">
          <div className="flex items-center gap-4">
            <img src="/logo-prefeitura.PNG" alt="Prefeitura de Toritama" className="h-auto w-28 object-contain" />
          </div>

          <div className="mt-2 flex items-center gap-6 sm:mt-0">
            <span className="hidden text-[9px] font-bold uppercase tracking-widest text-gray-400 lg:block">
              © 2026 Secretaria de Educação, Ciência e Tecnologia - Toritama/PE
            </span>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-[#1E8449] px-3 py-1 text-[10px] font-black text-white shadow-md">v1.1.0</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LoginPage;
