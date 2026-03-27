export interface Config {
  /** Atlassian site subdomain (e.g. "mycompany" for mycompany.atlassian.net) */
  site: string;
  /** Email address associated with the scoped token */
  email: string;
  /** Atlassian scoped access token */
  token: string;
  /** Cloud ID — auto-discovered from site if not provided */
  cloudId?: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const REQUIRED_VARS = {
  JIRA_SITE: "site subdomain (e.g. mycompany)",
  JIRA_EMAIL: "email for authentication",
  JIRA_SCOPED_TOKEN: "scoped access token",
} as const;

export function loadConfig(): Config {
  const missing = Object.entries(REQUIRED_VARS)
    .filter(([key]) => !process.env[key])
    .map(([key, desc]) => `  ${key} — ${desc}`);

  if (missing.length > 0) {
    throw new ConfigError(
      `Missing required environment variables:\n${missing.join("\n")}`,
    );
  }

  return {
    site: process.env.JIRA_SITE!,
    email: process.env.JIRA_EMAIL!,
    token: process.env.JIRA_SCOPED_TOKEN!,
    cloudId: process.env.JIRA_CLOUD_ID || undefined,
  };
}
