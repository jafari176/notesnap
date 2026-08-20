import { ApiError } from '../types/api';

// MVP-SPEC §7's error table. generate-notes.ts doesn't tag these cases
// itself — it just forwards Gemini's raw error text in `detail` — so this
// classifies by matching known Gemini failure signatures. Best-effort: an
// unmatched error still shows something useful (the raw detail), it just
// won't get the friendlier category-specific copy.
export function classifyGenerationError(err: unknown): string {
  if (!(err instanceof ApiError)) {
    const fallback = String(err);
    return fallback && fallback !== 'undefined' ? fallback : 'Something went wrong. Please try again.';
  }

  const detail = (err.body.detail ?? '').toLowerCase();

  // "unavailable" deliberately NOT matched here — Gemini's own transient
  // 503 overload response includes "status": "UNAVAILABLE", which used to
  // false-positive into this branch and misreport a rate-limit blip as "this
  // video is private." Keep this list to signals that actually mean
  // video-access failure.
  if (detail.includes('private') || detail.includes('age-restrict') || detail.includes('region')) {
    return "Gemini can't access this video — it may be private, age-restricted, or region-locked.";
  }
  if (detail.includes('live') || detail.includes('premiere')) {
    return 'Live streams and premieres are not supported yet.';
  }
  if (detail.includes('unavailable') || detail.includes('503') || detail.includes('high demand')) {
    return "Gemini is temporarily overloaded. This usually clears up in a minute or two — try again.";
  }
  if (detail.includes('unexpected end') || (detail.includes('json') && detail.includes('unexpected'))) {
    // generate-notes.ts's JSON.parse(rawText) throws here if Gemini's
    // response was truncated mid-generation — the whole call fails cleanly
    // (502) rather than partially succeeding server-side. MVP-SPEC §7's
    // ideal is rendering whichever modes did parse; this build takes the
    // simpler fail-clean path and asks the user to retry instead, which is
    // still "no broken JSON shown" even though it's not the more generous
    // partial-render behavior.
    return 'The response was cut off before it finished generating — this can happen on longer videos. Try again.';
  }
  if (err.status === 504) {
    // pollNoteUntilReady() in api-client.ts gives up after ~2 minutes of
    // polling GET /notes/{id} without seeing status flip to ready — the
    // worker invocation may still be running server-side (Lambda's own
    // timeout is 90s, well under this), but the client stops waiting.
    return "This is taking longer than usual. The note may still finish generating — check back in a minute, or try again.";
  }
  if (err.status === 502) {
    // generate-notes.ts wraps every Gemini call failure as a 502 — includes
    // real API errors (rate limits, model errors) that don't match a more
    // specific category above.
    return `Generation failed (Gemini API issue): ${err.body.detail || err.message || 'unknown error'}`;
  }

  const message = `${err.message}${err.body.detail ? `: ${err.body.detail}` : ''}`;
  return message.trim() || `Request failed with status ${err.status}.`;
}
