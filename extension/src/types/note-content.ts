// Hand-duplicated mirror of MVP-SPEC.md §3 — see the plan's rationale for why
// this isn't a shared package with infra/lambda. Every t_s/start_s/end_s is
// optional: generate-notes.ts's clampTimestamps() deletes an invalid t_s
// rather than dropping the item, so a leaf can arrive with no timestamp at
// all. Renderers must treat a missing t_s as "no chip", not an error.
//
// `uid` is client-only — assigned once in lib/storage.ts's
// normalizeNoteContent() on first load, preserved through edits. It does not
// exist in the server schema and must never be sent back in a PUT body as if
// it were server data (harmless if it is — the server ignores unknown
// fields — but keep it conceptually client-side).

export interface TimestampedItem {
  text: string;
  t_s?: number;
  uid: string;
}

export interface KeyTerm {
  term: string;
  definition_one_line: string;
  t_s?: number;
  uid: string;
}

export interface Formula {
  name: string;
  expression: string;
  note: string;
  t_s?: number;
  uid: string;
}

export interface Subsection {
  title: string;
  start_s?: number;
  uid: string;
}

export interface Section {
  title: string;
  start_s?: number;
  end_s?: number;
  content_md: string;
  content_eli5_md: string;
  subsections: Subsection[];
  uid: string;
}

export interface Flashcard {
  front: string;
  back: string;
  t_s?: number;
  uid: string;
}

export interface PracticeQuestionMcq {
  type: 'mcq';
  question: string;
  options: string[];
  answer: string;
  explanation: string;
  t_s?: number;
  uid: string;
}

export interface PracticeQuestionShortAnswer {
  type: 'short_answer';
  question: string;
  answer: string;
  explanation: string;
  t_s?: number;
  uid: string;
}

export type PracticeQuestion = PracticeQuestionMcq | PracticeQuestionShortAnswer;

export interface NoteContent {
  video: {
    title: string;
    channel: string;
    duration_s: number;
    url: string;
  };
  summary: {
    overview: string;
    takeaways: TimestampedItem[];
  };
  sections: Section[];
  cheatsheet: {
    key_terms: KeyTerm[];
    formulas: Formula[];
    core_concepts: TimestampedItem[];
    exam_traps: TimestampedItem[];
  };
  flashcards: Flashcard[];
  practice_questions: PracticeQuestion[];
}

export type NoteStatus = 'generating' | 'ready' | 'failed';

export interface NoteMetadata {
  id: string;
  video_id: string;
  video_title: string | null; // null while status = 'generating'
  video_channel: string | null;
  video_url: string;
  duration_s: number | null; // null while status = 'generating'
  edited: boolean;
  status: NoteStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
