import { NextRequest, NextResponse } from 'next/server';
import { jsonError, trailbaseProxy } from '@/app/api/trailbase/_utils';

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return jsonError('Missing email or password', 400);
  }

  const upstream = await trailbaseProxy('/api/auth/v1/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (!upstream.ok) {
    const msg = typeof upstream.text === 'string' && upstream.text ? upstream.text : 'Login failed';
    return jsonError(msg, upstream.status);
  }

  return NextResponse.json(upstream.json ?? {});
}
