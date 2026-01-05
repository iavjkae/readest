import { NextRequest, NextResponse } from 'next/server';
import { jsonError, trailbaseProxy } from '@/app/api/trailbase/_utils';

export async function POST(request: NextRequest) {
  const { email, password, password_repeat } = await request.json();

  if (!email || !password || !password_repeat) {
    return jsonError('Missing email, password or password_repeat', 400);
  }

  const upstream = await trailbaseProxy('/api/auth/v1/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, password_repeat }),
  });

  if (!upstream.ok) {
    const msg = typeof upstream.text === 'string' && upstream.text ? upstream.text : 'Register failed';
    return jsonError(msg, upstream.status);
  }

  return NextResponse.json(upstream.json ?? {});
}
