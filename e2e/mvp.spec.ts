import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

const DISCLAIMER =
  "This pack documents identified AI-relevant code changes and associated GitHub review and " +
  "verification evidence. It is not a statement that the AI system is safe, compliant, or approved by an auditor.";

const pullRequest = {
  number: 101,
  title: "Rewrite support escalation system prompt",
  body: "",
  url: "https://github.com/acme-ai/customer-support-agent/pull/101",
  author: "priya-dev",
  mergedAt: "2026-06-05",
  changedFiles: ["prompts/support/system_prompt.md"],
  classification: {
    category: "PROMPT",
    confidence: "HIGH",
    reason: "Matched keywords: prompt, prompts, system_prompt",
  },
  evidence: {
    status: "CHECKS_PASSED",
    summary: "2 passed, 0 failed, 0 pending",
    checkNames: ["ci/lint", "ci/test"],
  },
  checkRuns: [],
  commitStatuses: [],
  reviews: [],
};

test("generates and downloads an evidence pack for a connected repository", async ({ page }) => {
  // Arrange: isolate the browser workflow from GitHub's external OAuth/API availability.
  await page.route("**/api/github/session", (route) =>
    route.fulfill({ json: { connected: true, accountLogin: "acme-ai" } }),
  );
  await page.route("**/api/github/repositories", (route) =>
    route.fulfill({
      json: {
        repositories: [
          {
            owner: "acme-ai",
            repo: "customer-support-agent",
            fullName: "acme-ai/customer-support-agent",
          },
        ],
      },
    }),
  );
  await page.route("**/api/github/evidence-pack?*", (route) =>
    route.fulfill({
      json: {
        pullRequests: [pullRequest],
        meta: {
          owner: "acme-ai",
          repo: "customer-support-agent",
          generatedAt: "2026-06-30T12:00:00.000Z",
          from: "2026-06-01",
          to: "2026-06-30",
        },
      },
    }),
  );

  // Act: follow the MVP workflow a user performs in the browser.
  await page.goto("/");
  await expect(page.getByText("Connected as acme-ai")).toBeVisible();
  await page.getByRole("combobox", { name: "Repository" }).selectOption("acme-ai/customer-support-agent");
  await page.getByRole("textbox", { name: "From" }).fill("2026-06-01");
  await page.getByRole("textbox", { name: "To" }).fill("2026-06-30");
  await page.getByRole("button", { name: "Generate evidence pack" }).click();

  // Assert: the generated classification and evidence are visible.
  await expect(page.getByRole("link", { name: "#101" })).toBeVisible();
  await expect(page.getByText("Rewrite support escalation system prompt")).toBeVisible();
  const results = page.getByRole("table");
  await expect(results.getByText("Prompt", { exact: true })).toBeVisible();
  await expect(results.getByText("CHECKS_PASSED", { exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Raw CSV" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();

  expect(download.suggestedFilename()).toBe(
    "vouqis-evidence-pack-acme-ai-customer-support-agent-2026-06-01-to-2026-06-30.csv",
  );
  expect(downloadPath).not.toBeNull();
  expect(await readFile(downloadPath!, "utf8")).toContain(DISCLAIMER);
});
