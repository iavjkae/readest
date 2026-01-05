import { NextRequest, NextResponse } from 'next/server';
import { jsonError, trailbaseProxy } from '@/app/api/trailbase/_utils';

export async function POST(request: NextRequest) {
  const { refresh_token } = await request.json();

  if (!refresh_token) {
    return jsonError('Missing refresh_token', 400);
  }

  // For a specific session logout, TrailBase uses POST /api/auth/v1/logout with refresh_token.
  const upstream = await trailbaseProxy('/api/auth/v1/logout', {
    method: 'POST',
    body: JSON.stringify({ refresh_token }),
  });

  if (!upstream.ok) {
    const msg = typeof upstream.text === 'string' && upstream.text ? upstream.text : 'Logout failed';
    return jsonError(msg, upstream.status);
  }

  return NextResponse.json(upstream.json ?? {});
}
