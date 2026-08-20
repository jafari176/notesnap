import type { ModeViewProps } from './shared/modeRegistry';
import { TimestampChip } from '../components/TimestampChip';

export function OutlineView({ content }: ModeViewProps) {
  return (
    <div className="notesnap-mode-content">
      {content.sections.map((section) => (
        <div className="notesnap-outline-item" key={section.uid}>
          <div className="notesnap-section-title">
            <TimestampChip t_s={section.start_s} />
            <span>{section.title}</span>
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
    </div>
  );
}
