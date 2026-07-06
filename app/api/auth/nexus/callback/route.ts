import { NextResponse } from 'next/server';
import {
  clearPendingOAuthCookie,
  createOAuthSession,
  exchangeOAuthCode,
  fetchNexusOAuthUser,
  getPendingOAuthCookie,
  oauthBaseUrl,
  sanitizeReturnTo
} from '@/lib/oauth-session';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const appUrl = new URL('/', oauthBaseUrl());

  try {
    const error = requestUrl.searchParams.get('error');
    if (error) {
      appUrl.searchParams.set('auth_error', error);
      return NextResponse.redirect(appUrl);
    }

    const code = requestUrl.searchParams.get('code');
    const state = requestUrl.searchParams.get('state');
    const pending = await getPendingOAuthCookie();
    await clearPendingOAuthCookie();

    if (!code || !state || !pending || pending.state !== state) {
      appUrl.searchParams.set('auth_error', 'invalid_oauth_state');
      return NextResponse.redirect(appUrl);
    }

    const tokens = await exchangeOAuthCode(code, pending.codeVerifier);
    const user = await fetchNexusOAuthUser(tokens.access_token);
    await createOAuthSession(tokens, user);

    return NextResponse.redirect(new URL(sanitizeReturnTo(pending.returnTo), oauthBaseUrl()));
  } catch (error: any) {
    appUrl.searchParams.set('auth_error', error?.message || 'oauth_failed');
    return NextResponse.redirect(appUrl);
  }
}
