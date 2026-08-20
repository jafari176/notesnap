import { seekVideoTo } from '../../content/youtube-player';

function formatTimestamp(totalSeconds: number): string {
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

interface TimestampChipProps {
  t_s?: number;
  endS?: number;
  label?: string;
}

/**
 * MVP-SPEC §5: the one shared, reusable timestamp component used by every
 * mode renderer. Items missing a valid t_s (per generate-notes.ts's
 * server-side clamping) render as plain text, never a dead/broken chip.
 */
export function TimestampChip({ t_s, endS, label }: TimestampChipProps) {
  if (t_s === undefined) {
    return label ? <span className="notesnap-chip-label">{label}</span> : null;
  }

  const text = endS !== undefined ? `${formatTimestamp(t_s)}–${formatTimestamp(endS)}` : formatTimestamp(t_s);

  return (
    <button
      type="button"
      className="notesnap-chip"
      onClick={() => seekVideoTo(t_s)}
      aria-label={`Jump to ${text}`}
    >
      {text}
    </button>
  );
}
