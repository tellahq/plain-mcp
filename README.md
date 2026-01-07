# Plain.com MCP Server

An MCP server providing comprehensive access to the Plain.com API from Claude, with 77 tools covering support threads, customers, help centers, automation, and more.

## Setup

1. Install dependencies:
```bash
bun install
```

2. Get your Plain.com API key from Settings → API Keys with full API permissions.

3. Add to your Claude Code config (`~/.claude.json`):
```json
{
  "mcpServers": {
    "plain": {
      "command": "bun",
      "args": ["run", "/path/to/plain-mcp/src/index.ts"],
      "env": {
        "PLAIN_API_KEY": "your-api-key"
      }
    }
  }
}
```

4. Restart Claude Code to load the MCP server.

## Available Tools (77)

### Help Centers

| Tool | Description |
|------|-------------|
| `list_help_centers` | List all help centers in the workspace |
| `get_help_center` | Get details of a specific help center |
| `create_help_center` | Create a new help center |
| `update_help_center` | Update an existing help center |
| `delete_help_center` | Delete a help center |
| `update_help_center_custom_domain` | Set a custom domain for a help center |
| `verify_help_center_custom_domain` | Verify DNS ownership of a custom domain |

### Help Center Articles

| Tool | Description |
|------|-------------|
| `list_help_center_articles` | List articles in a help center |
| `get_help_center_article` | Get a specific help center article by ID |
| `get_help_center_article_by_slug` | Get a help center article by its URL slug |
| `upsert_help_center_article` | Create or update a help center article |
| `delete_help_center_article` | Delete a help center article |
| `generate_help_center_article` | Auto-generate an article from a thread using AI |

### Help Center Article Groups

| Tool | Description |
|------|-------------|
| `list_help_center_article_groups` | List article groups (categories) in a help center |
| `get_help_center_article_group` | Get a specific article group by ID |
| `create_help_center_article_group` | Create a new article group (category) |
| `update_help_center_article_group` | Update an article group |
| `delete_help_center_article_group` | Delete an article group |

### Help Center Index

| Tool | Description |
|------|-------------|
| `get_help_center_index` | Get the navigation index/structure of a help center |
| `update_help_center_index` | Update the navigation index/structure |

### Knowledge Sources

| Tool | Description |
|------|-------------|
| `create_knowledge_source` | Create a knowledge source for AI to reference |
| `delete_knowledge_source` | Delete a knowledge source |

### Customers

| Tool | Description |
|------|-------------|
| `upsert_customer` | Create or update a customer |
| `delete_customer` | Delete a customer |
| `get_customer` | Get detailed customer information by ID |
| `search_customers` | Search for customers by email |
| `mark_customer_as_spam` | Mark a customer as spam |
| `unmark_customer_as_spam` | Remove spam marking from a customer |
| `create_customer_event` | Create a custom event on a customer timeline |

### Customer Groups

| Tool | Description |
|------|-------------|
| `list_customer_groups` | List all customer groups |
| `create_customer_group` | Create a new customer group |
| `add_customer_to_groups` | Add a customer to one or more groups |
| `remove_customer_from_groups` | Remove a customer from one or more groups |

### Threads

| Tool | Description |
|------|-------------|
| `list_threads` | List support threads with optional status filter |
| `get_thread` | Get detailed thread info including conversation timeline |
| `get_queue_stats` | Get a quick overview of support queue counts |
| `create_thread` | Create a new support thread for a customer |
| `update_thread_title` | Update the title of a thread |
| `delete_thread` | Permanently delete a thread |
| `assign_thread` | Assign a thread to a user |
| `unassign_thread` | Remove assignment from a thread |
| `change_thread_priority` | Change the priority of a thread |
| `create_thread_event` | Create a custom event on a thread timeline |

### Thread Actions

| Tool | Description |
|------|-------------|
| `reply_to_thread` | Reply to a thread (sent via original channel) |
| `mark_thread_done` | Mark a thread as done/resolved |
| `mark_thread_todo` | Mark a thread as todo (re-open it) |
| `snooze_thread` | Snooze a thread for a specified duration |

### Thread Labels

| Tool | Description |
|------|-------------|
| `list_label_types` | List all available label types |
| `create_label_type` | Create a new label type |
| `add_labels_to_thread` | Add labels to a thread |
| `remove_labels_from_thread` | Remove labels from a thread |

### Thread Fields

| Tool | Description |
|------|-------------|
| `list_thread_field_schemas` | List all custom thread field schemas |
| `upsert_thread_field` | Set a custom field value on a thread |

### Notes

| Tool | Description |
|------|-------------|
| `create_note` | Create an internal note on a thread (not visible to customer) |
| `delete_note` | Delete an internal note from a thread |

### Communication

| Tool | Description |
|------|-------------|
| `send_email` | Send a new email to a customer (starts a new thread) |
| `send_chat` | Send a chat message to a customer |

### Companies

| Tool | Description |
|------|-------------|
| `upsert_company` | Create or update a company |
| `delete_company` | Delete a company |

### Tenants

| Tool | Description |
|------|-------------|
| `upsert_tenant` | Create or update a tenant |
| `delete_tenant` | Delete a tenant |

### Snippets

| Tool | Description |
|------|-------------|
| `list_snippets` | List all snippets (canned responses) |
| `create_snippet` | Create a new snippet |
| `update_snippet` | Update an existing snippet |
| `delete_snippet` | Delete a snippet |

### Webhooks

| Tool | Description |
|------|-------------|
| `list_webhooks` | List all webhook targets |
| `create_webhook` | Create a new webhook target |
| `update_webhook` | Update a webhook target |
| `delete_webhook` | Delete a webhook target |

### Autoresponders

| Tool | Description |
|------|-------------|
| `list_autoresponders` | List all autoresponders |
| `create_autoresponder` | Create a new autoresponder |
| `delete_autoresponder` | Delete an autoresponder |

### Tiers

| Tool | Description |
|------|-------------|
| `list_tiers` | List all support tiers |
| `create_tier` | Create a new support tier |
| `delete_tier` | Delete a support tier |

### Workspace & Users

| Tool | Description |
|------|-------------|
| `get_workspace` | Get current workspace information |
| `list_users` | List workspace users |

## Example Usage

Ask Claude:
- "Show me all todo threads"
- "Get the details of thread th_xxx"
- "How many threads need attention?"
- "Find customer john@example.com"
- "Reply to thread th_xxx saying we're looking into it"
- "Mark thread th_xxx as done"
- "Snooze thread th_xxx for 24 hours"
- "Add a note to thread th_xxx that this is a billing issue"
- "Create a new help center article about password resets"
- "List all snippets"
- "Assign thread th_xxx to user u_xxx"
- "Generate a help center article from thread th_xxx"
