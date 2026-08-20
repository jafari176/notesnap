// chrome.identity is only available in extension pages (background/options),
// never content scripts — confirmed against Chrome's own docs after M4
// testing threw "Cannot read properties of undefined (reading
// 'launchWebAuthFlow')" from the sidebar (which runs in the content script's
// context). The sidebar sends a message here instead of calling
// chrome.identity directly.

export type BackgroundRequest = { type: 'SIGN_IN' } | { type: 'SIGN_OUT' } | { type: 'GET_VALID_ACCESS_TOKEN' };

export type BackgroundResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };
