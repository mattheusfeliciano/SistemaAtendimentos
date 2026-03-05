import React from 'react';
import { Link } from 'react-router-dom';

const TermsOfUsePage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#E9F5EE] px-4 py-10">
      <div className="mx-auto w-full max-w-4xl rounded-3xl border border-green-100 bg-white p-8 shadow-xl text-[#0F5132]">
        <h1 className="text-3xl font-black">Termos de Uso</h1>
        <p className="mt-2 text-sm font-semibold">Versão: 2026-03-v1</p>

        <div className="mt-6 space-y-4 text-sm leading-relaxed">
          <p>Este sistema é destinado ao uso institucional da Secretaria de Educação, Ciência e Tecnologia.</p>
          <p>O acesso é pessoal e intransferível. O usuário é responsável por manter suas credenciais em sigilo.</p>
          <p>É proibido o uso do sistema para fins ilícitos, fraude, alteração indevida de dados ou acesso não autorizado.</p>
          <p>As ações realizadas podem ser registradas para fins de auditoria, segurança e conformidade administrativa.</p>
          <p>A gestão pode suspender acessos em caso de violação de política interna, uso indevido ou determinação legal.</p>
          <p>O uso continuado do sistema representa concordância com estes termos e suas futuras atualizações.</p>
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

export default TermsOfUsePage;
