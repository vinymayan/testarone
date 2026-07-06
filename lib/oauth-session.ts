import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { nexusFetch, NexusApiError } from './nexus';
import { sealSecret, unsealSecret } from './session';

const SESSION_COOKIE = 'nexus_oauth_session';
const PENDING_COOKIE = 'nexus_oauth_pending';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const PENDING_TTL_SECONDS = 60 * 10;
const REFRESH_WINDOW_SECONDS = 60;

type D1StatementLike = {
  bind: (...values: unknown[]) => D1StatementLike;
  first: <T>() => Promise<T | null>;
  run: () => Promise<unknown>;
};

type D1DatabaseLike = {
  prepare: (query: string) => D1StatementLike;
};

type OAuthSessionRow = {
  id: string;
  sealed_access_token: string;
  sealed_refresh_token: string | null;
  token_type: string | null;
  expires_at: number | null;
  user_id: string | null;
  user_name: string | null;
  user_json: string | null;
};

export type OAuthTokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

export type NexusOAuthUser = {
  id?: string;
  user_id?: string | number;
  name?: string;
  username?: string;
  email?: string;
  [key: string]: unknown;
};

export type PendingOAuthState = {
  state: string;
  codeVerifier: string;
  returnTo: string;
};

export type OAuthSession = {
  id: string;
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  expiresAt: number | null;
  user: NexusOAuthUser | null;
};

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function secureCookie() {
  return process.env.NODE_ENV === 'production';
}

export async function getSessionStore(): Promise<D1DatabaseLike> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const db = (env as Record<string, unknown>).DB as D1DatabaseLike | undefined;
    if (db) return db;
  } catch {
    // The regular Next dev server does not provide Cloudflare bindings.
  }

  throw new NexusApiError('OAuth session storage is not configured.', 500);
}

export function oauthBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
}

export function oauthRedirectUri() {
  return process.env.NEXUS_OAUTH_REDIRECT_URI || `${oauthBaseUrl().replace(/\/$/, '')}/api/auth/nexus/callback`;
}

export function oauthAuthUrl() {
  return process.env.NEXUS_OAUTH_AUTH_URL || 'https://users.nexusmods.com/oauth/authorize';
}

export function oauthTokenUrl() {
  return process.env.NEXUS_OAUTH_TOKEN_URL || 'https://users.nexusmods.com/oauth/token';
}

export function getOAuthClientId() {
  const clientId = process.env.NEXUS_OAUTH_CLIENT_ID;
  if (!clientId) {
    throw new NexusApiError('NEXUS_OAUTH_CLIENT_ID is not configured.', 500);
  }
  return clientId;
}

export function sanitizeReturnTo(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export function createCodeVerifier() {
  return crypto.randomBytes(48).toString('base64url');
}

export function createState() {
  return crypto.randomBytes(32).toString('base64url');
}

export function createCodeChallenge(verifier: string) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export async function setPendingOAuthCookie(pending: PendingOAuthState) {
  const store = await cookies();
  store.set(PENDING_COOKIE, sealSecret(JSON.stringify(pending)), {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookie(),
    path: '/',
    maxAge: PENDING_TTL_SECONDS
  });
}

export async function getPendingOAuthCookie(): Promise<PendingOAuthState | null> {
  const store = await cookies();
  const sealed = store.get(PENDING_COOKIE)?.value;
  if (!sealed) return null;
  const raw = unsealSecret(sealed);
  if (!raw) return null;

  try {
    const pending = JSON.parse(raw) as PendingOAuthState;
    if (!pending.state || !pending.codeVerifier) return null;
    return pending;
  } catch {
    return null;
  }
}

export async function clearPendingOAuthCookie() {
  const store = await cookies();
  store.delete(PENDING_COOKIE);
}

export async function exchangeOAuthCode(code: string, codeVerifier: string): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: getOAuthClientId(),
    code,
    redirect_uri: oauthRedirectUri(),
    code_verifier: codeVerifier
  });

  const clientSecret = process.env.NEXUS_OAUTH_CLIENT_SECRET;
  if (clientSecret) body.set('client_secret', clientSecret);

  const response = await fetch(oauthTokenUrl(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body,
    cache: 'no-store'
  });

  const payload = await response.json().catch(async () => ({ message: await response.text().catch(() => '') }));
  if (!response.ok) {
    throw new NexusApiError('Could not exchange Nexus OAuth code.', response.status, payload);
  }

  return payload as OAuthTokenResponse;
}

async function refreshOAuthTokens(refreshToken: string): Promise<OAuthTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: getOAuthClientId(),
    refresh_token: refreshToken
  });

  const clientSecret = process.env.NEXUS_OAUTH_CLIENT_SECRET;
  if (clientSecret) body.set('client_secret', clientSecret);

  const response = await fetch(oauthTokenUrl(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body,
    cache: 'no-store'
  });

  const payload = await response.json().catch(async () => ({ message: await response.text().catch(() => '') }));
  if (!response.ok) {
    throw new NexusApiError('Could not refresh Nexus OAuth session.', response.status, payload);
  }

  return payload as OAuthTokenResponse;
}

