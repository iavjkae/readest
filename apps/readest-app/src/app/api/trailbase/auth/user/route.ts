import { NextRequest, NextResponse } from 'next/server';
import { jsonError, trailbaseProxy } from '@/app/api/trailbase/_utils';

export async function PATCH(request: NextRequest) {
  const auth = request.headers.get('authorization') || '';
  if (!auth) {
    return jsonError('Missing Authorization header', 401);
  }

  const body = await request.text().catch(() => '');
  const upstream = await trailbaseProxy('/api/auth/v1/user', {
    method: 'PATCH',
    headers: {
      Authorization: auth,
    },
    body,
  });

  if (!upstream.ok) {
    const msg = typeof upstream.text === 'string' && upstream.text ? upstream.text : 'Update failed';
    return jsonError(msg, upstream.status);
  }

  return NextResponse.json(upstream.json ?? {});
}
