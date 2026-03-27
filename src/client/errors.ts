/**
 * Thrown when the JIRA API returns a non-success HTTP status.
 * Parses the standard Jira ErrorCollection response format.
 */
export class JiraApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly errorMessages: string[],
    public readonly fieldErrors: Record<string, string>,
  ) {
    const parts = [
      ...errorMessages,
      ...Object.entries(fieldErrors).map(([field, msg]) => `${field}: ${msg}`),
    ];
    super(parts.join("; ") || `JIRA API error (HTTP ${status})`);
    this.name = "JiraApiError";
  }
}

/**
 * Thrown when Cloud ID resolution fails for a given site.
 */
export class CloudIdError extends Error {
  constructor(site: string, cause?: Error) {
    super(
      `Failed to resolve Cloud ID for site "${site}": ${cause?.message || "unknown error"}`,
    );
    this.name = "CloudIdError";
  }
}
