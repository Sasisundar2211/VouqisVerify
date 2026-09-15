import { describe, expect, it } from "vitest";
import { sanitizeForSpreadsheet } from "./spreadsheetSafety";

describe("sanitizeForSpreadsheet", () => {
  it.each([
    ['=HYPERLINK("https://evil.example")', '\'=HYPERLINK("https://evil.example")'],
    ["+1+1", "'+1+1"],
    ["-2+3", "'-2+3"],
    ["@SUM(A1:A2)", "'@SUM(A1:A2)"],
    ["\t=cmd", "'\t=cmd"],
    ["\r=cmd", "'\r=cmd"],
  ])("neutralizes dangerous value %j", (input, expected) => {
    expect(sanitizeForSpreadsheet(input)).toBe(expected);
  });

  it("leaves ordinary text unchanged", () => {
    expect(sanitizeForSpreadsheet("ci/test")).toBe("ci/test");
  });
});
