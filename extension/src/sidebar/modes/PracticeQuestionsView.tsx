import { useState } from 'react';
import type { ModeViewProps } from './shared/modeRegistry';
import { TimestampChip } from '../components/TimestampChip';

// MVP-SPEC §2.7: t_s shown only after revealing the answer — don't give it
// away by proximity before the student has attempted the question.
export function PracticeQuestionsView({ content }: ModeViewProps) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const questions = content.practice_questions;

  if (questions.length === 0) {
    return <p className="notesnap-placeholder">No practice questions generated for this video.</p>;
  }

  function toggleReveal(uid: string) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  return (
    <div className="notesnap-mode-content">
      {questions.map((q, i) => {
        const isRevealed = revealed.has(q.uid);
        return (
          <div className="notesnap-practice-question" key={q.uid}>
            <p className="notesnap-practice-question-text">
              <strong>Q{i + 1}.</strong> {q.question}
            </p>
            {q.type === 'mcq' && (
              <ul className="notesnap-practice-options">
                {q.options.map((opt) => (
                  <li key={opt}>{opt}</li>
                ))}
              </ul>
            )}
            <button type="button" className="notesnap-reveal-btn" onClick={() => toggleReveal(q.uid)}>
              {isRevealed ? 'Hide answer' : 'Reveal answer'}
            </button>
            {isRevealed && (
              <div className="notesnap-practice-answer">
                <p>
                  <strong>Answer:</strong> {q.answer}
                </p>
                {q.explanation && <p>{q.explanation}</p>}
                <TimestampChip t_s={q.t_s} label="Source" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
