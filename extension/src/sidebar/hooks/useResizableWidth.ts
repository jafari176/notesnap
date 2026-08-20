import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'notesnap:sidebar-width';
const DEFAULT_WIDTH = 340;
const MIN_WIDTH = 280;
const MAX_WIDTH = 720;

function clamp(width: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

/**
 * Drag-to-resize for the sidebar panel, persisted across sessions.
 * The panel is fixed to the right edge (see mount.ts), so dragging the
 * handle left/right changes width by the inverse of pointer movement
 * (drag left = wider, since the right edge stays anchored).
 */
export function useResizableWidth() {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEY).then((result) => {
      const stored = result[STORAGE_KEY];
      if (typeof stored === 'number') setWidth(clamp(stored));
    });
  }, []);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!dragStateRef.current) return;
    const delta = dragStateRef.current.startX - e.clientX;
    setWidth(clamp(dragStateRef.current.startWidth + delta));
  }, []);

  const handlePointerUp = useCallback(() => {
    dragStateRef.current = null;
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
    setWidth((current) => {
      chrome.storage.local.set({ [STORAGE_KEY]: current });
      return current;
    });
  }, [handlePointerMove]);

  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragStateRef.current = { startX: e.clientX, startWidth: width };
      document.addEventListener('pointermove', handlePointerMove);
      document.addEventListener('pointerup', handlePointerUp);
    },
    [width, handlePointerMove, handlePointerUp],
  );

  return { width, startResize };
}
