import { describe, expect, it } from "vitest";
import {
  isValidGithubAppSlug,
  isValidIsoDate,
  isValidIsoDateRange,
  isValidRepository,
  parseInstallationId,
} from "./validate";

describe("GitHub request validation", () => {
  it("accepts a valid leap-day range", () => {
    expect(isValidIsoDateRange("2028-02-29", "2028-03-01")).toBe(true);
  });

  it.each(["2026-02-30", "2026-13-01", "09/13/2026", "2026-9-3"])(
    "rejects invalid ISO date %s",
    (date) => {
      expect(isValidIsoDate(date)).toBe(false);
    },
  );

  it("rejects a reversed date range", () => {
    expect(isValidIsoDateRange("2026-09-14", "2026-09-13")).toBe(false);
  });

  it("accepts safe GitHub owner and repository names", () => {
    expect(isValidRepository("acme-ai", "customer_support.verify")).toBe(true);
  });

  it.each([
    ["acme/ai", "repo"],
    ["acme-ai", "repo name"],
    ["", "repo"],
  ])("rejects unsafe repository pair %s/%s", (owner, repo) => {
    expect(isValidRepository(owner, repo)).toBe(false);
  });

  it("accepts a safe GitHub App slug", () => {
    expect(isValidGithubAppSlug("vouqis-verify-2")).toBe(true);
  });

  it.each(["", "vouqis_verify", "vouqis/verify"])("rejects unsafe GitHub App slug %s", (slug) => {
    expect(isValidGithubAppSlug(slug)).toBe(false);
  });

  it.each([
    ["42", 42],
    ["0", null],
    ["-1", null],
    ["1.5", null],
    [null, null],
  ])("parses installation id %s", (value, expected) => {
    expect(parseInstallationId(value)).toBe(expected);
  });
});
