import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { SidebarApp } from '../sidebar/SidebarApp';
import sidebarCss from '../sidebar/sidebar.css?inline';

const HOST_ID = 'notesnap-sidebar-host';

let root: Root | null = null;

/**
 * Mounts the sidebar in a Shadow DOM host so its styles never bleed onto
 * YouTube's page and YouTube's global CSS never bleeds into it (MVP-SPEC §5 —
 * the exact failure mode competitor Glasp was flagged for).
 */
export function mountSidebar(): void {
  if (document.getElementById(HOST_ID)) return; // already mounted

  const host = document.createElement('div');
  host.id = HOST_ID;
  // The host element itself lives in YouTube's light DOM — styles inside our
  // shadow root (e.g. .notesnap-panel { position: fixed }) only affect its
  // children, never the host. Without this inline style the host is a plain
  // block-level div and gets laid out wherever it lands in the page flow
  // (e.g. inline among the related-videos column) instead of overlaying the
  // viewport edge. `all: initial` also resets any inherited YouTube styles
  // (font, color, etc.) before our shadow CSS takes over.
  host.setAttribute(
    'style',
    'all: initial; position: fixed; top: 0; right: 0; z-index: 2147483647;',
  );
  document.body.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = sidebarCss;
  shadowRoot.appendChild(style);

  const appContainer = document.createElement('div');
  shadowRoot.appendChild(appContainer);

  root = createRoot(appContainer);
  root.render(createElement(SidebarApp));
}

export function unmountSidebar(): void {
  root?.unmount();
  root = null;
  document.getElementById(HOST_ID)?.remove();
}

export function isSidebarMounted(): boolean {
  return document.getElementById(HOST_ID) !== null;
}
