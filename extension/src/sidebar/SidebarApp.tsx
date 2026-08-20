import { useEffect, useRef, useState } from 'react';
import { useNoteStore } from './state/note-store';
import { useAuthStore } from './state/auth-store';
import { generateNotes, getNote, pollNoteUntilReady } from '../lib/api-client';
import { normalizeNoteContent, setCachedNote, getCachedNote } from '../lib/storage';
import { scheduleSync, pullIfNewer, type SyncStatus } from '../lib/sync';
import { isSignedIn, signOut } from '../lib/auth';
import { getVideoIdFromUrl, onYoutubeNavigate } from '../content/spa-navigation';
import { classifyGenerationError } from '../lib/error-classification';
import { ModeTabs } from './components/ModeTabs';
import { SignInGate } from './components/SignInGate';
import { SyncIndicator } from './components/SyncIndicator';
import { NotesLibraryView } from './components/NotesLibraryView';
import { MODE_REGISTRY } from './modes/shared/modeRegistry';
import { exportModePdf, exportMindMapPdfAndDownload } from '../lib/pdf';
import { useResizableWidth } from './hooks/useResizableWidth';
import type { NoteMetadata } from '../types/note-content';

// A library-selected note for a different video navigates the tab via
// window.location.href, which fully reloads the page — a React ref can't
// survive that, so "expand this note automatically once we land" has to be
// signaled through storage instead. Cleared immediately on read (one-shot).
const EXPAND_ON_LOAD_KEY = 'notesnap:expand-video-id';

async function takeExpandOnLoadVideoId(): Promise<string | null> {
  const result = await chrome.storage.local.get(EXPAND_ON_LOAD_KEY);
  const videoId = (result[EXPAND_ON_LOAD_KEY] as string | undefined) ?? null;
  if (videoId) await chrome.storage.local.remove(EXPAND_ON_LOAD_KEY);
  return videoId;
}

function markExpandOnLoad(videoId: string): Promise<void> {
  return chrome.storage.local.set({ [EXPAND_ON_LOAD_KEY]: videoId });
}

