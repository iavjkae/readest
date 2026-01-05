export const getTrailbaseBaseUrl = (): string => {
  const baseUrl =
    process.env['NEXT_PUBLIC_TRAILBASE_URL'] ||
    process.env['TRAILBASE_URL'] ||
    process.env['NEXT_PUBLIC_TRAILBASE_BASE_URL'] ||
    '';

  if (!baseUrl) {
    throw new Error('Trailbase base url is not configured (NEXT_PUBLIC_TRAILBASE_URL/TRAILBASE_URL)');
  }

  return baseUrl.replace(/\/$/, '');
};

export const getTrailbaseJwtPublicKeyPem = (): string | null => {
  return (
    process.env['TRAILBASE_JWT_PUBLIC_KEY_PEM'] ||
    process.env['NEXT_PUBLIC_TRAILBASE_JWT_PUBLIC_KEY_PEM'] ||
    null
  );
};

export const allowUnverifiedTrailbaseJwt = (): boolean => {
  return process.env['TRAILBASE_ALLOW_UNVERIFIED_JWT'] === 'true';
};
