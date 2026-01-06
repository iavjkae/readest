import { NextResponse } from 'next/server';
import { trailbaseFetch } from '@/services/backend/trailbaseRecords';

export const trailbaseProxy = async (
  path: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; json?: unknown; text?: string }> => {
  const res = await trailbaseFetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  if (res.ok) return { ok: true, status: res.status, json: res.json };

  const body = res.error.body;
  if (typeof body === 'string') return { ok: false, status: res.status, text: body };
  return { ok: false, status: res.status, json: body };
};

export const jsonError = (message: string, status = 500) => {
  return NextResponse.json({ error: message }, { status });
};
