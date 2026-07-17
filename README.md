# Kaminari Click MCP Server

Official [Model Context Protocol](https://modelcontextprotocol.io) server for [Kaminari Click](https://kaminari.click) — connect Claude, Cursor, ChatGPT, or any MCP-capable agent to your traffic-quality statistics.

- **Statistics** — slice traffic by time, sub IDs, geo, device; compare periods; filter by any dimension.
- **Reports** — list, save, and delete saved reports; create public share links.
- **Databases** — check access to and download slices of the IP risk-score, VPN IP, and bot User-Agent databases.

## Quick start

1. Generate an **MCP / Agent token** in the Kaminari Click account settings (separate from the regular API token).
2. Add the server to your client.

### Cursor / Claude Code / any stdio client

```json
{
  "mcpServers": {
    "kaminari-click": {
      "command": "npx",
      "args": ["-y", "@kaminari-click/mcp"],
      "env": {
        "KAMINARI_CLICK_API_KEY": "<mcp-agent-token>"
      }
    }
  }
}
```

Use an **MCP / Agent token** from Account Settings — regular API tokens are rejected. Optionally set `KAMINARI_CLICK_JWT_KEY` (same as UI `AUTH_JWTKEY`) on self-hosted deployments to verify JWT signatures locally.

### Claude Desktop

Download `kaminari-click-mcp.mcpb` from the latest release and double-click to install. Claude Desktop asks for your API token during setup.

### ChatGPT / hosted agents (HTTP)

Point the connector at `https://mcp.kaminari.click/mcp`. The server implements OAuth 2.0 (authorization code + PKCE + dynamic client registration): during authorization you paste your API token once, and the client receives it as its access token. Self-hosting:

```bash
KAMINARI_CLICK_TRANSPORT=http KAMINARI_CLICK_HTTP_PORT=8080 npx -y @kaminari-click/mcp
```

In HTTP mode every request must carry `Authorization: Bearer <api-token>`; the `KAMINARI_CLICK_API_KEY` env var is rejected so one tenant's token can never leak to another.

## Tools

| Tool                                 | Purpose                                                        |
| ------------------------------------ | -------------------------------------------------------------- |
| `list_stat_fields`                   | Grouping dimensions and metrics available to the account       |
| `query_stats`                        | Query statistics with grouping, filters, and period comparison |
| `search_filter_values`               | Autocomplete values for a dimension filter                     |
| `list_reports` / `get_report`        | Browse saved reports                                           |
| `save_report` / `delete_report`      | Manage saved reports                                           |
| `share_report` / `get_shared_report` | Public share links for report slices                           |
| `check_database_access`              | Verify an IP/UA database subscription                          |
| `download_database`                  | Fetch a bounded CSV slice of an IP/UA database                 |

## Configuration

All variables are prefixed `KAMINARI_CLICK_` — see [.env.example](.env.example). Key ones:

| Variable                        | Default                  | Notes                                                             |
| ------------------------------- | ------------------------ | ----------------------------------------------------------------- |
| `KAMINARI_CLICK_API_KEY`        | —                        | MCP / Agent token; required in stdio; forbidden in http           |
| `KAMINARI_CLICK_JWT_KEY`        | —                        | Optional; UI `AUTH_JWTKEY` — verify agent JWT signatures when set |
| `KAMINARI_CLICK_API_URL`        | `https://kaminari.click` | API base URL                                                      |
| `KAMINARI_CLICK_TRANSPORT`      | `stdio`                  | `stdio` or `http` (also `--transport=` flag)                      |
| `KAMINARI_CLICK_HTTP_PORT`      | `8080`                   | HTTP mode listen port                                             |
| `KAMINARI_CLICK_RATE_LIMIT_RPM` | `120`                    | Per-token rate limit in HTTP mode                                 |

## Development

```bash
npm install
npm run lint && npm run typecheck   # static gates
npm run test:cov                    # tests + coverage gate (100% lines)
npm run build                       # npm package -> dist/
npm run build:mcpb-bundle           # Claude Desktop bundle -> dist-mcpb/
npx @anthropic-ai/mcpb pack . kaminari-click-mcp.mcpb   # .mcpb archive
```

Version lives only in `package.json`. Bump with `npm version patch|minor|major` — that runs `sync-version` and updates `src/shared/version.ts`, `manifest.json`, and `server.json` automatically. Or run `npm run sync-version` after editing `package.json` by hand.

Architecture: clean layering (`domain` → `application` → `infrastructure` / `presentation`), all dependencies flow through a per-request `ToolContext`, expected errors travel as `Result<T, E>` (neverthrow). The HTTP transport is stateless — any replica can serve any request — and API tokens never appear in logs.

## Security

- Bearer tokens are wrapped in a self-redacting value object and never logged.
- HTTP mode builds a fresh API gateway per request; there is no cross-tenant state.
- The OAuth authorization server stores nothing beyond a 5-minute one-time code window.

Report vulnerabilities to security@kaminari.click.

## License

[MIT](LICENSE)
