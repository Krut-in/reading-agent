import { describe, expect, it } from "vitest";
import { FieldTheorySource } from "../src/source/field-theory";

function makeSource(pages: string[]) {
  let call = 0;
  const calls: string[][] = [];
  const src = new FieldTheorySource({
    runFtJson: (args) => {
      calls.push(args);
      const out = pages[call] ?? "[]";
      call++;
      return out;
    },
  });
  return { src, calls };
}

describe("FieldTheorySource.listClassified", () => {
  it("maps category and domain by id and treats unclassified as null", () => {
    const { src } = makeSource([
      JSON.stringify([
        {
          id: "1",
          primaryCategory: "tool",
          categories: ["tool"],
          primaryDomain: "ai",
          domains: ["ai"],
        },
        {
          id: "2",
          primaryCategory: "unclassified",
          categories: [],
          primaryDomain: null,
          domains: [],
        },
      ]),
    ]);
    const map = src.listClassified(200);
    expect(map.get("1")).toEqual({
      primaryCategory: "tool",
      categories: ["tool"],
      primaryDomain: "ai",
      domains: ["ai"],
    });
    expect(map.get("2")?.primaryCategory).toBeNull();
  });

  it("pages until a short page, then stops", () => {
    const page1 = JSON.stringify([
      { id: "a0", primaryCategory: "tool" },
      { id: "a1", primaryCategory: "tool" },
    ]);
    const page2 = JSON.stringify([{ id: "b0", primaryCategory: "research" }]);
    const { src, calls } = makeSource([page1, page2]);
    const map = src.listClassified(2);
    expect(map.size).toBe(3);
    expect(calls.length).toBe(2);
    expect(calls[0]).toEqual(["list", "--json", "--limit", "2", "--offset", "0"]);
    expect(calls[1]).toEqual(["list", "--json", "--limit", "2", "--offset", "2"]);
  });

  it("stops on an empty first page", () => {
    const { src, calls } = makeSource(["[]"]);
    const map = src.listClassified(200);
    expect(map.size).toBe(0);
    expect(calls.length).toBe(1);
  });

  it("defaults missing category arrays to empty", () => {
    const { src } = makeSource([JSON.stringify([{ id: "1" }])]);
    const map = src.listClassified();
    expect(map.get("1")).toEqual({
      primaryCategory: null,
      categories: [],
      primaryDomain: null,
      domains: [],
    });
  });

  it("stops at the page cap rather than looping forever on a misbehaving ft", () => {
    const fullPage = JSON.stringify([
      { id: "x", primaryCategory: "tool" },
      { id: "y", primaryCategory: "tool" },
    ]);
    let call = 0;
    const src = new FieldTheorySource({
      runFtJson: () => {
        call += 1;
        return fullPage;
      },
    });
    src.listClassified(2);
    expect(call).toBe(1000);
  });
});