export async function fetchNexusOAuthUser(accessToken: string): Promise<NexusOAuthUser | null> {
  try {
    return await nexusFetch<NexusOAuthUser>('/users/validate.json', { accessToken });
  } catch {
    return null;
  }
}

function parseUser(raw: string | null): NexusOAuthUser | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as NexusOAuthUser;
  } catch {
    return null;
  }
}

function rowToSession(row: OAuthSessionRow): OAuthSession | null {
  const accessToken = unsealSecret(row.sealed_access_token);
  if (!accessToken) return null;

  const refreshToken = row.sealed_refresh_token ? unsealSecret(row.sealed_refresh_token) : null;
  return {
    id: row.id,
    accessToken,
    refreshToken,
    tokenType: row.token_type || 'Bearer',
    expiresAt: row.expires_at,
    user: parseUser(row.user_json)
  };
}

export async function createOAuthSession(tokens: OAuthTokenResponse, user: NexusOAuthUser | null): Promise<string> {
  if (!tokens.access_token) {
    throw new NexusApiError('Nexus OAuth response did not include an access token.', 502, tokens);
  }

  const db = await getSessionStore();
  const id = crypto.randomUUID();
  const createdAt = nowSeconds();
  const expiresAt = tokens.expires_in ? createdAt + Number(tokens.expires_in) : null;
  const userId = user?.user_id ?? user?.id ?? null;
  const userName = user?.name ?? user?.username ?? null;

  await db.prepare(`
    INSERT INTO oauth_sessions (
      id,
      sealed_access_token,
      sealed_refresh_token,
      token_type,
      expires_at,
      user_id,
      user_name,
      user_json,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    sealSecret(tokens.access_token),
    tokens.refresh_token ? sealSecret(tokens.refresh_token) : null,
    tokens.token_type || 'Bearer',
    expiresAt,
    userId === null ? null : String(userId),
    userName === null ? null : String(userName),
    user ? JSON.stringify(user) : null,
    createdAt,
    createdAt
  ).run();

  const store = await cookies();
  store.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookie(),
    path: '/',
    maxAge: SESSION_TTL_SECONDS
  });

  return id;
}

async function getSessionIdFromCookie() {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value || null;
}

export async function getOAuthSession(): Promise<OAuthSession | null> {
  const id = await getSessionIdFromCookie();
  if (!id) return null;

  const db = await getSessionStore();
  const row = await db.prepare(`
    SELECT
      id,
      sealed_access_token,
      sealed_refresh_token,
      token_type,
      expires_at,
      user_id,
      user_name,
      user_json
    FROM oauth_sessions
    WHERE id = ?
  `).bind(id).first<OAuthSessionRow>();

  if (!row) return null;
  return rowToSession(row);
}

export async function refreshOAuthSessionIfNeeded(session: OAuthSession): Promise<OAuthSession> {
  if (!session.expiresAt || session.expiresAt - nowSeconds() > REFRESH_WINDOW_SECONDS) return session;
  if (!session.refreshToken) {
    await clearOAuthSession();
    throw new NexusApiError('Nexus OAuth session expired.', 401);
  }

  try {
    const tokens = await refreshOAuthTokens(session.refreshToken);
    const refreshedAt = nowSeconds();
    const expiresAt = tokens.expires_in ? refreshedAt + Number(tokens.expires_in) : session.expiresAt;
    const nextRefreshToken = tokens.refresh_token || session.refreshToken;
    const user = session.user || await fetchNexusOAuthUser(tokens.access_token);
    const db = await getSessionStore();

    await db.prepare(`
      UPDATE oauth_sessions
      SET
        sealed_access_token = ?,
        sealed_refresh_token = ?,
        token_type = ?,
        expires_at = ?,
        user_json = ?,
        updated_at = ?
      WHERE id = ?
    `).bind(
      sealSecret(tokens.access_token),
      nextRefreshToken ? sealSecret(nextRefreshToken) : null,
      tokens.token_type || session.tokenType || 'Bearer',
      expiresAt,
      user ? JSON.stringify(user) : null,
      refreshedAt,
      session.id
    ).run();

    return {
      ...session,
      accessToken: tokens.access_token,
      refreshToken: nextRefreshToken,
      tokenType: tokens.token_type || session.tokenType || 'Bearer',
      expiresAt,
      user
    };
  } catch (error) {
    await clearOAuthSession();
    throw error;
  }
}

export async function getNexusAccessToken(): Promise<string | null> {
  if (process.env.NEXUS_MOCK_MODE === 'true') return 'mock-oauth-token';
  const session = await getOAuthSession();
  if (!session) return null;
  return (await refreshOAuthSessionIfNeeded(session)).accessToken;
}

export async function clearOAuthSession() {
  const store = await cookies();
  const id = store.get(SESSION_COOKIE)?.value;
  store.delete(SESSION_COOKIE);
  store.delete(PENDING_COOKIE);

  if (!id) return;
  try {
    const db = await getSessionStore();
    await db.prepare('DELETE FROM oauth_sessions WHERE id = ?').bind(id).run();
  } catch {
    // Logout should still clear local cookies when the storage binding is unavailable.
  }
}
