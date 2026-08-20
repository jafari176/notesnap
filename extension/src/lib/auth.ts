import type { BackgroundRequest, BackgroundResponse } from '../background/message-router';

// chrome.identity is unavailable in content-script contexts (confirmed
// during M4 manual testing: "Cannot read properties of undefined (reading
// 'launchWebAuthFlow')") — the sidebar runs inside the content script, so
// every auth operation is a message to the background service worker, which
// owns the actual chrome.identity + token logic (see
// background/auth-handler.ts).
// A freshly-loaded/idle-then-woken service worker can take a beat to
// register its onMessage listener; "Could not establish connection.
// Receiving end does not exist" on the very first call after a reload is a
// known MV3 timing gap, not a real failure — one short retry absorbs it
// without masking a genuine problem (a persistently-missing listener still
// fails after the retry).
async function sendToBackground<T = undefined>(message: BackgroundRequest, attempt = 1): Promise<T> {
  try {
    const response = (await chrome.runtime.sendMessage(message)) as BackgroundResponse;
    if (!response.ok) throw new Error(response.error);
    return response.data as T;
  } catch (err) {
    const isConnectionGap = err instanceof Error && err.message.includes('Receiving end does not exist');
    if (isConnectionGap && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
      return sendToBackground<T>(message, attempt + 1);
    }
    throw err;
  }
}

export async function signIn(): Promise<void> {
  await sendToBackground({ type: 'SIGN_IN' });
}

export async function signOut(): Promise<void> {
  await sendToBackground({ type: 'SIGN_OUT' });
}

export async function isSignedIn(): Promise<boolean> {
  try {
    await getValidAccessToken();
    return true;
  } catch {
    return false;
  }
}

export async function getValidAccessToken(): Promise<string> {
  return sendToBackground<string>({ type: 'GET_VALID_ACCESS_TOKEN' });
}
