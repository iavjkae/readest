'use client';

import { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeStore } from '@/store/themeStore';

/**
 * TrailBase password reset is typically handled via email links and the built-in auth UI.
 * This page keeps a minimal UX to avoid a hard dependency on any backend-specific auth UI.
 */
export default function TrailbaseRecoveryPage() {
  const _ = useTranslation();
  const { isDarkMode } = useThemeStore();
  const [message] = useState(
    _('Please use the password reset link in your email to complete the process.'),
  );

  return (
    <div className='flex min-h-screen items-center justify-center'>
      <div className='w-full max-w-md p-8'>
        <div className='text-center'>
          <h1 className='text-2xl font-semibold mb-4'>{_('Reset Password')}</h1>
          <p className={isDarkMode ? 'text-gray-300' : 'text-gray-700'}>{message}</p>
        </div>
      </div>
    </div>
  );
}
