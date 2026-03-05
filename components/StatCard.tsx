
import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  darkMode?: boolean;
  isFullScreen?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, darkMode, isFullScreen }) => {
  return (
    <div className={`rounded-2xl border transition-all duration-300 ${
      isFullScreen ? 'p-10 border-2' : 'p-6 border'
    } ${
      darkMode 
        ? 'bg-[#122D21] border-[#1E4D36] shadow-xl' 
        : 'bg-white border-green-100 shadow-sm'
    }`}>
      <div className={`flex items-center justify-between ${isFullScreen ? 'mb-8' : 'mb-4'}`}>
        <div className={`rounded-xl ${isFullScreen ? 'p-5' : 'p-3'} ${darkMode ? 'bg-green-900/40 text-green-400' : 'bg-green-50 text-[#1E8449]'}`}>
          {icon}
        </div>
      </div>
      <div>
        <h3 className={`font-bold uppercase tracking-widest mb-1 ${isFullScreen ? 'text-sm' : 'text-[10px]'} ${darkMode ? 'text-green-400' : 'text-gray-500'}`}>
          {label}
        </h3>
        <p className={`font-black tabular-nums tracking-tighter ${isFullScreen ? 'text-7xl' : 'text-4xl'} ${darkMode ? 'text-white' : 'text-[#0F5132]'}`}>
          {value}
        </p>
      </div>
    </div>
  );
};

export default StatCard;
