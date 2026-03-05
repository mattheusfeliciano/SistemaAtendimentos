import React from 'react';
import { FiAlertCircle, FiAlertTriangle, FiCheckCircle, FiInfo } from 'react-icons/fi';

type AlertKind = 'success' | 'error' | 'warning' | 'info';

interface AlertBannerProps {
  kind?: AlertKind;
  title?: string;
  message: string;
  className?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  onClose?: () => void;
}

const styleMap: Record<AlertKind, string> = {
  success: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  error: 'border-red-300 bg-red-50 text-red-800',
  warning: 'border-amber-300 bg-amber-50 text-amber-800',
  info: 'border-sky-300 bg-sky-50 text-sky-800',
};

const iconMap: Record<AlertKind, string> = {
  success: 'Sucesso',
  error: 'Erro',
  warning: 'Aviso',
  info: 'Info',
};

const iconNodeMap: Record<AlertKind, React.ReactNode> = {
  success: <FiCheckCircle size={16} aria-hidden="true" />,
  error: <FiAlertCircle size={16} aria-hidden="true" />,
  warning: <FiAlertTriangle size={16} aria-hidden="true" />,
  info: <FiInfo size={16} aria-hidden="true" />,
};

const AlertBanner: React.FC<AlertBannerProps> = ({
  kind = 'info',
  title,
  message,
  className = '',
  actionLabel,
  actionHref,
  onAction,
  onClose,
}) => {
  return (
    <div className={`rounded-xl border px-4 py-3 ${styleMap[kind]} ${className}`} role="status" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
            {iconNodeMap[kind]}
            {title || iconMap[kind]}
          </p>
          <p className="mt-1 text-sm font-semibold">{message}</p>
          {(actionLabel && (actionHref || onAction)) ? (
            actionHref ? (
              <a href={actionHref} className="mt-2 inline-block text-xs font-bold underline underline-offset-2">
                {actionLabel}
              </a>
            ) : (
              <button type="button" onClick={onAction} className="mt-2 text-xs font-bold underline underline-offset-2">
                {actionLabel}
              </button>
            )
          ) : null}
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-black uppercase opacity-80 hover:opacity-100"
            aria-label="Fechar alerta"
          >
            Fechar
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default AlertBanner;

