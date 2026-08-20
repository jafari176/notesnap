// Owns the actual chrome.identity + Cognito token exchange/refresh/storage —
// runs only in the background service worker context, where chrome.identity
// is actually available (see message-router.ts for why this had to move
// here from lib/auth.ts, which content scripts/the sidebar call via
// messaging instead).

const TOKEN_STORAGE_KEY = 'notesnap:auth:tokens';
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface TokenSet {
  access_token: string;
  id_token: string;
  refresh_token: string;
  expires_at: number;
}

function getRedirectUri(): string {
  return chrome.identity.getRedirectURL();
}

function buildAuthorizeUrl(): string {
  const params = new URLSearchParams({
    client_id: import.meta.env.VITE_COGNITO_CLIENT_ID,
    response_type: 'code',
    scope: 'email openid profile',
    redirect_uri: getRedirectUri(),
  });
  return `${import.meta.env.VITE_COGNITO_DOMAIN}/oauth2/authorize?${params.toString()}`;
}

async function exchangeCodeForTokens(code: string): Promise<TokenSet> {
  const response = await fetch(`${import.meta.env.VITE_COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: import.meta.env.VITE_COGNITO_CLIENT_ID,
      code,
      redirect_uri: getRedirectUri(),
    }),
  });
  if (!response.ok) throw new Error(`Token exchange failed: ${response.status} ${await response.text()}`);
  const body = await response.json();
  return {
    access_token: body.access_token,
    id_token: body.id_token,
    refresh_token: body.refresh_token,
    expires_at: Date.now() + body.expires_in * 1000,
  };
}

async function refreshTokens(refreshToken: string): Promise<TokenSet> {
  const response = await fetch(`${import.meta.env.VITE_COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: import.meta.env.VITE_COGNITO_CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) throw new Error(`Token refresh failed: ${response.status} ${await response.text()}`);
  const body = await response.json();
  return {
    access_token: body.access_token,
    id_token: body.id_token ?? '',
    refresh_token: refreshToken,
    expires_at: Date.now() + body.expires_in * 1000,
  };
}

async function getStoredTokens(): Promise<TokenSet | null> {
  const result = await chrome.storage.local.get(TOKEN_STORAGE_KEY);
  return (result[TOKEN_STORAGE_KEY] as TokenSet | undefined) ?? null;
}

async function storeTokens(tokens: TokenSet): Promise<void> {
  await chrome.storage.local.set({ [TOKEN_STORAGE_KEY]: tokens });
}

export async function handleSignIn(): Promise<void> {
  const redirectUrl = await chrome.identity.launchWebAuthFlow({
    url: buildAuthorizeUrl(),
    interactive: true,
  });
  if (!redirectUrl) throw new Error('Sign-in was cancelled or failed');

  const url = new URL(redirectUrl);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (error) throw new Error(`Sign-in failed: ${url.searchParams.get('error_description') ?? error}`);
  if (!code) throw new Error('Sign-in did not return an authorization code');

  const tokens = await exchangeCodeForTokens(code);
  await storeTokens(tokens);
}

export async function handleSignOut(): Promise<void> {
  await chrome.storage.local.remove(TOKEN_STORAGE_KEY);
}

export async function handleGetValidAccessToken(): Promise<string> {
  const tokens = await getStoredTokens();
  if (!tokens) throw new Error('Not signed in');

  if (Date.now() < tokens.expires_at - REFRESH_MARGIN_MS) {
    return tokens.access_token;
  }

  const refreshed = await refreshTokens(tokens.refresh_token);
  await storeTokens(refreshed);
  return refreshed.access_token;
}
