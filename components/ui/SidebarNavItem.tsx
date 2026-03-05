import React from 'react';
import { IconType } from 'react-icons';

interface SidebarNavItemProps {
  label: string;
  icon: IconType;
  active?: boolean;
  darkMode?: boolean;
  onClick: () => void;
}

const SidebarNavItem: React.FC<SidebarNavItemProps> = ({
  label,
  icon: Icon,
  active = false,
  darkMode = false,
  onClick,
}) => {
  const baseClass = 'w-full flex items-center gap-3 px-3 py-3 rounded-xl font-bold transition-all';
  const stateClass = active
    ? 'bg-[#1E8449] text-white shadow-lg shadow-green-900/20'
    : darkMode
    ? 'text-green-500/70 hover:bg-white/5'
    : 'text-gray-600 hover:bg-green-50';

  return (
    <button onClick={onClick} className={`${baseClass} ${stateClass}`}>
      <Icon className="h-5 w-5 shrink-0" />
      <span className="min-w-0 text-left text-sm leading-tight break-words">{label}</span>
    </button>
  );
};

export default SidebarNavItem;
