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

    const threadStatus = statusMap[status] ?? ThreadStatus.Todo;
    const result = await plain.getThreads({
      filters: {
        statuses: [threadStatus],
      },
      first: limit,
    });

    if (result.error) {
      return {
        content: [{ type: "text", text: `Error: ${result.error.message}` }],
        isError: true,
      };
    }

    const threads = result.data.threads.map((thread: any) => ({
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

    const thread = threadResult.data as any;
    const customerId = thread.customer?.id;

    // Fetch timeline entries using rawRequest
    let timelineEntries: any[] = [];
    if (customerId) {
      const timelineQuery = `
        query TimelineEntries($customerId: ID!, $first: Int) {
          timelineEntries(customerId: $customerId, first: $first) {
            edges {
              node {
                id
                timestamp
                actor {
                  ... on UserActor {
                    __typename
                    user { fullName email }
                  }
                  ... on CustomerActor {
                    __typename
                    customer { fullName email { email } }
                  }
                  ... on SystemActor {
                    __typename
                    systemActorType
                  }
                  ... on MachineUserActor {
                    __typename
                    machineUser { fullName }
                  }
                }
                entry {
                  ... on ChatEntry {
                    __typename
                    chatId
                    text
                  }
                  ... on EmailEntry {
                    __typename
                    emailId
                    subject
                    textContent
                    from { email name }
                    to { email name }
                  }
                  ... on NoteEntry {
                    __typename
                    noteId
                    text
                  }
                  ... on CustomTimelineEntry {
                    __typename
                    title
                    components {
                      ... on ComponentText {
                        __typename
                        text
                      }
                    }
                  }
                }
                threadId
              }
            }
          }
        }
      `;

      const timelineResult = await plain.rawRequest({
        query: timelineQuery,
        variables: { customerId, first: 50 },
      });

      const data = timelineResult.data as any;
      if (!timelineResult.error && data?.timelineEntries?.edges) {
        // Filter to only entries for this thread
        timelineEntries = data.timelineEntries.edges
          .map((edge: any) => edge.node)
          .filter((entry: any) => entry.threadId === thread_id)
          .map((entry: any) => {
            const actorName = getActorName(entry.actor);
            const content = getEntryContent(entry.entry);
            return {
              id: entry.id,
              timestamp: entry.timestamp,
              actor: actorName,
              type: entry.entry?.__typename || "Unknown",
              content,
            };
          });
      }
    }

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
      labels: thread.labels?.map((l: any) => l.labelType.name) || [],
      createdAt: thread.createdAt.iso8601,
      updatedAt: thread.updatedAt.iso8601,
      timeline: timelineEntries,
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

// Helper function to extract actor name
function getActorName(actor: any): string {
  if (!actor) return "Unknown";
  switch (actor.__typename) {
    case "UserActor":
      return actor.user?.fullName || actor.user?.email || "Support Agent";
    case "CustomerActor":
      return actor.customer?.fullName || actor.customer?.email?.email || "Customer";
    case "SystemActor":
      return `System (${actor.systemActorType || "auto"})`;
    case "MachineUserActor":
      return actor.machineUser?.fullName || "Bot";
    default:
      return "Unknown";
  }
}

// Helper function to extract entry content
function getEntryContent(entry: any): string {
  if (!entry) return "";
  switch (entry.__typename) {
    case "ChatEntry":
      return entry.text || "";
    case "EmailEntry":
      return entry.textContent || entry.subject || "";
    case "NoteEntry":
      return entry.text || "";
    case "CustomTimelineEntry":
      if (entry.components?.length > 0) {
        return entry.components
          .filter((c: any) => c.__typename === "ComponentText")
          .map((c: any) => c.text)
          .join("\n");
      }
      return entry.title || "";
    default:
      return "";
  }
}

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
