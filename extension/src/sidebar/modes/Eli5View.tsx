import type { ModeViewProps } from './shared/modeRegistry';
import { SectionsView } from './shared/SectionsView';

export function Eli5View({ content }: ModeViewProps) {
  return <SectionsView content={content} bodyField="content_eli5_md" />;
}
