/**
 * Test script for Plain MCP server
 *
 * Run with: PLAIN_API_KEY=your_key bun run src/test.ts
 *
 * Or if you have your key in .env:
 *   source .env && bun run src/test.ts
 *
 * Requires PLAIN_API_KEY environment variable to be set.
 */

import { PlainClient, ThreadStatus } from "@team-plain/typescript-sdk";

const apiKey = process.env.PLAIN_API_KEY;
if (!apiKey) {
  console.error("PLAIN_API_KEY environment variable is required");
  process.exit(1);
}

const plain = new PlainClient({ apiKey });

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`✓ ${name}`);
  } catch (error: any) {
    results.push({ name, passed: false, error: error.message });
    console.log(`✗ ${name}: ${error.message}`);
  }
}

// Test: list_threads returns threads with customer names
async function testListThreads(): Promise<void> {
  const result = await plain.getThreads({
    filters: { statuses: [ThreadStatus.Todo] },
    first: 5,
  });

  assert(!result.error, `API error: ${result.error?.message}`);
  assert(Array.isArray(result.data.threads), "threads should be an array");

  if (result.data.threads.length > 0) {
    const thread = result.data.threads[0];
    assert(typeof thread.id === "string", "thread should have an id");
    assert(typeof thread.status === "string", "thread should have a status");

    // Check that we can fetch customer details
    if (thread.customer?.id) {
      const customerResult = await plain.getCustomerById({
        customerId: thread.customer.id,
      });
      assert(!customerResult.error, `Customer fetch error: ${customerResult.error?.message}`);
      assert(customerResult.data !== null, "customer data should not be null");

      const customer = customerResult.data!;
      const hasIdentifier = customer.fullName || customer.email?.email;
      assert(!!hasIdentifier, "customer should have fullName or email");

      console.log(`  → Customer: ${customer.fullName || customer.email?.email}`);
    }
  }
}

// Test: get_thread returns thread with customer details and timeline
async function testGetThread(): Promise<void> {
  // First get a thread ID
  const listResult = await plain.getThreads({
    filters: { statuses: [ThreadStatus.Todo] },
    first: 1,
  });

  assert(!listResult.error, `List error: ${listResult.error?.message}`);

  if (listResult.data.threads.length === 0) {
    console.log("  → Skipping: no threads available");
    return;
  }

  const threadId = listResult.data.threads[0].id;
  const threadResult = await plain.getThread({ threadId });

  assert(!threadResult.error, `Thread fetch error: ${threadResult.error?.message}`);
  assert(threadResult.data !== null, "thread data should not be null");

  const thread = threadResult.data as any;
  assert(typeof thread.id === "string", "thread should have id");
  assert(typeof thread.status === "string", "thread should have status");

  // Test customer fetch
  if (thread.customer?.id) {
    const customerResult = await plain.getCustomerById({
      customerId: thread.customer.id,
    });
    assert(!customerResult.error, `Customer error: ${customerResult.error?.message}`);

    const customer = customerResult.data;
    console.log(`  → Thread: ${thread.title || "(no title)"}`);
    console.log(`  → Customer ID: ${thread.customer.id}`);
    console.log(`  → Customer Name: ${customer?.fullName || "N/A"}`);
    console.log(`  → Customer Email: ${customer?.email?.email || "N/A"}`);
  }
}

