import React from 'react';
import { FiX } from 'react-icons/fi';

interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  titleIcon?: React.ReactNode;
  darkMode?: boolean;
  maxWidthClass?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const ModalDialog: React.FC<ModalDialogProps> = ({
  open,
  onClose,
  title,
  titleIcon,
  darkMode = false,
  maxWidthClass = 'max-w-2xl',
  children,
  footer,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className={`w-full ${maxWidthClass} rounded-3xl border p-6 shadow-2xl ${darkMode ? 'bg-[#122D21] border-[#1E4D36] text-white' : 'bg-white border-slate-200 text-slate-800'}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h4 className="inline-flex items-center gap-2 text-xl font-black">
            {titleIcon ? <span className="text-[#1E8449]">{titleIcon}</span> : null}
            {title}
          </h4>
          <button onClick={onClose} className={`inline-flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-black uppercase ${darkMode ? 'bg-[#0B2016] text-green-200 hover:bg-[#163826]' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
            <FiX size={16} aria-hidden="true" />
            Fechar
          </button>
        </div>
        <div className="mt-4">{children}</div>
        {footer ? <div className="mt-5 flex justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  );
};

export default ModalDialog;
