type ObjectStorageType = 'r2' | 's3';

export const getStorageType = (): ObjectStorageType => {
  // Prefer a server-only env var to avoid Next.js build-time inlining of NEXT_PUBLIC_*.
  // Keep NEXT_PUBLIC_* as a fallback for existing client-side usage.
  if (process.env['OBJECT_STORAGE_TYPE']) {
    return process.env['OBJECT_STORAGE_TYPE'] as ObjectStorageType;
  }

  // TODO: do not expose storage type to client
  if (process.env['NEXT_PUBLIC_OBJECT_STORAGE_TYPE']) {
    return process.env['NEXT_PUBLIC_OBJECT_STORAGE_TYPE'] as ObjectStorageType;
  }

  return 'r2';
};
