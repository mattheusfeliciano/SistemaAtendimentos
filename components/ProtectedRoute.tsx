import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authService } from '../services/api';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const [status, setStatus] = useState<'loading' | 'authorized' | 'unauthorized'>('loading');
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;

    authService
      .me()
      .then(() => {
        if (!cancelled) setStatus('authorized');
      })
      .catch(() => {
        if (!cancelled) setStatus('unauthorized');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#E9F5EE]">
        <div className="w-14 h-14 border-4 border-[#1E8449] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthorized') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
