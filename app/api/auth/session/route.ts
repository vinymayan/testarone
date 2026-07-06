import { NextResponse } from 'next/server';
import { getOAuthSession, refreshOAuthSessionIfNeeded } from '@/lib/oauth-session';

export async function GET() {
  try {
    if (process.env.NEXUS_MOCK_MODE === 'true') {
      return NextResponse.json({
        authenticated: true,
        user: { name: 'Mock User', user_id: 1, is_premium: true },
        expiresAt: null
      });
    }

    const session = await getOAuthSession();
    if (!session) {
      return NextResponse.json({ authenticated: false });
    }

    const refreshed = await refreshOAuthSessionIfNeeded(session);
    return NextResponse.json({
      authenticated: true,
      user: refreshed.user,
      expiresAt: refreshed.expiresAt
    });
  } catch (error: any) {
    return NextResponse.json(
      { authenticated: false, message: error?.message || 'Could not load OAuth session.' },
      { status: error?.status || 500 }
    );
  }
}