// Test: timeline query returns entries
async function testTimeline(): Promise<void> {
  // Get a thread with a customer
  const listResult = await plain.getThreads({
    filters: { statuses: [ThreadStatus.Todo] },
    first: 5,
  });

  assert(!listResult.error, `List error: ${listResult.error?.message}`);

  const threadWithCustomer = listResult.data.threads.find((t: any) => t.customer?.id);
  if (!threadWithCustomer) {
    console.log("  → Skipping: no threads with customers");
    return;
  }

  const customerId = (threadWithCustomer as any).customer.id;
  const threadId = threadWithCustomer.id;

  const timelineQuery = `
    query TimelineEntries($customerId: ID!, $first: Int) {
      timelineEntries(customerId: $customerId, first: $first) {
        edges {
          node {
            id
            timestamp { iso8601 }
            threadId
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
    console.log(`  → Timeline query error: ${JSON.stringify(timelineResult.error, null, 2)}`);
    throw new Error(`Timeline query failed: ${timelineResult.error.message}`);
  }

  const data = timelineResult.data as any;

  if (!data?.timelineEntries?.edges) {
    console.log(`  → Timeline response: ${JSON.stringify(data, null, 2)}`);
    throw new Error("No timeline entries in response");
  }

  const allEntries = data.timelineEntries.edges.map((e: any) => e.node);
  const threadEntries = allEntries.filter((e: any) => e.threadId === threadId);

  console.log(`  → Total timeline entries for customer: ${allEntries.length}`);
  console.log(`  → Entries for thread ${threadId}: ${threadEntries.length}`);

  if (threadEntries.length > 0) {
    const entry = threadEntries[0];
    console.log(`  → First entry type: ${entry.entry?.__typename || "Unknown"}`);
    console.log(`  → First entry actor: ${entry.actor?.__typename || "Unknown"}`);
  }

  assert(allEntries.length >= 0, "should have timeline entries array");
}

// Test: search_customers works
async function testSearchCustomers(): Promise<void> {
  // First get a customer email from a thread
  const listResult = await plain.getThreads({
    filters: { statuses: [ThreadStatus.Todo] },
    first: 5,
  });

  if (listResult.error || listResult.data.threads.length === 0) {
    console.log("  → Skipping: no threads available");
    return;
  }

  const threadWithCustomer = listResult.data.threads.find((t: any) => t.customer?.id);
  if (!threadWithCustomer) {
    console.log("  → Skipping: no threads with customers");
    return;
  }

  const customerId = (threadWithCustomer as any).customer.id;
  const customerResult = await plain.getCustomerById({ customerId });

  if (customerResult.error || !customerResult.data?.email?.email) {
    console.log("  → Skipping: customer has no email");
    return;
  }

  const email = customerResult.data.email.email;
  console.log(`  → Searching for: ${email}`);

  const searchResult = await plain.getCustomerByEmail({ email });

  assert(!searchResult.error, `Search error: ${searchResult.error?.message}`);
  assert(searchResult.data !== null, "search should return a customer");
  assert(searchResult.data?.id === customerId, "should find the same customer");

  console.log(`  → Found: ${searchResult.data?.fullName || searchResult.data?.email?.email}`);
}

// Test: get_queue_stats works
async function testQueueStats(): Promise<void> {
  const todoResult = await plain.getThreads({
    filters: { statuses: [ThreadStatus.Todo] },
    first: 100,
  });
  const snoozedResult = await plain.getThreads({
    filters: { statuses: [ThreadStatus.Snoozed] },
    first: 100,
  });

  assert(!todoResult.error, `Todo fetch error: ${todoResult.error?.message}`);
  assert(!snoozedResult.error, `Snoozed fetch error: ${snoozedResult.error?.message}`);

  const todoCount = todoResult.data.threads.length;
  const snoozedCount = snoozedResult.data.threads.length;

  console.log(`  → Todo: ${todoCount}, Snoozed: ${snoozedCount}`);

  assert(typeof todoCount === "number", "todo count should be a number");
  assert(typeof snoozedCount === "number", "snoozed count should be a number");
}

// Test: link_thread_to_linear - debug permissions
async function testLinkThreadToLinear(): Promise<void> {
  const thread_id = "th_01KB3F64K9C8J7C2ZMTD89ZA2R";
  const linear_issue_id = "CUS-68";
  const linear_issue_url = "https://linear.app/tella/issue/CUS-68/virtual-backgrounds";

  const mutation = `
    mutation CreateThreadLink($input: CreateThreadLinkInput!) {
      createThreadLink(input: $input) {
        error {
          message
          type
          code
          fields {
            field
            message
            type
          }
        }
        threadLink {
          id
          createdAt { iso8601 }
        }
      }
    }
  `;

  console.log(`  → Attempting to link thread ${thread_id} to Linear issue ${linear_issue_id}`);

  const result = await plain.rawRequest({
    query: mutation,
    variables: {
      input: {
        threadId: thread_id,
        linearIssue: {
          linearIssueId: linear_issue_id,
          linearIssueUrl: linear_issue_url,
        },
      },
    },
  });

  if (result.error) {
    console.log(`  → Raw request error:`);
    console.log(`    - message: ${result.error.message}`);
    console.log(`    - type: ${result.error.type}`);
    console.log(`    - full error: ${JSON.stringify(result.error, null, 2)}`);
    throw new Error(`rawRequest failed: ${result.error.message}`);
  }

  const data = result.data as any;
  console.log(`  → Response data: ${JSON.stringify(data, null, 2)}`);

  if (data?.createThreadLink?.error) {
    const err = data.createThreadLink.error;
    console.log(`  → GraphQL error:`);
    console.log(`    - message: ${err.message}`);
    console.log(`    - type: ${err.type}`);
    console.log(`    - code: ${err.code}`);
    if (err.fields) {
      console.log(`    - fields: ${JSON.stringify(err.fields, null, 2)}`);
    }
    throw new Error(`GraphQL error: ${err.message} (code: ${err.code}, type: ${err.type})`);
  }

  if (data?.createThreadLink?.threadLink) {
    console.log(`  → Success! Link ID: ${data.createThreadLink.threadLink.id}`);
  }
}

// Run all tests
async function runTests(): Promise<void> {
  console.log("\n🧪 Plain MCP Test Suite\n");
  console.log("=".repeat(50));

  // Run the Linear link test first to debug
  await test("link_thread_to_linear permissions check", testLinkThreadToLinear);

  await test("list_threads returns threads with customer data", testListThreads);
  await test("get_thread returns full thread details", testGetThread);
  await test("timeline query returns entries", testTimeline);
  await test("search_customers finds customers by email", testSearchCustomers);
  await test("get_queue_stats returns counts", testQueueStats);

  console.log("\n" + "=".repeat(50));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.log("Failed tests:");
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  - ${r.name}: ${r.error}`);
      });
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error("Test runner error:", error);
  process.exit(1);
});
