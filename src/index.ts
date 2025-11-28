import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PlainClient, ThreadStatus } from "@team-plain/typescript-sdk";
import { z } from "zod";

const apiKey = process.env.PLAIN_API_KEY;
if (!apiKey) {
  console.error("PLAIN_API_KEY environment variable is required");
  process.exit(1);
}

const plain = new PlainClient({ apiKey });

const server = new McpServer({
  name: "plain-mcp",
  version: "1.0.0",
});

// Tool: list_threads
server.tool(
  "list_threads",
  "List support threads with optional status filter",
  {
    status: z
      .enum(["todo", "snoozed", "done"])
      .optional()
      .default("todo")
      .describe("Filter by thread status"),
    limit: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .default(25)
      .describe("Number of threads to return"),
  },
  async ({ status, limit }) => {
    const statusMap: Record<string, ThreadStatus> = {
      todo: ThreadStatus.Todo,
      snoozed: ThreadStatus.Snoozed,
      done: ThreadStatus.Done,
    };

    const result = await plain.getThreads({
      filters: {
        statuses: [statusMap[status]],
      },
      first: limit,
    });

    if (result.error) {
      return {
        content: [{ type: "text", text: `Error: ${result.error.message}` }],
        isError: true,
      };
    }

    const threads = result.data.threads.map((thread) => ({
      id: thread.id,
      title: thread.title || "(no title)",
      status: thread.status,
      priority: thread.priority,
      customer: thread.customer?.fullName || thread.customer?.email?.email || "Unknown",
      createdAt: thread.createdAt.iso8601,
      updatedAt: thread.updatedAt.iso8601,
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(threads, null, 2),
        },
      ],
    };
  }
);

// Tool: get_thread
server.tool(
  "get_thread",
  "Get detailed thread information including conversation timeline",
  {
    thread_id: z.string().describe("The thread ID to fetch"),
  },
  async ({ thread_id }) => {
    // Fetch thread details using getThread (not getThreadById)
    const threadResult = await plain.getThread({ threadId: thread_id });

    if (threadResult.error) {
      return {
        content: [{ type: "text", text: `Error: ${threadResult.error.message}` }],
        isError: true,
      };
    }

    if (!threadResult.data) {
      return {
        content: [{ type: "text", text: "Thread not found" }],
        isError: true,
      };
    }

    const thread = threadResult.data;

    // Note: Timeline requires a separate GraphQL query - the SDK doesn't have a dedicated method
    // We'll return what we have from the thread for now
    const response = {
      id: thread.id,
      title: thread.title || "(no title)",
      description: thread.description,
      status: thread.status,
      priority: thread.priority,
      customer: {
        id: thread.customer?.id,
        name: thread.customer?.fullName,
        email: thread.customer?.email?.email,
      },
      assignee: thread.assignee ? {
        id: thread.assignee.id,
        name: thread.assignee.fullName,
      } : null,
      labels: thread.labels?.map((l) => l.labelType.name) || [],
      createdAt: thread.createdAt.iso8601,
      updatedAt: thread.updatedAt.iso8601,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  }
);

// Tool: search_customers
server.tool(
  "search_customers",
  "Search for customers by email",
  {
    email: z.string().describe("Email address to search for"),
  },
  async ({ email }) => {
    const result = await plain.getCustomerByEmail({ email });

    if (result.error) {
      return {
        content: [{ type: "text", text: `Error: ${result.error.message}` }],
        isError: true,
      };
    }

    if (!result.data) {
      return {
        content: [{ type: "text", text: "No customer found with that email" }],
      };
    }

    const customer = result.data;
    const response = {
      id: customer.id,
      fullName: customer.fullName,
      shortName: customer.shortName,
      email: customer.email?.email,
      externalId: customer.externalId,
      createdAt: customer.createdAt.iso8601,
      updatedAt: customer.updatedAt.iso8601,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  }
);

// Tool: get_queue_stats
server.tool(
  "get_queue_stats",
  "Get a quick overview of the support queue with counts by status",
  {},
  async () => {
    // Get counts for each status
    const todoResult = await plain.getThreads({
      filters: { statuses: [ThreadStatus.Todo] },
      first: 100,
    });
    const snoozedResult = await plain.getThreads({
      filters: { statuses: [ThreadStatus.Snoozed] },
      first: 100,
    });

    const todoCount = todoResult.error ? 0 : todoResult.data.threads.length;
    const snoozedCount = snoozedResult.error ? 0 : snoozedResult.data.threads.length;

    const stats = {
      todo: todoCount,
      snoozed: snoozedCount,
      summary: `${todoCount} threads need attention (Todo), ${snoozedCount} snoozed`,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(stats, null, 2),
        },
      ],
    };
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Plain MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
