import { describe, expect, it } from "vitest";
import { type Clock, localDateStamp, nowIso } from "../src/clock";

function at(date: Date): Clock {
  return { now: () => date };
}

describe("localDateStamp", () => {
  it("formats the local calendar date as YYYY-MM-DD", () => {
    expect(localDateStamp(at(new Date(2026, 5, 9, 12, 0)))).toBe("2026-06-09");
  });

  it("zero-pads single-digit month and day", () => {
    expect(localDateStamp(at(new Date(2026, 0, 5, 12, 0)))).toBe("2026-01-05");
  });

  // These two guard the local-vs-UTC bug without depending on the runner's timezone. A late-evening
  // local time catches the bug in zones west of UTC; an early-morning one catches it in zones east of
  // UTC. Together, at least one fails if the implementation ever switches to toISOString.
  it("keeps the local day for a late-evening time", () => {
    expect(localDateStamp(at(new Date(2026, 0, 5, 23, 45)))).toBe("2026-01-05");
  });

  it("keeps the local day for an early-morning time", () => {
    expect(localDateStamp(at(new Date(2026, 0, 5, 0, 15)))).toBe("2026-01-05");
  });
});

describe("nowIso", () => {
  it("returns the ISO instant of the clock", () => {
    expect(nowIso(at(new Date("2026-06-09T17:40:00.000Z")))).toBe("2026-06-09T17:40:00.000Z");
  });
});
