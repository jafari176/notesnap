import { create } from 'zustand';
import type { NoteContent } from '../../types/note-content';

export type GenerationStatus = 'idle' | 'generating' | 'ready' | 'error';

interface NoteState {
  status: GenerationStatus;
  noteId: string | null;
  videoId: string | null;
  content: NoteContent | null;
  dirty: boolean;
  errorMessage: string | null;
  // Whether the full tabbed note view is showing. A note loaded from cache
  // (returning to a video you already have notes for) starts collapsed to a
  // compact "View notes" card — a note that just finished generating (you
  // clicked Generate a moment ago) starts expanded, since you're already
  // waiting to see it.
  expanded: boolean;
  setGenerating: () => void;
  setReady: (noteId: string, videoId: string, content: NoteContent, options?: { dirty?: boolean; expanded?: boolean }) => void;
  setError: (message: string) => void;
  reset: () => void;
  mutateContent: (updater: (content: NoteContent) => NoteContent) => void;
  markSynced: () => void;
  setExpanded: (expanded: boolean) => void;
}

export const useNoteStore = create<NoteState>((set) => ({
  status: 'idle',
  noteId: null,
  videoId: null,
  content: null,
  dirty: false,
  errorMessage: null,
  expanded: false,
  setGenerating: () => set({ status: 'generating', errorMessage: null }),
  setReady: (noteId, videoId, content, options) =>
    set({
      status: 'ready',
      noteId,
      videoId,
      content,
      dirty: options?.dirty ?? false,
      errorMessage: null,
      expanded: options?.expanded ?? false,
    }),
  setError: (message) => set({ status: 'error', errorMessage: message }),
  reset: () => set({ status: 'idle', noteId: null, videoId: null, content: null, dirty: false, errorMessage: null, expanded: false }),
  // Every edit/delete/add funnels through here — single place that both
  // applies the mutation and flips the dirty flag, so lib/sync.ts's
  // debounced push can never miss a change.
  mutateContent: (updater) =>
    set((state) => {
      if (!state.content) return state;
      return { content: updater(state.content), dirty: true };
    }),
  markSynced: () => set({ dirty: false }),
  setExpanded: (expanded) => set({ expanded }),
}));
