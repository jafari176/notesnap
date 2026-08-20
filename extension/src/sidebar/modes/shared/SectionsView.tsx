import Markdown from 'react-markdown';
import type { ModeViewProps } from './modeRegistry';
import { TimestampChip } from '../../components/TimestampChip';

interface SectionsViewProps extends ModeViewProps {
  bodyField: 'content_md' | 'content_eli5_md';
}

// Shared by LectureNotesView and Eli5View — same layout, different field.
// Keeping them on one implementation prevents the two from drifting apart
// as the layout evolves (per the plan: parameterize, don't copy-paste fork).
export function SectionsView({ content, bodyField }: SectionsViewProps) {
  return (
    <div className="notesnap-mode-content">
      {content.sections.map((section) => (
        <div className="notesnap-section" key={section.uid}>
          <div className="notesnap-section-title">
            <TimestampChip t_s={section.start_s} endS={section.end_s} />
            <span>{section.title}</span>
          </div>
          <div className="notesnap-section-body">
            <Markdown>{section[bodyField]}</Markdown>
          </div>
          {section.subsections.length > 0 && (
            <ul className="notesnap-subsection-list">
              {section.subsections.map((sub) => (
                <li key={sub.uid}>
                  <TimestampChip t_s={sub.start_s} />
                  <span>{sub.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <p className="notesnap-section-body">{content.summary.overview}</p>
    </div>
  );
}
