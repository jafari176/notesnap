import { handleSignIn, handleSignOut, handleGetValidAccessToken } from './auth-handler';
import type { BackgroundRequest, BackgroundResponse } from './message-router';

chrome.runtime.onMessage.addListener((message: BackgroundRequest, _sender, sendResponse) => {
  (async (): Promise<BackgroundResponse> => {
    try {
      switch (message.type) {
        case 'SIGN_IN':
          await handleSignIn();
          return { ok: true };
        case 'SIGN_OUT':
          await handleSignOut();
          return { ok: true };
        case 'GET_VALID_ACCESS_TOKEN':
          return { ok: true, data: await handleGetValidAccessToken() };
        default:
          return { ok: false, error: 'Unknown message type' };
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  })().then(sendResponse);
  return true; // keep the message channel open for the async response
});

// Token refresh must live here, not in content scripts — content scripts are
// torn down/recreated on every page navigation, so a setInterval there would
// never survive long enough to matter. Service workers can't use
// setInterval either (they're suspended when idle), so chrome.alarms is the
// only mechanism that survives suspension.
const REFRESH_ALARM_NAME = 'notesnap-token-refresh';
const CHECK_INTERVAL_MINUTES = 4; // more frequent than the 5-min refresh margin in auth-handler.ts

chrome.alarms.create(REFRESH_ALARM_NAME, { periodInMinutes: CHECK_INTERVAL_MINUTES });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== REFRESH_ALARM_NAME) return;
  try {
    await handleGetValidAccessToken(); // no-op if not signed in or not due yet; refreshes if due
  } catch {
    // Not signed in, or refresh failed — api-client's lazy refresh (via the
    // same handler, on the next real API call) is the correctness backstop.
    // No user-visible error surfaces from a background-only proactive check.
  }
});
