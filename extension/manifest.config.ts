import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'NoteSnap',
  description: 'AI-generated study notes from YouTube videos — 8 modes, one click.',
  version: pkg.version,
  // Pins the dev extension ID (ehamipkdlaimnakekeeepnecpfbbbfmp) so
  // chrome.identity.getRedirectURL() is stable across unpacked reloads —
  // without this, Cognito's registered callbackUrl would break on every
  // reload/profile change. Derived from extension-key.pem (gitignored,
  // dev-only; never used for the CWS-published build, which gets its own
  // permanent ID at first publish — see M9).
  key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuLaZm/0fcpp0lksci6hKlLMUV5LXHmZrUx3ODL679iXOlMgR84icBif73F679q53lubuH2QNX2QiuKTJ4xyronreovYJN40XVQrY+ieYyNpwDeznMAI2n1EECobSMCpSBVx+Btq9UEdh7HgQIRymi4oUSsNos5s/Sb+MjH1Ls61LSqv1WULQyopSob4WDfcNCEDa8XezHveqEfwExk34JXsFZ3BtlUg1RZNHg0V7pOiIyMxbJ9d8+qgrq88hliJJerDTUYgRWTgRQBOuAO0nfLMSz3CdMovrnonVlKSaBIGn4qGHtIBJwml3wiMzS1UktfsfswNy1lI0MFrNa7VHmQIDAQAB',
  icons: {
    16: 'public/icons/16.png',
    32: 'public/icons/32.png',
    48: 'public/icons/48.png',
    128: 'public/icons/128.png',
  },
  permissions: ['storage', 'identity', 'alarms'],
  host_permissions: [
    'https://www.youtube.com/*',
    'https://lchskii236.execute-api.eu-west-1.amazonaws.com/*',
    'https://notesnap-auth.auth.eu-west-1.amazoncognito.com/*',
  ],
  content_scripts: [
    {
      matches: ['https://www.youtube.com/watch*'],
      js: ['src/content/content-script.ts'],
      run_at: 'document_idle',
    },
  ],
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  options_page: 'options/options.html',
});
