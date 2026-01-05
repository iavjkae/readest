import { NextRequest, NextResponse } from 'next/server';
import { jsonError, trailbaseProxy } from '@/app/api/trailbase/_utils';

export async function POST(request: NextRequest) {
  const { email } = await request.json();

  if (!email) {
    return jsonError('Missing email', 400);
  }

  const upstream = await trailbaseProxy('/api/auth/v1/reset_password/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });

  if (!upstream.ok) {
    const msg = typeof upstream.text === 'string' && upstream.text ? upstream.text : 'Reset request failed';
    return jsonError(msg, upstream.status);
  }

  return NextResponse.json(upstream.json ?? {});
}
