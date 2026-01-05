'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { jwtDecode } from 'jwt-decode';

import { useAuth } from '@/context/AuthContext';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import { getUserProfilePlan } from '@/utils/access';
import { TrailbaseAuthBackend } from '@/services/backend/trailbaseAuthBackend';

type Mode = 'login' | 'register' | 'reset';

const decodeUser = (token: string): { id: string; email?: string | null } | null => {
  try {
    const claims = jwtDecode<Record<string, unknown>>(token) || {};
    const id = (claims['sub'] as string | undefined) || (claims['user_id'] as string | undefined);
    const email = (claims['email'] as string | undefined) ?? null;
    if (!id) return null;
    return { id, email };
  } catch {
    return null;
  }
};

export default function TrailbaseAuthPage() {
  const _ = useTranslation();
  const router = useRouter();
  const { login } = useAuth();
  const { isDarkMode } = useThemeStore();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordRepeat, setPasswordRepeat] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const title = useMemo(() => {
    if (mode === 'register') return _('Create Account');
    if (mode === 'reset') return _('Reset Password');
    return _('Sign In');
  }, [_, mode]);

  const onSubmit = async () => {
    setIsLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (mode === 'login') {
        const { auth_token, refresh_token, csrf_token } = await TrailbaseAuthBackend.loginWithPassword(
          email,
          password,
        );

        const user = decodeUser(auth_token);
        if (!user) {
          throw new Error('Invalid auth token: missing user id');
        }

        login(auth_token, user, { refreshToken: refresh_token, csrfToken: csrf_token });

        let next = '/library';
        if (getUserProfilePlan(auth_token) === 'free') {
          next = '/user';
        }
        router.push(next);
        return;
      }

      if (mode === 'register') {
        await TrailbaseAuthBackend.registerWithPassword(email, password, passwordRepeat);
        setMessage(_('Registration successful. Please check your email to verify your account.'));
        setMode('login');
        return;
      }

      await TrailbaseAuthBackend.requestPasswordReset(email);
      setMessage(_('If the email exists, a reset link has been sent.'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || _('Operation failed'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='flex min-h-screen items-center justify-center'>
      <div className='w-full max-w-md p-8'>
        <div className='mb-6 text-center'>
          <h1 className='text-2xl font-semibold'>{title}</h1>
        </div>

        <div className='space-y-3'>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={_('Email')}
            className={
              'w-full rounded-md border px-3 py-2 text-sm outline-none ' +
              (isDarkMode
                ? 'border-gray-700 bg-gray-900 text-gray-100'
                : 'border-gray-300 bg-white text-gray-900')
            }
            autoCapitalize='none'
            autoComplete='email'
          />

          {mode !== 'reset' && (
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={_('Password')}
              type='password'
              className={
                'w-full rounded-md border px-3 py-2 text-sm outline-none ' +
                (isDarkMode
                  ? 'border-gray-700 bg-gray-900 text-gray-100'
                  : 'border-gray-300 bg-white text-gray-900')
              }
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            />
          )}

          {mode === 'register' && (
            <input
              value={passwordRepeat}
              onChange={(e) => setPasswordRepeat(e.target.value)}
              placeholder={_('Repeat Password')}
              type='password'
              className={
                'w-full rounded-md border px-3 py-2 text-sm outline-none ' +
                (isDarkMode
                  ? 'border-gray-700 bg-gray-900 text-gray-100'
                  : 'border-gray-300 bg-white text-gray-900')
              }
              autoComplete='new-password'
            />
          )}

          {error && (
            <div className={isDarkMode ? 'text-red-400 text-sm' : 'text-red-600 text-sm'}>
              {error}
            </div>
          )}
          {message && (
            <div className={isDarkMode ? 'text-green-400 text-sm' : 'text-green-600 text-sm'}>
              {message}
            </div>
          )}

          <button
            onClick={onSubmit}
            disabled={isLoading}
            className={
              'w-full rounded-md px-4 py-2.5 text-sm transition ' +
              (isDarkMode
                ? 'bg-gray-800 text-gray-100 hover:bg-gray-700'
                : 'bg-gray-900 text-white hover:bg-gray-800')
            }
          >
            {isLoading ? _('Loading...') : _('Continue')}
          </button>

          <div className='flex items-center justify-between pt-2 text-sm'>
            <button
              onClick={() => {
                setError(null);
                setMessage(null);
                setMode(mode === 'login' ? 'register' : 'login');
              }}
              className={isDarkMode ? 'text-gray-300 hover:text-gray-100' : 'text-gray-700 hover:text-gray-900'}
            >
              {mode === 'login' ? _('Create account') : _('Back to sign in')}
            </button>

            <button
              onClick={() => {
                setError(null);
                setMessage(null);
                setMode(mode === 'reset' ? 'login' : 'reset');
              }}
              className={isDarkMode ? 'text-gray-300 hover:text-gray-100' : 'text-gray-700 hover:text-gray-900'}
            >
              {mode === 'reset' ? _('Back') : _('Forgot password?')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
