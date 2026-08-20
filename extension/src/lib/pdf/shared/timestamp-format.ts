// Same formatting logic as TimestampChip, duplicated here rather than
// imported — the UI component lives in sidebar/ and pulls in React; keeping
// this pdf/ module React-free avoids a needless dependency for a one-line
// function. MVP-SPEC §2's PDF spec: `[12:40]` for a point, `[12:40–18:05]`
// for a range, printed as plain bracketed text (not clickable, on paper).
function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatClock(totalSeconds: number): string {
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatTimestampForPdf(t_s: number | undefined, endS?: number): string {
  if (t_s === undefined) return '';
  return endS !== undefined ? `[${formatClock(t_s)}–${formatClock(endS)}]` : `[${formatClock(t_s)}]`;
}
