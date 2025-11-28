# Plain.com MCP Server

An MCP server for querying your Plain.com support backlog from Claude.

## Setup

1. Install dependencies:
```bash
bun install
```

2. Get your Plain.com API key from Settings → API Keys with `thread:read` and `customer:read` permissions.

3. Add to your Claude Code config (`~/.claude.json`):
```json
{
  "mcpServers": {
    "plain": {
      "command": "bun",
      "args": ["run", "/home/ubuntu/projects/plain-mcp/src/index.ts"],
      "env": {
        "PLAIN_API_KEY": "your-api-key"
      }
    }
  }
}
```

4. Restart Claude Code to load the MCP server.

## Available Tools

### list_threads
List support threads with optional status filter.
- `status`: "todo" | "snoozed" | "done" (default: "todo")
- `limit`: 1-100 (default: 25)

### get_thread
Get detailed thread info including conversation timeline.
- `thread_id`: The thread ID to fetch

### search_customers
Find customers by email.
- `email`: Email address to search

### get_queue_stats
Quick overview of support queue with counts by status.

## Example Usage

Ask Claude:
- "Show me all todo threads"
- "Get the details of thread th_xxx"
- "How many threads need attention?"
- "Find customer john@example.com"
