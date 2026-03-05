import React from 'react';
import { Link } from 'react-router-dom';

const PrivacyPolicyPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#E9F5EE] px-4 py-10">
      <div className="mx-auto w-full max-w-4xl rounded-3xl border border-green-100 bg-white p-8 shadow-xl text-[#0F5132]">
        <h1 className="text-3xl font-black">Política de Privacidade</h1>
        <p className="mt-2 text-sm font-semibold">Versão: 2026-03-v1</p>

        <div className="mt-6 space-y-4 text-sm leading-relaxed">
          <p>Coletamos apenas os dados necessários para autenticação, operação, segurança e auditoria do sistema.</p>
          <p>Os dados podem incluir identificação do usuário, histórico de uso, metadados de sessão e registros operacionais.</p>
          <p>As informações são tratadas com medidas técnicas e administrativas de segurança adequadas ao contexto institucional.</p>
          <p>O acesso aos dados é restrito por perfil de permissão e necessidade operacional.</p>
          <p>Dados podem ser compartilhados quando houver obrigação legal, ordem administrativa ou determinação judicial.</p>
          <p>Ao utilizar a plataforma, o usuário declara ciência e concordância com esta política.</p>
        </div>

        <div className="mt-8">
          <Link to="/login" className="inline-flex rounded-xl bg-[#1E8449] px-4 py-2 text-sm font-black text-white hover:bg-[#145A32]">
            Voltar ao login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
