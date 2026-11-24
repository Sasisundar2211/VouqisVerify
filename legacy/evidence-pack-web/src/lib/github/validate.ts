// Small manual validators for request inputs. No zod — these are the only
// two shapes we ever accept from the client (owner/repo path segments and
// ISO dates), so hand-rolled regexes are simpler than a schema library.

import { isValidDateRange } from "@/lib/vouqis/filters";

const OWNER_OR_REPO = /^[a-zA-Z0-9._-]{1,100}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const GITHUB_APP_SLUG = /^[a-zA-Z0-9-]{1,100}$/;

export function isValidOwnerOrRepo(value: string): boolean {
  return OWNER_OR_REPO.test(value);
}

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isValidRepository(owner: string, repo: string): boolean {
  return isValidOwnerOrRepo(owner) && isValidOwnerOrRepo(repo);
}

export function isValidIsoDateRange(from: string, to: string): boolean {
  return isValidIsoDate(from) && isValidIsoDate(to) && isValidDateRange({ from, to });
}

export function isValidGithubAppSlug(value: string): boolean {
  return GITHUB_APP_SLUG.test(value);
}

export function parseInstallationId(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const installationId = Number(value);
  return Number.isSafeInteger(installationId) && installationId > 0 ? installationId : null;
}
