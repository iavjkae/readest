export const getTrailbaseBaseUrl = (): string => {
  // In Docker, we often need two different URLs:
  // - server runtime (inside the container): http://trailbase:4000
  // - browser (outside the container):      http://localhost:4000
  // Prefer the server-only env var when running on the server.
  const isServer = typeof window === 'undefined';

  const serverBaseUrl =
    process.env['TRAILBASE_URL'] ||
    process.env['NEXT_PUBLIC_TRAILBASE_URL'] ||
    process.env['NEXT_PUBLIC_TRAILBASE_BASE_URL'] ||
    '';

  const clientBaseUrl =
    process.env['NEXT_PUBLIC_TRAILBASE_URL'] ||
    process.env['NEXT_PUBLIC_TRAILBASE_BASE_URL'] ||
    '';

  // Production-safe default: in browsers, prefer same-origin proxy so the Trailbase
  // service does not need to be publicly exposed.
  const defaultClientBaseUrl = '/api/trailbase';

  const baseUrl = isServer ? serverBaseUrl : (clientBaseUrl || defaultClientBaseUrl);

  if (!baseUrl) {
    throw new Error('Trailbase base url is not configured (NEXT_PUBLIC_TRAILBASE_URL/TRAILBASE_URL)');
  }

  return baseUrl.replace(/\/$/, '');
};

export const getTrailbaseJwtPublicKeyPem = (): string | null => {
  const direct =
    process.env['TRAILBASE_JWT_PUBLIC_KEY_PEM'] ||
    process.env['NEXT_PUBLIC_TRAILBASE_JWT_PUBLIC_KEY_PEM'] ||
    null;

  const fromFile = process.env['TRAILBASE_JWT_PUBLIC_KEY_PEM_FILE'] || null;
  if (fromFile && typeof window === 'undefined') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('node:fs') as typeof import('node:fs');
      const pem = fs.readFileSync(fromFile, 'utf8');
      return pem && pem.trim() ? pem.trim() : direct;
    } catch {
      return direct;
    }
  }

  return direct;
};

export const allowUnverifiedTrailbaseJwt = (): boolean => {
  return process.env['TRAILBASE_ALLOW_UNVERIFIED_JWT'] === 'true';
};
