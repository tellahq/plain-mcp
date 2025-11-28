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

    // Fetch customer details for each thread (thread only contains customer ID)
    const threads = await Promise.all(
      result.data.threads.map(async (thread: any) => {
        let customerName = "Unknown";
        if (thread.customer?.id) {
          const customerResult = await plain.getCustomerById({
            customerId: thread.customer.id,
          });
          if (!customerResult.error && customerResult.data) {
            customerName =
              customerResult.data.fullName ||
              customerResult.data.email?.email ||
              "Unknown";
          }
        }
        return {
          id: thread.id,
          title: thread.title || "(no title)",
          status: thread.status,
          priority: thread.priority,
          customer: customerName,
          createdAt: thread.createdAt.iso8601,
          updatedAt: thread.updatedAt.iso8601,
        };
      })
    );

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

    // Fetch full customer details separately (thread only contains customer ID)
    let customerDetails: { id: string; name?: string; email?: string } = {
      id: customerId,
    };
    if (customerId) {
      const customerResult = await plain.getCustomerById({ customerId });
      if (!customerResult.error && customerResult.data) {
        customerDetails = {
          id: customerId,
          name: customerResult.data.fullName,
          email: customerResult.data.email?.email,
        };
      }
    }

    // Fetch timeline entries using rawRequest
    let timelineEntries: any[] = [];
    if (customerId) {
      const timelineQuery = `
        query TimelineEntries($customerId: ID!, $first: Int) {
          timelineEntries(customerId: $customerId, first: $first) {
            edges {
              node {
                id
                timestamp { iso8601 }
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
                    chatText: text
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
                    noteText: text
                  }
                  ... on CustomEntry {
                    __typename
                    title
                    components {
                      ... on ComponentText {
                        __typename
                        componentText: text
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

      if (timelineResult.error) {
        console.error("Timeline query error:", timelineResult.error);
      }
      const data = timelineResult.data as any;
      if (!data?.timelineEntries?.edges) {
        console.error("No timeline edges found. Response data:", JSON.stringify(data, null, 2));
      }
      if (data?.timelineEntries?.edges) {
        // Filter to only entries for this thread
        timelineEntries = data.timelineEntries.edges
          .map((edge: any) => edge.node)
          .filter((entry: any) => entry.threadId === thread_id)
          .map((entry: any) => {
            const actorName = getActorName(entry.actor);
            const content = getEntryContent(entry.entry);
            return {
              id: entry.id,
              timestamp: entry.timestamp?.iso8601,
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
      customer: customerDetails,
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
      return entry.chatText || "";
    case "EmailEntry":
      return entry.textContent || entry.subject || "";
    case "NoteEntry":
      return entry.noteText || "";
    case "CustomEntry":
      if (entry.components?.length > 0) {
        return entry.components
          .filter((c: any) => c.__typename === "ComponentText")
          .map((c: any) => c.componentText)
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

// Tool: reply_to_thread
server.tool(
  "reply_to_thread",
  "Reply to a support thread. The reply will be sent to the customer via the original channel (email, chat, etc.)",
  {
    thread_id: z.string().describe("The thread ID to reply to"),
    text: z.string().describe("The plain text content of the reply"),
    markdown: z
      .string()
      .optional()
      .describe("Optional markdown-formatted content (will be used for rich display if supported)"),
  },
  async ({ thread_id, text, markdown }) => {
    const result = await plain.replyToThread({
      threadId: thread_id,
      textContent: text,
      markdownContent: markdown,
    });

    if (result.error) {
      return {
        content: [{ type: "text", text: `Error: ${result.error.message}` }],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Reply sent successfully to thread ${thread_id}`,
        },
      ],
    };
  }
);

// Tool: mark_thread_done
server.tool(
  "mark_thread_done",
  "Mark a support thread as done/resolved",
  {
    thread_id: z.string().describe("The thread ID to mark as done"),
  },
  async ({ thread_id }) => {
    const result = await plain.markThreadAsDone({
      threadId: thread_id,
    });

    if (result.error) {
      return {
        content: [{ type: "text", text: `Error: ${result.error.message}` }],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Thread ${thread_id} marked as done`,
        },
      ],
    };
  }
);

// Tool: mark_thread_todo
server.tool(
  "mark_thread_todo",
  "Mark a support thread as todo (re-open it)",
  {
    thread_id: z.string().describe("The thread ID to mark as todo"),
  },
  async ({ thread_id }) => {
    const result = await plain.markThreadAsTodo({
      threadId: thread_id,
    });

    if (result.error) {
      return {
        content: [{ type: "text", text: `Error: ${result.error.message}` }],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Thread ${thread_id} marked as todo`,
        },
      ],
    };
  }
);

// Tool: snooze_thread
server.tool(
  "snooze_thread",
  "Snooze a support thread for a specified duration",
  {
    thread_id: z.string().describe("The thread ID to snooze"),
    duration_seconds: z
      .number()
      .min(60)
      .max(2592000) // max 30 days
      .describe("Duration to snooze in seconds (e.g., 86400 for 1 day)"),
  },
  async ({ thread_id, duration_seconds }) => {
    const result = await plain.snoozeThread({
      threadId: thread_id,
      durationSeconds: duration_seconds,
    });

    if (result.error) {
      return {
        content: [{ type: "text", text: `Error: ${result.error.message}` }],
        isError: true,
      };
    }

    const hours = Math.round(duration_seconds / 3600);
    return {
      content: [
        {
          type: "text",
          text: `Thread ${thread_id} snoozed for ${hours} hour(s)`,
        },
      ],
    };
  }
);

// Tool: create_note
server.tool(
  "create_note",
  "Create an internal note on a thread (not visible to customer)",
  {
    thread_id: z.string().describe("The thread ID to add the note to"),
    customer_id: z.string().describe("The customer ID associated with the thread"),
    text: z.string().describe("The plain text content of the note"),
    markdown: z
      .string()
      .optional()
      .describe("Optional markdown-formatted content for rich display"),
  },
  async ({ thread_id, customer_id, text, markdown }) => {
    const result = await plain.createNote({
      threadId: thread_id,
      customerId: customer_id,
      text: text,
      markdown: markdown,
    });

    if (result.error) {
      return {
        content: [{ type: "text", text: `Error: ${result.error.message}` }],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Note created successfully on thread ${thread_id}`,
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
