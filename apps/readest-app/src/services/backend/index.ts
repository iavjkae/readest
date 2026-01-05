import type { AuthBackend, BackendKind } from './types';
import { TrailbaseAuthBackend } from './trailbaseAuthBackend';

const resolveBackendKind = (): BackendKind => {
  return 'trailbase';
};

let cachedAuthBackend: AuthBackend | null = null;

export const getAuthBackend = (): AuthBackend => {
  if (cachedAuthBackend) return cachedAuthBackend;

  cachedAuthBackend = new TrailbaseAuthBackend();
  return cachedAuthBackend;
};

export const getBackendKind = (): BackendKind => resolveBackendKind();
