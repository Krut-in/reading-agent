// A thin clock seam so dated filenames and timestamps stay deterministic under test. Mirrors the
// Probes seam in env.ts: an interface, a real implementation, and injected fakes in tests.
export interface Clock {
  now(): Date;
}

export const realClock: Clock = {
  now: () => new Date(),
};

// Local calendar date as YYYY-MM-DD, zero-padded. Uses local getters rather than toISOString (which
// is UTC), so a note written late in the evening lands on the user's local day instead of tomorrow's
// UTC day.
export function localDateStamp(clock: Clock): string {
  const d = clock.now();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// An ISO 8601 instant for last_queued_at and curation_runs.created_at. Timestamps are fine in UTC;
// only the filename date has to be local.
export function nowIso(clock: Clock): string {
  return clock.now().toISOString();
}
