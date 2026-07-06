import { NextResponse } from 'next/server';
import { clearOAuthSession } from '@/lib/oauth-session';

export async function POST() {
  await clearOAuthSession();
  return NextResponse.json({ ok: true });
}
