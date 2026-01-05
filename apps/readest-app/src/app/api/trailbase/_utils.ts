import { NextResponse } from 'next/server';

const getTrailbaseUrl = () => {
  const baseUrl = process.env['TRAILBASE_URL'] || process.env['NEXT_PUBLIC_TRAILBASE_URL'];
  if (!baseUrl) {
    throw new Error('TRAILBASE_URL (or NEXT_PUBLIC_TRAILBASE_URL) is not configured');
  }
  return baseUrl.replace(/\/$/, '');
};

export const trailbaseProxy = async (
  path: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; json?: unknown; text?: string }> => {
  const url = `${getTrailbaseUrl()}${path.startsWith('/') ? '' : '/'}${path}`;

  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    // ensure no caching of auth responses
    cache: 'no-store',
  });

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json };
  }

  const text = await res.text().catch(() => '');
  return { ok: res.ok, status: res.status, text };
};

export const jsonError = (message: string, status = 500) => {
  return NextResponse.json({ error: message }, { status });
};
