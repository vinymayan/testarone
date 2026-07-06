import { NextResponse } from 'next/server';
import {
  createCodeChallenge,
  createCodeVerifier,
  createState,
  getOAuthClientId,
  oauthAuthUrl,
  oauthRedirectUri,
  sanitizeReturnTo,
  setPendingOAuthCookie
} from '@/lib/oauth-session';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const returnTo = sanitizeReturnTo(url.searchParams.get('returnTo'));
    const state = createState();
    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);

    await setPendingOAuthCookie({ state, codeVerifier, returnTo });

    const authUrl = new URL(oauthAuthUrl());
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', getOAuthClientId());
    authUrl.searchParams.set('redirect_uri', oauthRedirectUri());
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    return NextResponse.redirect(authUrl);
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, message: error?.message || 'Could not start Nexus OAuth.' },
      { status: error?.status || 500 }
    );
  }
}
