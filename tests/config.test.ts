import { describe, it, expect, beforeEach } from "vitest";
import { loadConfig, ConfigError } from "../src/config.js";

describe("loadConfig", () => {
  beforeEach(() => {
    delete process.env.JIRA_SITE;
    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_SCOPED_TOKEN;
    delete process.env.JIRA_CLOUD_ID;
  });

  it("returns config when all required vars are set", () => {
    process.env.JIRA_SITE = "mycompany";
    process.env.JIRA_EMAIL = "bot@company.com";
    process.env.JIRA_SCOPED_TOKEN = "tok_abc123";

    const config = loadConfig();
    expect(config).toEqual({
      site: "mycompany",
      email: "bot@company.com",
      token: "tok_abc123",
      cloudId: undefined,
    });
  });

  it("includes cloudId when JIRA_CLOUD_ID is set", () => {
    process.env.JIRA_SITE = "mycompany";
    process.env.JIRA_EMAIL = "bot@company.com";
    process.env.JIRA_SCOPED_TOKEN = "tok_abc123";
    process.env.JIRA_CLOUD_ID = "cloud-uuid-here";

    const config = loadConfig();
    expect(config.cloudId).toBe("cloud-uuid-here");
  });

  it("throws ConfigError when JIRA_SITE is missing", () => {
    process.env.JIRA_EMAIL = "bot@company.com";
    process.env.JIRA_SCOPED_TOKEN = "tok_abc123";

    expect(() => loadConfig()).toThrow(ConfigError);
    expect(() => loadConfig()).toThrow("JIRA_SITE");
  });

  it("throws ConfigError when JIRA_EMAIL is missing", () => {
    process.env.JIRA_SITE = "mycompany";
    process.env.JIRA_SCOPED_TOKEN = "tok_abc123";

    expect(() => loadConfig()).toThrow(ConfigError);
    expect(() => loadConfig()).toThrow("JIRA_EMAIL");
  });

  it("throws ConfigError when JIRA_SCOPED_TOKEN is missing", () => {
    process.env.JIRA_SITE = "mycompany";
    process.env.JIRA_EMAIL = "bot@company.com";

    expect(() => loadConfig()).toThrow(ConfigError);
    expect(() => loadConfig()).toThrow("JIRA_SCOPED_TOKEN");
  });

  it("lists all missing vars in error message", () => {
    try {
      loadConfig();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const msg = (err as ConfigError).message;
      expect(msg).toContain("JIRA_SITE");
      expect(msg).toContain("JIRA_EMAIL");
      expect(msg).toContain("JIRA_SCOPED_TOKEN");
    }
  });
});
