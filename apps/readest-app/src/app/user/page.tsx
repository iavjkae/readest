'use client';

import clsx from 'clsx';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useEnv } from '@/context/EnvContext';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useUserActions } from '@/hooks/useUserActions';
import { navigateToLibrary } from '@/utils/nav';
import { Toast } from '@/components/Toast';
import LegalLinks from '@/components/LegalLinks';
import Spinner from '@/components/Spinner';
import ProfileHeader from './components/Header';
import UserInfo from './components/UserInfo';
import AccountActions from './components/AccountActions';
import StorageManager from './components/StorageManager';

const ProfilePage = () => {
  const _ = useTranslation();
  const router = useRouter();
  const { appService } = useEnv();
  const { token, user, refresh } = useAuth();
  const { safeAreaInsets, isRoundedWindow } = useThemeStore();

  const [loading] = useState(false);
  const [showStorageManager, setShowStorageManager] = useState(false);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useTheme({ systemUIVisible: false });

  const { handleLogout, handleResetPassword, handleUpdateEmail, handleConfirmDelete } =
    useUserActions();

  const handleGoBack = () => {
    if (showStorageManager) {
      setShowStorageManager(false);
      refresh();
    } else {
      navigateToLibrary(router);
    }
  };

  const handleDeleteWithMessage = () => {
    handleConfirmDelete(_('Failed to delete user. Please try again later.'));
  };

  const handleManageStorage = () => {
    setShowStorageManager(true);
  };

  if (!mounted) {
    return null;
  }

  if (!user || !token || !appService) {
    return (
      <div className='mx-auto max-w-4xl px-4 py-8'>
        <div className='overflow-hidden rounded-lg shadow-md'>
          <div className='flex min-h-[300px] items-center justify-center p-6'>
            <div className='text-base-content animate-pulse'>{_('Loading profile...')}</div>
          </div>
        </div>
      </div>
    );
  }

  const avatarUrlRaw = user?.user_metadata?.['picture'] ?? user?.user_metadata?.['avatar_url'];
  const avatarUrl = typeof avatarUrlRaw === 'string' ? avatarUrlRaw : undefined;

  const userFullNameRaw = user?.user_metadata?.['full_name'];
  const userFullName =
    typeof userFullNameRaw === 'string' && userFullNameRaw.trim() ? userFullNameRaw : '-';
  const userEmail = user?.email || '';

  return (
    <div
      className={clsx(
        'bg-base-100 full-height inset-0 select-none overflow-hidden',
        appService?.hasRoundedWindow && isRoundedWindow && 'window-border rounded-window',
      )}
    >
      <div
        className={clsx('flex h-full w-full flex-col items-center overflow-y-auto')}
        style={{
          paddingTop: `${safeAreaInsets?.top || 0}px`,
        }}
      >
        <ProfileHeader onGoBack={handleGoBack} />
        <div className='w-full min-w-60 max-w-4xl py-10'>
          {loading && (
            <div className='fixed inset-0 z-50 flex items-center justify-center'>
              <Spinner loading className='text-gray-900' />
            </div>
          )}
          <div className='sm:bg-base-200 overflow-hidden rounded-lg sm:p-6 sm:shadow-md'>
            <div className='flex flex-col gap-y-8'>
              <div className='flex flex-col gap-y-8 px-6'>
                <UserInfo avatarUrl={avatarUrl} userFullName={userFullName} userEmail={userEmail} />
              </div>

              {showStorageManager ? (
                <div className='flex flex-col gap-y-8 px-6'>
                  <StorageManager />
                </div>
              ) : (
                <div className='flex flex-col gap-y-8 px-6'>
                  <AccountActions
                    onLogout={handleLogout}
                    onResetPassword={handleResetPassword}
                    onUpdateEmail={handleUpdateEmail}
                    onConfirmDelete={handleDeleteWithMessage}
                    onManageStorage={handleManageStorage}
                  />
                </div>
              )}

              <LegalLinks />
            </div>
          </div>
        </div>
        <Toast />
      </div>
    </div>
  );
};

export default ProfilePage;
