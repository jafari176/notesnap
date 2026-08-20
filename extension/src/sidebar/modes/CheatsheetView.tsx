import type { ModeViewProps } from './shared/modeRegistry';
import { TimestampChip } from '../components/TimestampChip';

// Styled to read as an actual cheat sheet (bordered category cards, dense
// label/value rows, a highlighted warning box for exam traps) rather than a
// scrolling list of plain text lines — per user feedback that the previous
// version "looks like plain information," not a cheat sheet.
export function CheatsheetView({ content }: ModeViewProps) {
  const { key_terms, formulas, core_concepts, exam_traps } = content.cheatsheet;
  const hasAnything = key_terms.length > 0 || formulas.length > 0 || core_concepts.length > 0 || exam_traps.length > 0;

  if (!hasAnything) {
    return <p className="notesnap-placeholder">No cheatsheet generated for this video.</p>;
  }

  return (
    <div className="notesnap-cheatsheet-grid">
      {key_terms.length > 0 && (
        <div className="notesnap-cs-card">
          <div className="notesnap-cs-card-title">Key Terms</div>
          {key_terms.map((item) => (
            <div className="notesnap-cs-row" key={item.uid}>
              <span className="notesnap-cs-row-label">{item.term}</span>
              <span className="notesnap-cs-row-value">{item.definition_one_line}</span>
              <TimestampChip t_s={item.t_s} />
            </div>
          ))}
        </div>
      )}

      {formulas.length > 0 && (
        <div className="notesnap-cs-card">
          <div className="notesnap-cs-card-title">Formulas</div>
          {formulas.map((item) => (
            <div className="notesnap-cs-row" key={item.uid}>
              <span className="notesnap-cs-row-label">{item.name}</span>
              <code className="notesnap-cs-row-code">{item.expression}</code>
              <TimestampChip t_s={item.t_s} />
              {item.note && <span className="notesnap-cs-row-note">{item.note}</span>}
            </div>
          ))}
        </div>
      )}

      {core_concepts.length > 0 && (
        <div className="notesnap-cs-card">
          <div className="notesnap-cs-card-title">Core Concepts</div>
          {core_concepts.map((item) => (
            <div className="notesnap-cs-row notesnap-cs-row--single" key={item.uid}>
              <span className="notesnap-cs-row-value">{item.text}</span>
              <TimestampChip t_s={item.t_s} />
            </div>
          ))}
        </div>
      )}

      {exam_traps.length > 0 && (
        <div className="notesnap-cs-warning">
          <div className="notesnap-cs-warning-title">⚠ Exam Traps</div>
          {exam_traps.map((item) => (
            <div className="notesnap-cs-row notesnap-cs-row--single" key={item.uid}>
              <span className="notesnap-cs-row-value">{item.text}</span>
              <TimestampChip t_s={item.t_s} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
