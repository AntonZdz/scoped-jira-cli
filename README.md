# sjira

A JIRA CLI built for CI/CD pipelines that natively supports Atlassian **scoped access tokens**.

Atlassian is [deprecating unscoped API tokens](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/). The popular `jira-cli` tool uses site-specific URLs (`your-site.atlassian.net`) which don't work with scoped tokens. `sjira` routes all API calls through the Atlassian API gateway (`api.atlassian.com/ex/jira/{cloudId}/...`), which is required for scoped token authentication.

## Install

```bash
# From source (recommended for now)
git clone https://github.com/AntonZdz/scoped-jira-cli.git
cd scoped-jira-cli
npm install && npm run build
npm link              # makes sjira and sjira-mcp available globally

# From npm (once published)
npm install -g scoped-jira-cli
```

The install is lightweight — the only runtime dependency is `commander`. The MCP server is bundled separately and adds no overhead if you don't use it.

## Quick Start

Set your credentials in your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
export JIRA_SITE="mycompany"            # your-site.atlassian.net subdomain
export JIRA_EMAIL="ci-bot@company.com"
export JIRA_SCOPED_TOKEN="your-token"
```

Then use it:

```bash
sjira issue create -p PROJ -t Bug -s "Build failed on main"
sjira issue get PROJ-123
sjira issue transition PROJ-123 --to "In Progress"
sjira comment add PROJ-123 -b "Deployed to staging"
sjira search -j "project = PROJ AND status = 'To Do'"
```

## Creating a Scoped Token

1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Create a new token with these scopes:
   - `read:jira-work`
   - `write:jira-work`

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `JIRA_SITE` | Yes | Atlassian site subdomain (e.g. `mycompany` for `mycompany.atlassian.net`) |
| `JIRA_EMAIL` | Yes | Email address associated with the token |
| `JIRA_SCOPED_TOKEN` | Yes | Scoped access token |
| `JIRA_CLOUD_ID` | No | Cloud ID (auto-discovered if not set, set it to skip a network round-trip) |

## Commands

### Issues

```bash
# Create
sjira issue create -p PROJ -t Task -s "Summary" -d "Description" --priority High -l label1 label2

# Read
sjira issue get PROJ-123
sjira issue get PROJ-123 --fields summary,status,assignee

# Update
sjira issue update PROJ-123 -s "New summary" --add-label urgent --remove-label stale --priority Critical

# Assign / unassign
sjira issue assign PROJ-123 5b10ac8d82e05b22cc7d4ef5
sjira issue assign PROJ-123                              # unassign

# Transition
sjira issue transition PROJ-123 --list                   # show available transitions
sjira issue transition PROJ-123 --to "In Progress"       # by name or target status
sjira issue transition PROJ-123 --id 21                  # by transition ID

# Clone
sjira issue clone PROJ-123                               # clone with link to original
sjira issue clone PROJ-123 -s "Custom summary"           # override summary
sjira issue clone PROJ-123 --no-link                     # clone without linking

# Delete
sjira issue delete PROJ-123
```

### Comments

```bash
sjira comment add PROJ-123 -b "Deployment complete"
sjira comment list PROJ-123 --limit 10
```

### Links

```bash
sjira link add PROJ-123 PROJ-456 -t Blocks
sjira link add PROJ-123 PROJ-456 -t Relates -c "These are related"
```

### Search

```bash
sjira search -j "project = PROJ AND status = 'In Progress'"
sjira search -j "assignee = currentUser() ORDER BY updated DESC" --limit 50
sjira search -j "labels = deploy" --fields summary,status
```

### Projects & Boards

```bash
sjira project list
sjira board list                          # all boards
sjira board list -p PROJ                  # boards for a project
```

### Sprints

```bash
sjira sprint list -b 42                   # list sprints for board 42
sjira sprint list -b 42 --state active    # filter by state
sjira sprint add 100 PROJ-1 PROJ-2       # add issues to sprint 100
```

### Epics

```bash
sjira epic add PROJ-100 PROJ-1 PROJ-2    # add issues to an epic
```

### Work Logs

```bash
sjira worklog add PROJ-123 -t "2h 30m"
sjira worklog add PROJ-123 -t "1d" -c "Completed refactoring"
```

### Custom Fields

Use `-f` to set arbitrary fields as `key=value` pairs. Values are parsed as JSON if valid, otherwise treated as strings:

```bash
sjira issue create -p PROJ -t Task -s "Title" -f customfield_10001=myvalue
sjira issue create -p PROJ -t Task -s "Title" -f 'fixVersions=[{"name":"1.0"}]'
```

## JSON Output

Add `--json` to any command for machine-parseable output. Useful for piping to `jq` or setting CI outputs:

```bash
# Get issue key from create
KEY=$(sjira --json issue create -p PROJ -t Bug -s "Failure" | jq -r '.key')

