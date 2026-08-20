/**
 * YouTube is a SPA — navigating to a new video (via related videos, search,
 * etc.) does not reload the page, so a content script that only runs once on
 * initial load would show stale state forever. YouTube fires a
 * `yt-navigate-finish` custom event on its own router after each navigation;
 * that's the reliable hook (more reliable than polling location.href, though
 * we also fall back to a light poll in case that event is ever missed).
 */
export function onYoutubeNavigate(callback: (url: string) => void): () => void {
  let lastUrl = window.location.href;

  const handleNavigate = () => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      callback(currentUrl);
    }
  };

  document.addEventListener('yt-navigate-finish', handleNavigate);

  // Fallback poll — cheap, and guards against missing the event on some
  // navigation paths (e.g. back/forward cache restores).
  const pollInterval = window.setInterval(handleNavigate, 1000);

  return () => {
    document.removeEventListener('yt-navigate-finish', handleNavigate);
    window.clearInterval(pollInterval);
  };
}

export function getVideoIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('v');
  } catch {
    return null;
  }
}

export function isWatchPage(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.pathname === '/watch' && parsed.searchParams.has('v');
  } catch {
    return false;
  }
}
