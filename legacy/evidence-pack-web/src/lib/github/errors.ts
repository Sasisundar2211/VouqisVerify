// Maps GitHub/Octokit errors to safe, user-facing messages. Never surfaces
// raw error payloads, headers, tokens, or stack traces to the client.

export interface SafeGithubError {
  status: number;
  message: string;
}

interface OctokitLikeError {
  status?: number;
  response?: { headers?: Record<string, string> };
}

export function toSafeGithubError(error: unknown): SafeGithubError {
  const err = error as OctokitLikeError;
  const status = typeof err?.status === "number" ? err.status : 500;

  const remaining = err?.response?.headers?.["x-ratelimit-remaining"];
  if (status === 403 && remaining === "0") {
    return { status: 429, message: "GitHub API rate limit reached. Please try again in a few minutes." };
  }
  if (status === 401 || status === 403) {
    return { status: 403, message: "GitHub denied access to this resource. The installation may need to be reconnected." };
  }
  if (status === 404) {
    return { status: 404, message: "Repository or resource not found, or the installation does not have access to it." };
  }
  return { status: 500, message: "Something went wrong while contacting GitHub. Please try again." };
}