# Parse search results
sjira --json search -j "project = PROJ" | jq '.issues[].key'
```

## GitHub Actions

```yaml
- name: Install sjira
  run: npm install -g scoped-jira-cli   # once published to npm

- name: Transition JIRA issue
  env:
    JIRA_SITE: ${{ vars.JIRA_SITE }}
    JIRA_EMAIL: ${{ secrets.JIRA_EMAIL }}
    JIRA_SCOPED_TOKEN: ${{ secrets.JIRA_SCOPED_TOKEN }}
  run: sjira issue transition PROJ-123 --to "Done"
```

## MCP Server (Optional — AI Tool Integration)

`sjira` ships with an optional MCP (Model Context Protocol) server (`sjira-mcp`), allowing AI coding tools like Claude Code, Claude Desktop, Cursor, and Windsurf to interact with JIRA directly. If you only need the CLI, you can ignore this section entirely — the MCP server is a separate binary that adds no overhead to the CLI.

### Security: Credential Handling

The MCP server reads credentials from your shell environment — the same `JIRA_SITE`, `JIRA_EMAIL`, and `JIRA_SCOPED_TOKEN` variables used by the CLI. **Never hardcode tokens in MCP config files.**

Your credentials should already be set in your shell profile (see [Quick Start](#quick-start)). For better security, load tokens from a secrets manager instead of storing them as plain text:

```bash
# 1Password
export JIRA_SCOPED_TOKEN="$(op read 'op://Private/jira-token/credential')"

# macOS Keychain
export JIRA_SCOPED_TOKEN="$(security find-generic-password -s jira-token -w)"
```

### Setup

Make sure `sjira-mcp` is on your PATH (via `npm link` or a global install), then configure your AI tool:

**Claude Code** (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "sjira": {
      "command": "sjira-mcp"
    }
  }
}
```

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "sjira": {
      "command": "sjira-mcp"
    }
  }
}
```

**Cursor** (`.cursor/mcp.json` in your project root):

```json
{
  "mcpServers": {
    "sjira": {
      "command": "sjira-mcp"
    }
  }
}
```

### Available Tools

| Tool | Description |
|---|---|
| `get_issue` | Get issue details by key |
| `search_issues` | Search with JQL |
| `create_issue` | Create a new issue |
| `update_issue` | Update issue fields |
| `transition_issue` | Move status or list available transitions |
| `add_comment` | Add a comment |
| `get_comments` | List comments |
| `assign_issue` | Assign or unassign |
| `link_issues` | Link two issues |
| `list_projects` | List accessible projects |
| `list_sprints` | List sprints for a board |
| `add_worklog` | Log time |

### CI/CD Note

In CI environments, use the CLI (`sjira`) directly rather than the MCP server. The MCP server is designed for interactive AI tool sessions, not pipeline scripts. See [GitHub Actions](#github-actions) for CI examples.

## How It Works

Scoped tokens require the Atlassian API gateway URL instead of site-specific URLs:

| Token Type | Base URL |
|---|---|
| Unscoped (deprecated) | `https://your-site.atlassian.net/rest/api/3/...` |
| **Scoped** | `https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/...` |

`sjira` auto-discovers your Cloud ID from your site's `_edge/tenant_info` endpoint (or uses `JIRA_CLOUD_ID` if set), then routes all requests through the gateway. The auth header format is the same (`Basic base64(email:token)`) — only the URL routing differs.

## Development

```bash
git clone https://github.com/AntonZdz/scoped-jira-cli.git
cd scoped-jira-cli
npm install
npm run build       # build with tsup
npm test            # run tests
npm run dev -- issue get PROJ-123   # run without building
```

### Smoke Test

To run the full integration test against a live JIRA instance:

```bash
cp .env.example .env
# Fill in your credentials and SMOKE_TEST_PROJECT

./scripts/smoke-test.sh              # runs tests, cleans up created issues
./scripts/smoke-test.sh --no-cleanup # keep issues for manual inspection
./scripts/smoke-test.sh --dev        # use tsx instead of built dist/

# Clean up after --no-cleanup
./scripts/cleanup.sh PROJ-42 PROJ-43
```

## Exit Codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | General error |
| 2 | Configuration error (missing env vars) |
| 3 | Cloud ID resolution failed |
| 4 | JIRA API error |

## License

MIT