export function SidebarApp() {
  const [collapsed, setCollapsed] = useState(false);
  const { width, startResize } = useResizableWidth();
  const [activeModeId, setActiveModeId] = useState(MODE_REGISTRY[0].id);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced');
  const [exportError, setExportError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryLoadError, setLibraryLoadError] = useState<string | null>(null);
  const modeContentRef = useRef<HTMLDivElement>(null);
  const { status, noteId, videoId, content, dirty, errorMessage, expanded, setGenerating, setReady, setError, reset, setExpanded } =
    useNoteStore();
  const authStatus = useAuthStore((s) => s.status);
  const setAuthStatus = useAuthStore((s) => s.setStatus);

  useEffect(() => {
    isSignedIn().then((signedIn) => setAuthStatus(signedIn ? 'signed-in' : 'signed-out'));
  }, [setAuthStatus]);

  // YouTube is a SPA — navigating between videos never reloads this page,
  // so the content script only mounts the sidebar once (see
  // content-script.ts's !isSidebarMounted() check) and this component keeps
  // running across every subsequent video. Without this listener, the
  // sidebar kept showing the PREVIOUS video's notes after navigating to a
  // new one — a real bug, not just a missing feature — because nothing ever
  // told it the video had changed. Reset on every navigation and re-check
  // the cache for whichever video is now active.
  useEffect(() => {
    const unsubscribe = onYoutubeNavigate((url) => {
      const newVideoId = getVideoIdFromUrl(url);
      reset();
      if (newVideoId) loadCachedNoteIfPresent(newVideoId);
    });
    // Also run once for the video the sidebar mounted on, in case it wasn't
    // a fresh page load (e.g. React re-mount on an existing video).
    const initialVideoId = getVideoIdFromUrl(window.location.href);
    if (initialVideoId) loadCachedNoteIfPresent(initialVideoId);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Local-first sync (ACCOUNTS-AND-STORAGE-SPEC §5): write to
  // chrome.storage.local immediately on every mutation (feels instant, no
  // network wait), then debounce the background push separately.
  useEffect(() => {
    if (!dirty || !noteId || !videoId || !content) return;
    setCachedNote(videoId, { note_id: noteId, video_id: videoId, content, dirty: true, updated_at: new Date().toISOString() });
    scheduleSync(videoId, noteId, content, setSyncStatus);
  }, [dirty, noteId, videoId, content]);

  // Checks the local cache for the given video and, if found, loads it —
  // used both for the initial mount and every subsequent SPA navigation
  // (see the useEffect below). Returns true if a cached note was loaded.
  async function loadCachedNoteIfPresent(forVideoId: string): Promise<boolean> {
    const cached = await getCachedNote(forVideoId);
    if (!cached) return false;
    // Returning to a video you already have notes for shows a compact card
    // first, not the full tabbed view — expanded: false. Only a note that
    // just finished generating (handleGenerate below), or one explicitly
    // picked from the library (handleSelectLibraryNote below), opens
    // automatically.
    const expand = (await takeExpandOnLoadVideoId()) === forVideoId;
    if (cached.dirty) {
      // Pull-on-load: check for a newer server copy before trusting the
      // local cache, per ACCOUNTS-AND-STORAGE-SPEC §5.
      const remote = await pullIfNewer(forVideoId, cached.note_id);
      setReady(cached.note_id, forVideoId, remote ?? cached.content, { dirty: remote === null && cached.dirty, expanded: expand });
    } else {
      setReady(cached.note_id, forVideoId, cached.content, { expanded: expand });
    }
    return true;
  }

  async function handleGenerate(options?: { force?: boolean }) {
    const videoUrl = window.location.href;
    const detectedVideoId = getVideoIdFromUrl(videoUrl);
    if (!detectedVideoId) {
      setError('Could not detect a video ID on this page.');
      return;
    }

    if (!options?.force && (await loadCachedNoteIfPresent(detectedVideoId))) {
      return;
    }

    setGenerating();
    try {
      // generate-notes.ts returns 202 immediately and finishes the real
      // Gemini call in an async worker (API Gateway's Lambda integration
      // hard-caps at 29s; a full 8-mode generation regularly takes longer)
      // — poll until the worker flips status to ready.
      const kicked = await generateNotes(videoUrl);
      const result = await pollNoteUntilReady(kicked.note_id);
      const normalized = normalizeNoteContent(result.content);
      await setCachedNote(detectedVideoId, {
        note_id: kicked.note_id,
        video_id: detectedVideoId,
        content: normalized,
        dirty: false,
        updated_at: new Date().toISOString(),
      });
      // A note that just finished generating opens immediately — you're
      // already sitting here waiting for it, unlike returning to an old
      // video where a compact card is the better default.
      setReady(kicked.note_id, detectedVideoId, normalized, { expanded: true });
      setSyncStatus('synced');
    } catch (err) {
      // MVP-SPEC §1: failed generations never count against quota — nothing
      // is written to cache above this point on failure, matching that rule.
      setError(classifyGenerationError(err));
    }
  }

  function handleRegenerateClick() {
    // Regenerating overwrites the server row (unique(user_id, video_id), see
    // AWS-ARCHITECTURE-SPEC's notes table) and resets edited=false — a real
    // data-loss trap for anyone who has edited this note, so confirm first.
    const hasEdits = content !== null; // any existing note reaching this button already has content
    const proceed = !hasEdits || window.confirm('Regenerating will discard any edits you made to this note. Continue?');
    if (proceed) handleGenerate({ force: true });
  }

  async function handleSelectLibraryNote(note: NoteMetadata) {
    setLibraryLoadError(null);
    try {
      const full = await getNote(note.id);
      if (!full.content) {
        setLibraryLoadError('This note has no content yet.');
        return;
      }
      const normalized = normalizeNoteContent(full.content);
      await setCachedNote(note.video_id, {
        note_id: note.id,
        video_id: note.video_id,
        content: normalized,
        dirty: false,
        updated_at: full.updated_at,
      });

      const currentVideoId = getVideoIdFromUrl(window.location.href);
      if (currentVideoId === note.video_id) {
        // Already on the right video — show it immediately, no navigation
        // (and thus no reset()) needed.
        setReady(note.id, note.video_id, normalized, { expanded: true });
        setLibraryOpen(false);
      } else {
        // TimestampChip seeks whatever player is on the current page (see
        // content/youtube-player.ts) — loading a different video's notes
        // without navigating there would make every chip jump to the wrong
        // video. window.location.href does a full page reload (not a YouTube
        // SPA transition), which tears down and remounts this whole React
        // tree — a ref can't survive that, so the "expand once we land"
        // signal goes through chrome.storage.local instead (see
        // markExpandOnLoad/takeExpandOnLoadVideoId above). The freshly
        // mounted SidebarApp's initial-load effect (below) reads it back via
        // loadCachedNoteIfPresent.
        await markExpandOnLoad(note.video_id);
        setLibraryOpen(false);
        window.location.href = note.video_url;
      }
    } catch (err) {
      setLibraryLoadError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSignOut() {
    await signOut();
    setAuthStatus('signed-out');
  }

  async function handleExportPdf() {
    if (!content) return;
    setExportError(null);
    try {
      if (activeModeId === 'mind-map') {
        const svg = modeContentRef.current?.querySelector('svg');
        if (!svg) throw new Error('Mind map not rendered yet');
        await exportMindMapPdfAndDownload(content, svg);
      } else {
        exportModePdf(activeModeId, content);
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div
      className={`notesnap-panel ${collapsed ? 'notesnap-panel--collapsed' : ''}`}
      style={collapsed ? undefined : { width: `${width}px` }}
    >
      {!collapsed && (
        <div
          className="notesnap-resize-handle"
          onPointerDown={startResize}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
        />
      )}
      <button
        className="notesnap-toggle"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? 'Expand NoteSnap' : 'Collapse NoteSnap'}
      >
        {collapsed ? '‹' : '›'}
      </button>
      {!collapsed && (
        <div className="notesnap-panel-body">
          <div className="notesnap-header-row">
            <div className="notesnap-header">NoteSnap</div>
            <div className="notesnap-header-actions">
              {authStatus === 'signed-in' && (
                <button className="notesnap-library-link" onClick={() => setLibraryOpen(true)}>
                  My Notes
                </button>
              )}
              {authStatus === 'signed-in' && (
                <button className="notesnap-signout-link" onClick={handleSignOut}>
                  Sign out
                </button>
              )}
            </div>
          </div>

          {authStatus === 'checking' && <div className="notesnap-status">Loading…</div>}

          {(authStatus === 'signed-out' || authStatus === 'signing-in') && <SignInGate />}

          {authStatus === 'signed-in' && libraryOpen && (
            <>
              {libraryLoadError && <p className="notesnap-error">{libraryLoadError}</p>}
              <NotesLibraryView onSelect={handleSelectLibraryNote} onClose={() => setLibraryOpen(false)} />
            </>
          )}

          {authStatus === 'signed-in' && !libraryOpen && (
            <>
              {status === 'idle' && (
                <button className="notesnap-generate-btn" onClick={() => handleGenerate()}>
                  Generate Notes
                </button>
              )}

              {status === 'generating' && (
                <div className="notesnap-status">Analyzing video… this can take up to a minute.</div>
              )}

              {status === 'error' && (
                <div className="notesnap-error">
                  <p>{errorMessage}</p>
                  <button className="notesnap-generate-btn" onClick={() => handleGenerate()}>
                    Retry
                  </button>
                </div>
              )}

              {status === 'ready' && content && !expanded && (
                <button className="notesnap-cached-card" onClick={() => setExpanded(true)}>
                  <span className="notesnap-cached-card-title">{content.video.title || '(untitled)'}</span>
                  <span className="notesnap-cached-card-action">View notes →</span>
                </button>
              )}

              {status === 'ready' && content && expanded && (
                <div className="notesnap-result">
                  <div className="notesnap-result-header">
                    <button className="notesnap-collapse-link" onClick={() => setExpanded(false)} aria-label="Back">
                      ‹
                    </button>
                    <strong>{content.video.title || '(untitled)'}</strong>
                    <button className="notesnap-regenerate-link" onClick={handleRegenerateClick}>
                      Regenerate
                    </button>
                  </div>
                  <ModeTabs activeId={activeModeId} onChange={setActiveModeId} />
                  <div ref={modeContentRef}>
                    {(() => {
                      const mode = MODE_REGISTRY.find((m) => m.id === activeModeId) ?? MODE_REGISTRY[0];
                      const ActiveComponent = mode.Component;
                      return <ActiveComponent content={content} />;
                    })()}
                  </div>
                  <div className="notesnap-footer-row">
                    <button className="notesnap-export-btn" onClick={handleExportPdf}>
                      Export PDF
                    </button>
                    <SyncIndicator status={syncStatus} />
                  </div>
                  {exportError && <p className="notesnap-error">{exportError}</p>}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
