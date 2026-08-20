import type { ComponentType } from 'react';
import type { NoteContent } from '../../../types/note-content';
import { LectureNotesView } from '../LectureNotesView';
import { SummaryView } from '../SummaryView';
import { OutlineView } from '../OutlineView';
import { CheatsheetView } from '../CheatsheetView';
import { FlashcardsView } from '../FlashcardsView';
import { MindMapView } from '../MindMapView';
import { PracticeQuestionsView } from '../PracticeQuestionsView';
import { Eli5View } from '../Eli5View';

export interface ModeViewProps {
  content: NoteContent;
}

export interface ModeDefinition {
  id: string;
  label: string;
  Component: ComponentType<ModeViewProps>;
}

// Order per MVP-SPEC §5: "read this first" -> "study aids" -> "test yourself".
export const MODE_REGISTRY: ModeDefinition[] = [
  { id: 'summary', label: 'Summary', Component: SummaryView },
  { id: 'lecture-notes', label: 'Lecture Notes', Component: LectureNotesView },
  { id: 'outline', label: 'Outline', Component: OutlineView },
  { id: 'cheatsheet', label: 'Cheatsheet', Component: CheatsheetView },
  { id: 'flashcards', label: 'Flashcards', Component: FlashcardsView },
  { id: 'mind-map', label: 'Mind Map', Component: MindMapView },
  { id: 'practice-questions', label: 'Practice Questions', Component: PracticeQuestionsView },
  { id: 'eli5', label: 'ELI5', Component: Eli5View },
];
