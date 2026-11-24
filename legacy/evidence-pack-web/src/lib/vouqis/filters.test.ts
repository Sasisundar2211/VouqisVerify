import { describe, expect, it } from "vitest";
import { getResultsEmptyMessage, isValidDateRange, summarize, ZERO_SUMMARY } from "./filters";

describe("ZERO_SUMMARY", () => {
  it("starts every count at zero", () => {
    expect(summarize([])).toEqual(ZERO_SUMMARY);
  });
});

describe("getResultsEmptyMessage", () => {
  it("prompts to connect before any pack has been generated", () => {
    expect(getResultsEmptyMessage(false)).toBe("Connect a GitHub repository to generate an AI Change Evidence Pack.");
  });

  it("reports no results after a generated pack came back empty", () => {
    expect(getResultsEmptyMessage(true)).toBe("No merged pull requests found in this date range.");
  });
});

describe("isValidDateRange", () => {
  it("rejects a from date after the to date", () => {
    expect(isValidDateRange({ from: "2026-06-30", to: "2026-06-01" })).toBe(false);
  });

  it("accepts an equal or ordered range", () => {
    expect(isValidDateRange({ from: "2026-06-01", to: "2026-06-30" })).toBe(true);
  });
});
