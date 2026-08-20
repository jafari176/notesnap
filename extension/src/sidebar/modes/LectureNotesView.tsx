import type { ModeViewProps } from './shared/modeRegistry';
import { SectionsView } from './shared/SectionsView';

export function LectureNotesView({ content }: ModeViewProps) {
  return <SectionsView content={content} bodyField="content_md" />;
}
