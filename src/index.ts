#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { PlainClient, ThreadStatus, TodoStatusDetail, SnoozeStatusDetail } from "@team-plain/typescript-sdk";
import { z } from "zod";

const apiKey = process.env.PLAIN_API_KEY;
if (!apiKey) {
  console.error("PLAIN_API_KEY environment variable is required");
  process.exit(1);
}

const plain = new PlainClient({ apiKey });

const server = new McpServer({
  name: "plain-mcp",
  version: "2.0.0",
});

// =============================================================================
// HELP CENTER TOOLS
// =============================================================================

// Tool: list_help_centers
server.tool(
  "list_help_centers",
  "List all help centers in the workspace",
  {
    limit: z.number().min(1).max(50).optional().default(25).describe("Number of help centers to return"),
  },
  async ({ limit }) => {
    const query = `
      query HelpCenters($first: Int) {
        helpCenters(first: $first) {
          edges {
            node {
              id
              publicName
              internalName
              type
              description
              domainSettings {
                domainName
                customDomainName
              }
              createdAt { iso8601 }
              updatedAt { iso8601 }
            }
          }
        }
      }
    `;

    const result = await plain.rawRequest({ query, variables: { first: limit } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    const helpCenters = data?.helpCenters?.edges?.map((e: any) => ({
      ...e.node,
      subdomain: e.node.domainSettings?.domainName,
      customDomainName: e.node.domainSettings?.customDomainName,
    })) || [];

    return { content: [{ type: "text", text: JSON.stringify(helpCenters, null, 2) }] };
  }
);

// Tool: get_help_center
server.tool(
  "get_help_center",
  "Get details of a specific help center",
  {
    help_center_id: z.string().describe("The help center ID"),
  },
  async ({ help_center_id }) => {
    const query = `
      query HelpCenter($id: ID!) {
        helpCenter(id: $id) {
          id
          publicName
          internalName
          type
          description
          domainSettings {
            domainName
            customDomainName
          }
          createdAt { iso8601 }
          updatedAt { iso8601 }
        }
      }
    `;

    const result = await plain.rawRequest({ query, variables: { id: help_center_id } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const hc = (result.data as any)?.helpCenter;
    if (hc) {
      hc.subdomain = hc.domainSettings?.domainName;
      hc.customDomainName = hc.domainSettings?.customDomainName;
    }

    return { content: [{ type: "text", text: JSON.stringify(hc, null, 2) }] };
  }
);

// Tool: create_help_center
server.tool(
  "create_help_center",
  "Create a new help center",
  {
    public_name: z.string().describe("Public-facing name of the help center"),
    internal_name: z.string().describe("Internal name for the help center"),
    subdomain: z.string().describe("Subdomain for the help center (e.g., 'help' for help.plain.com)"),
    type: z.enum(["STANDALONE", "EMBEDDED"]).optional().default("STANDALONE").describe("Help center type"),
    description: z.string().optional().describe("Description of the help center"),
  },
  async ({ public_name, internal_name, subdomain, type, description }) => {
    const mutation = `
      mutation CreateHelpCenter($input: CreateHelpCenterInput!) {
        createHelpCenter(input: $input) {
          helpCenter {
            id
            publicName
            subdomain
          }
          error {
            message
            code
          }
        }
      }
    `;

    const input: any = {
      publicName: public_name,
      internalName: internal_name,
      subdomain,
      type,
    };
    if (description) input.description = description;

    const result = await plain.rawRequest({ query: mutation, variables: { input } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.createHelpCenter?.error) {
      return { content: [{ type: "text", text: `Error: ${data.createHelpCenter.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: JSON.stringify(data?.createHelpCenter?.helpCenter, null, 2) }] };
  }
);

// Tool: update_help_center
server.tool(
  "update_help_center",
  "Update an existing help center",
  {
    help_center_id: z.string().describe("The help center ID to update"),
    public_name: z.string().optional().describe("New public-facing name"),
    internal_name: z.string().optional().describe("New internal name"),
    description: z.string().optional().describe("New description"),
  },
  async ({ help_center_id, public_name, internal_name, description }) => {
    const mutation = `
      mutation UpdateHelpCenter($input: UpdateHelpCenterInput!) {
        updateHelpCenter(input: $input) {
          helpCenter {
            id
            publicName
            internalName
            description
          }
          error {
            message
            code
          }
        }
      }
    `;

    const input: any = { helpCenterId: help_center_id };
    if (public_name) input.publicName = public_name;
    if (internal_name) input.internalName = internal_name;
    if (description) input.description = description;

    const result = await plain.rawRequest({ query: mutation, variables: { input } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.updateHelpCenter?.error) {
      return { content: [{ type: "text", text: `Error: ${data.updateHelpCenter.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Help center ${help_center_id} updated successfully` }] };
  }
);

// Tool: delete_help_center
server.tool(
  "delete_help_center",
  "Delete a help center",
  {
    help_center_id: z.string().describe("The help center ID to delete"),
  },
  async ({ help_center_id }) => {
    const mutation = `
      mutation DeleteHelpCenter($input: DeleteHelpCenterInput!) {
        deleteHelpCenter(input: $input) {
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({ query: mutation, variables: { input: { helpCenterId: help_center_id } } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.deleteHelpCenter?.error) {
      return { content: [{ type: "text", text: `Error: ${data.deleteHelpCenter.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Help center ${help_center_id} deleted successfully` }] };
  }
);

// Tool: update_help_center_custom_domain
server.tool(
  "update_help_center_custom_domain",
  "Set a custom domain for a help center",
  {
    help_center_id: z.string().describe("The help center ID"),
    custom_domain_name: z.string().nullable().describe("The custom domain name (e.g., 'help.example.com') or null to remove"),
  },
  async ({ help_center_id, custom_domain_name }) => {
    const mutation = `
      mutation UpdateHelpCenterCustomDomainName($input: UpdateHelpCenterCustomDomainNameInput!) {
        updateHelpCenterCustomDomainName(input: $input) {
          helpCenter {
            id
            customDomainName
          }
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { helpCenterId: help_center_id, customDomainName: custom_domain_name } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.updateHelpCenterCustomDomainName?.error) {
      return { content: [{ type: "text", text: `Error: ${data.updateHelpCenterCustomDomainName.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Custom domain updated to: ${custom_domain_name || "(removed)"}` }] };
  }
);

// Tool: verify_help_center_custom_domain
server.tool(
  "verify_help_center_custom_domain",
  "Verify DNS ownership of a custom domain for a help center",
  {
    help_center_id: z.string().describe("The help center ID"),
  },
  async ({ help_center_id }) => {
    const mutation = `
      mutation VerifyHelpCenterCustomDomainName($input: VerifyHelpCenterCustomDomainNameInput!) {
        verifyHelpCenterCustomDomainName(input: $input) {
          helpCenter {
            id
            customDomainName
          }
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { helpCenterId: help_center_id } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.verifyHelpCenterCustomDomainName?.error) {
      return { content: [{ type: "text", text: `Error: ${data.verifyHelpCenterCustomDomainName.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Custom domain verification successful` }] };
  }
);

// =============================================================================
// HELP CENTER ARTICLE TOOLS
// =============================================================================

// Tool: list_help_center_articles
server.tool(
  "list_help_center_articles",
  "List articles in a help center",
  {
    help_center_id: z.string().describe("The help center ID"),
    limit: z.number().min(1).max(100).optional().default(25).describe("Number of articles to return"),
  },
  async ({ help_center_id, limit }) => {
    const query = `
      query HelpCenterArticles($helpCenterId: ID!, $first: Int) {
        helpCenter(id: $helpCenterId) {
          id
          articles(first: $first) {
            edges {
              node {
                id
                title
                slug
                status
                createdAt { iso8601 }
                updatedAt { iso8601 }
              }
            }
          }
        }
      }
    `;

    const result = await plain.rawRequest({ query, variables: { helpCenterId: help_center_id, first: limit } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    const articles = data?.helpCenter?.articles?.edges?.map((e: any) => e.node) || [];

    return { content: [{ type: "text", text: JSON.stringify(articles, null, 2) }] };
  }
);

// Tool: get_help_center_article
server.tool(
  "get_help_center_article",
  "Get a specific help center article by ID",
  {
    article_id: z.string().describe("The article ID"),
  },
  async ({ article_id }) => {
    const query = `
      query HelpCenterArticle($id: ID!) {
        helpCenterArticle(id: $id) {
          id
          title
          slug
          status
          contentHtml
          createdAt { iso8601 }
          updatedAt { iso8601 }
          group {
            id
            name
          }
        }
      }
    `;

    const result = await plain.rawRequest({ query, variables: { id: article_id } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: JSON.stringify((result.data as any)?.helpCenterArticle, null, 2) }] };
  }
);

// Tool: get_help_center_article_by_slug
server.tool(
  "get_help_center_article_by_slug",
  "Get a help center article by its URL slug",
  {
    help_center_id: z.string().describe("The help center ID"),
    slug: z.string().describe("The article slug (URL-friendly identifier)"),
  },
  async ({ help_center_id, slug }) => {
    const query = `
      query HelpCenterArticleBySlug($helpCenterId: ID!, $slug: String!) {
        helpCenterArticleBySlug(helpCenterId: $helpCenterId, slug: $slug) {
          id
          title
          slug
          status
          contentHtml
          createdAt { iso8601 }
          updatedAt { iso8601 }
        }
      }
    `;

    const result = await plain.rawRequest({ query, variables: { helpCenterId: help_center_id, slug } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: JSON.stringify((result.data as any)?.helpCenterArticleBySlug, null, 2) }] };
  }
);

// Tool: upsert_help_center_article
server.tool(
  "upsert_help_center_article",
  "Create or update a help center article",
  {
    help_center_id: z.string().describe("The help center ID"),
    title: z.string().describe("Article title"),
    content_html: z.string().describe("Article content in HTML format"),
    description: z.string().describe("Article description/summary (required)"),
    slug: z.string().optional().describe("URL-friendly slug (auto-generated if not provided)"),
    status: z.enum(["DRAFT", "PUBLISHED"]).optional().default("DRAFT").describe("Article status"),
    article_id: z.string().optional().describe("Article ID to update (omit to create new)"),
    group_id: z.string().optional().describe("Article group ID to place article in"),
  },
  async ({ help_center_id, title, content_html, description, slug, status, article_id, group_id }) => {
    const mutation = `
      mutation UpsertHelpCenterArticle($input: UpsertHelpCenterArticleInput!) {
        upsertHelpCenterArticle(input: $input) {
          helpCenterArticle {
            id
            title
            slug
            status
          }
          error {
            message
            code
            fields { field message }
          }
        }
      }
    `;

    const input: any = {
      helpCenterId: help_center_id,
      title,
      contentHtml: content_html,
      description,
      status,
    };
    if (slug) input.slug = slug;
    if (article_id) input.helpCenterArticleId = article_id;
    if (group_id) input.helpCenterArticleGroupId = group_id;

    const result = await plain.rawRequest({ query: mutation, variables: { input } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.upsertHelpCenterArticle?.error) {
      const err = data.upsertHelpCenterArticle.error;
      return { content: [{ type: "text", text: `Error: ${err.message} (${JSON.stringify(err.fields)})` }], isError: true };
    }

    return { content: [{ type: "text", text: JSON.stringify(data?.upsertHelpCenterArticle?.helpCenterArticle, null, 2) }] };
  }
);

// Tool: delete_help_center_article
server.tool(
  "delete_help_center_article",
  "Delete a help center article",
  {
    article_id: z.string().describe("The article ID to delete"),
  },
  async ({ article_id }) => {
    const mutation = `
      mutation DeleteHelpCenterArticle($input: DeleteHelpCenterArticleInput!) {
        deleteHelpCenterArticle(input: $input) {
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { helpCenterArticleId: article_id } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.deleteHelpCenterArticle?.error) {
      return { content: [{ type: "text", text: `Error: ${data.deleteHelpCenterArticle.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Article ${article_id} deleted successfully` }] };
  }
);

// Tool: generate_help_center_article
server.tool(
  "generate_help_center_article",
  "Auto-generate a help center article from a support thread using AI",
  {
    thread_id: z.string().describe("The thread ID to generate article from"),
    help_center_id: z.string().describe("The help center ID to create the article in"),
  },
  async ({ thread_id, help_center_id }) => {
    const mutation = `
      mutation GenerateHelpCenterArticle($input: GenerateHelpCenterArticleInput!) {
        generateHelpCenterArticle(input: $input) {
          helpCenterArticles {
            id
            title
            slug
            status
          }
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { threadId: thread_id, helpCenterId: help_center_id } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.generateHelpCenterArticle?.error) {
      return { content: [{ type: "text", text: `Error: ${data.generateHelpCenterArticle.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: JSON.stringify(data?.generateHelpCenterArticle?.helpCenterArticles, null, 2) }] };
  }
);

// =============================================================================
// HELP CENTER ARTICLE GROUP TOOLS
// =============================================================================

// Tool: list_help_center_article_groups
server.tool(
  "list_help_center_article_groups",
  "List article groups (categories) in a help center",
  {
    help_center_id: z.string().describe("The help center ID"),
  },
  async ({ help_center_id }) => {
    const query = `
      query HelpCenterArticleGroups($helpCenterId: ID!) {
        helpCenter(id: $helpCenterId) {
          id
          articleGroups(first: 100) {
            edges {
              node {
                id
                name
                slug
                createdAt { iso8601 }
              }
            }
          }
        }
      }
    `;

    const result = await plain.rawRequest({ query, variables: { helpCenterId: help_center_id } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    const groups = data?.helpCenter?.articleGroups?.edges?.map((e: any) => e.node) || [];

    return { content: [{ type: "text", text: JSON.stringify(groups, null, 2) }] };
  }
);

// Tool: get_help_center_article_group
server.tool(
  "get_help_center_article_group",
  "Get a specific article group by ID",
  {
    group_id: z.string().describe("The article group ID"),
  },
  async ({ group_id }) => {
    const query = `
      query HelpCenterArticleGroup($id: ID!) {
        helpCenterArticleGroup(id: $id) {
          id
          name
          slug
          createdAt { iso8601 }
          articles(first: 50) {
            edges {
              node {
                id
                title
                slug
                status
              }
            }
          }
        }
      }
    `;

    const result = await plain.rawRequest({ query, variables: { id: group_id } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    const group = data?.helpCenterArticleGroup;
    if (group?.articles?.edges) {
      group.articles = group.articles.edges.map((e: any) => e.node);
    }

    return { content: [{ type: "text", text: JSON.stringify(group, null, 2) }] };
  }
);

// Tool: create_help_center_article_group
server.tool(
  "create_help_center_article_group",
  "Create a new article group (category) in a help center",
  {
    help_center_id: z.string().describe("The help center ID"),
    name: z.string().describe("Group name"),
    slug: z.string().optional().describe("URL-friendly slug (auto-generated if not provided)"),
    parent_id: z.string().optional().describe("Parent group ID for nested groups"),
  },
  async ({ help_center_id, name, slug, parent_id }) => {
    const mutation = `
      mutation CreateHelpCenterArticleGroup($input: CreateHelpCenterArticleGroupInput!) {
        createHelpCenterArticleGroup(input: $input) {
          articleGroup {
            id
            name
            slug
          }
          error {
            message
            code
          }
        }
      }
    `;

    const input: any = { helpCenterId: help_center_id, name };
    if (slug) input.slug = slug;
    if (parent_id) input.parentId = parent_id;

    const result = await plain.rawRequest({ query: mutation, variables: { input } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.createHelpCenterArticleGroup?.error) {
      return { content: [{ type: "text", text: `Error: ${data.createHelpCenterArticleGroup.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: JSON.stringify(data?.createHelpCenterArticleGroup?.articleGroup, null, 2) }] };
  }
);

// Tool: update_help_center_article_group
server.tool(
  "update_help_center_article_group",
  "Update an article group",
  {
    group_id: z.string().describe("The article group ID to update"),
    name: z.string().optional().describe("New group name"),
  },
  async ({ group_id, name }) => {
    const mutation = `
      mutation UpdateHelpCenterArticleGroup($input: UpdateHelpCenterArticleGroupInput!) {
        updateHelpCenterArticleGroup(input: $input) {
          articleGroup {
            id
            name
            slug
          }
          error {
            message
            code
          }
        }
      }
    `;

    const input: any = { groupId: group_id };
    if (name) input.name = name;

    const result = await plain.rawRequest({ query: mutation, variables: { input } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.updateHelpCenterArticleGroup?.error) {
      return { content: [{ type: "text", text: `Error: ${data.updateHelpCenterArticleGroup.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Article group ${group_id} updated successfully` }] };
  }
);

// Tool: delete_help_center_article_group
server.tool(
  "delete_help_center_article_group",
  "Delete an article group",
  {
    group_id: z.string().describe("The article group ID to delete"),
  },
  async ({ group_id }) => {
    const mutation = `
      mutation DeleteHelpCenterArticleGroup($input: DeleteHelpCenterArticleGroupInput!) {
        deleteHelpCenterArticleGroup(input: $input) {
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { groupId: group_id } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.deleteHelpCenterArticleGroup?.error) {
      return { content: [{ type: "text", text: `Error: ${data.deleteHelpCenterArticleGroup.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Article group ${group_id} deleted successfully` }] };
  }
);

// Tool: get_help_center_index
server.tool(
  "get_help_center_index",
  "Get the navigation index/structure of a help center",
  {
    help_center_id: z.string().describe("The help center ID"),
  },
  async ({ help_center_id }) => {
    const query = `
      query HelpCenterIndex($id: ID!) {
        helpCenterIndex(id: $id) {
          hash
          items {
            type
            id
          }
        }
      }
    `;

    const result = await plain.rawRequest({ query, variables: { id: help_center_id } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: JSON.stringify((result.data as any)?.helpCenterIndex, null, 2) }] };
  }
);

// Tool: update_help_center_index
server.tool(
  "update_help_center_index",
  "Update the navigation index/structure of a help center",
  {
    help_center_id: z.string().describe("The help center ID"),
    hash: z.string().describe("Current hash from get_help_center_index (for optimistic locking)"),
    index: z.array(z.object({
      type: z.enum(["ARTICLE", "ARTICLE_GROUP"]).describe("Item type"),
      id: z.string().describe("Item ID"),
    })).describe("Ordered list of index items"),
  },
  async ({ help_center_id, hash, index }) => {
    const mutation = `
      mutation UpdateHelpCenterIndex($input: UpdateHelpCenterIndexInput!) {
        updateHelpCenterIndex(input: $input) {
          helpCenterIndex {
            hash
          }
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { helpCenterId: help_center_id, hash, helpCenterIndex: index } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.updateHelpCenterIndex?.error) {
      return { content: [{ type: "text", text: `Error: ${data.updateHelpCenterIndex.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Help center index updated. New hash: ${data?.updateHelpCenterIndex?.helpCenterIndex?.hash}` }] };
  }
);

// =============================================================================
// KNOWLEDGE SOURCE TOOLS
// =============================================================================

// Tool: create_knowledge_source
server.tool(
  "create_knowledge_source",
  "Create a knowledge source for AI to reference",
  {
    name: z.string().describe("Name of the knowledge source"),
    url: z.string().describe("URL of the knowledge source"),
  },
  async ({ name, url }) => {
    const mutation = `
      mutation CreateKnowledgeSource($input: CreateKnowledgeSourceInput!) {
        createKnowledgeSource(input: $input) {
          knowledgeSource {
            id
            name
            url
          }
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { name, url } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.createKnowledgeSource?.error) {
      return { content: [{ type: "text", text: `Error: ${data.createKnowledgeSource.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: JSON.stringify(data?.createKnowledgeSource?.knowledgeSource, null, 2) }] };
  }
);

// Tool: delete_knowledge_source
server.tool(
  "delete_knowledge_source",
  "Delete a knowledge source",
  {
    knowledge_source_id: z.string().describe("The knowledge source ID to delete"),
  },
  async ({ knowledge_source_id }) => {
    const mutation = `
      mutation DeleteKnowledgeSource($input: DeleteKnowledgeSourceInput!) {
        deleteKnowledgeSource(input: $input) {
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { knowledgeSourceId: knowledge_source_id } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.deleteKnowledgeSource?.error) {
      return { content: [{ type: "text", text: `Error: ${data.deleteKnowledgeSource.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Knowledge source ${knowledge_source_id} deleted successfully` }] };
  }
);

// =============================================================================
// CUSTOMER MANAGEMENT TOOLS
// =============================================================================

// Tool: upsert_customer
server.tool(
  "upsert_customer",
  "Create or update a customer",
  {
    email: z.string().describe("Customer email address"),
    full_name: z.string().optional().describe("Customer full name"),
    short_name: z.string().optional().describe("Customer short/display name"),
    external_id: z.string().optional().describe("External system ID for the customer"),
  },
  async ({ email, full_name, short_name, external_id }) => {
    const identifier: any = { emailAddress: email };
    const input: any = { identifier };

    if (full_name) input.fullName = full_name;
    if (short_name) input.shortName = short_name;
    if (external_id) input.externalId = external_id;

    const result = await plain.upsertCustomer(input);

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
  }
);

// Tool: delete_customer
server.tool(
  "delete_customer",
  "Delete a customer",
  {
    customer_id: z.string().describe("The customer ID to delete"),
  },
  async ({ customer_id }) => {
    const mutation = `
      mutation DeleteCustomer($input: DeleteCustomerInput!) {
        deleteCustomer(input: $input) {
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { customerId: customer_id } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.deleteCustomer?.error) {
      return { content: [{ type: "text", text: `Error: ${data.deleteCustomer.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Customer ${customer_id} deleted successfully` }] };
  }
);

// Tool: mark_customer_as_spam
server.tool(
  "mark_customer_as_spam",
  "Mark a customer as spam",
  {
    customer_id: z.string().describe("The customer ID to mark as spam"),
  },
  async ({ customer_id }) => {
    const mutation = `
      mutation MarkCustomerAsSpam($input: MarkCustomerAsSpamInput!) {
        markCustomerAsSpam(input: $input) {
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { customerId: customer_id } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.markCustomerAsSpam?.error) {
      return { content: [{ type: "text", text: `Error: ${data.markCustomerAsSpam.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Customer ${customer_id} marked as spam` }] };
  }
);

// Tool: unmark_customer_as_spam
server.tool(
  "unmark_customer_as_spam",
  "Remove spam marking from a customer",
  {
    customer_id: z.string().describe("The customer ID to unmark as spam"),
  },
  async ({ customer_id }) => {
    const mutation = `
      mutation UnmarkCustomerAsSpam($input: UnmarkCustomerAsSpamInput!) {
        unmarkCustomerAsSpam(input: $input) {
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { customerId: customer_id } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.unmarkCustomerAsSpam?.error) {
      return { content: [{ type: "text", text: `Error: ${data.unmarkCustomerAsSpam.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Customer ${customer_id} unmarked as spam` }] };
  }
);

// Tool: get_customer
server.tool(
  "get_customer",
  "Get detailed customer information by ID",
  {
    customer_id: z.string().describe("The customer ID"),
  },
  async ({ customer_id }) => {
    const result = await plain.getCustomerById({ customerId: customer_id });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
  }
);

// Tool: create_customer_event
server.tool(
  "create_customer_event",
  "Create a custom event on a customer timeline",
  {
    customer_id: z.string().describe("The customer ID"),
    title: z.string().describe("Event title"),
    components: z.array(z.object({
      type: z.enum(["TEXT", "BADGE"]).describe("Component type"),
      text: z.string().describe("Component text content"),
    })).describe("Event components to display"),
  },
  async ({ customer_id, title, components }) => {
    const mutation = `
      mutation CreateCustomerEvent($input: CreateCustomerEventInput!) {
        createCustomerEvent(input: $input) {
          customerEvent {
            id
          }
          error {
            message
            code
          }
        }
      }
    `;

    const componentInputs = components.map(c => {
      if (c.type === "TEXT") {
        return { componentText: { text: c.text } };
      } else {
        return { componentBadge: { text: c.text } };
      }
    });

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { customerId: customer_id, title, components: componentInputs } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.createCustomerEvent?.error) {
      return { content: [{ type: "text", text: `Error: ${data.createCustomerEvent.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Customer event created: ${data?.createCustomerEvent?.customerEvent?.id}` }] };
  }
);

// =============================================================================
// ADDITIONAL THREAD TOOLS
// =============================================================================

// Tool: create_thread
server.tool(
  "create_thread",
  "Create a new support thread for a customer",
  {
    customer_id: z.string().describe("The customer ID"),
    title: z.string().describe("Thread title"),
    description: z.string().optional().describe("Thread description"),
    priority: z.number().min(0).max(3).optional().default(2).describe("Priority: 0=urgent, 1=high, 2=normal, 3=low"),
  },
  async ({ customer_id, title, description, priority }) => {
    const mutation = `
      mutation CreateThread($input: CreateThreadInput!) {
        createThread(input: $input) {
          thread {
            id
            title
            status
          }
          error {
            message
            code
          }
        }
      }
    `;

    const input: any = { customerId: customer_id, title, priority };
    if (description) input.description = description;

    const result = await plain.rawRequest({ query: mutation, variables: { input } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.createThread?.error) {
      return { content: [{ type: "text", text: `Error: ${data.createThread.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: JSON.stringify(data?.createThread?.thread, null, 2) }] };
  }
);

// Tool: assign_thread
server.tool(
  "assign_thread",
  "Assign a thread to a user",
  {
    thread_id: z.string().describe("The thread ID"),
    user_id: z.string().describe("The user ID to assign to"),
  },
  async ({ thread_id, user_id }) => {
    const result = await plain.assignThread({
      threadId: thread_id,
      userId: user_id,
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const assignee = result.data?.assignedTo;
    const assigneeName = assignee?.__typename === "User"
      ? (assignee.fullName || assignee.publicName)
      : assignee?.__typename === "MachineUser"
        ? assignee.fullName
        : "user";
    return { content: [{ type: "text", text: `Thread assigned to ${assigneeName}` }] };
  }
);

// Tool: unassign_thread
server.tool(
  "unassign_thread",
  "Remove assignment from a thread",
  {
    thread_id: z.string().describe("The thread ID"),
  },
  async ({ thread_id }) => {
    const result = await plain.unassignThread({
      threadId: thread_id,
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Thread ${thread_id} unassigned` }] };
  }
);

// Tool: change_thread_priority
server.tool(
  "change_thread_priority",
  "Change the priority of a thread",
  {
    thread_id: z.string().describe("The thread ID"),
    priority: z.number().min(0).max(3).describe("New priority: 0=urgent, 1=high, 2=normal, 3=low"),
  },
  async ({ thread_id, priority }) => {
    const mutation = `
      mutation ChangeThreadPriority($input: ChangeThreadPriorityInput!) {
        changeThreadPriority(input: $input) {
          thread {
            id
            priority
          }
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { threadId: thread_id, priority } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.changeThreadPriority?.error) {
      return { content: [{ type: "text", text: `Error: ${data.changeThreadPriority.error.message}` }], isError: true };
    }

    const priorityNames = ["urgent", "high", "normal", "low"];
    return { content: [{ type: "text", text: `Thread priority changed to ${priorityNames[priority]}` }] };
  }
);

// Tool: update_thread_title
server.tool(
  "update_thread_title",
  "Update the title of a thread",
  {
    thread_id: z.string().describe("The thread ID"),
    title: z.string().describe("New thread title"),
  },
  async ({ thread_id, title }) => {
    const mutation = `
      mutation UpdateThreadTitle($input: UpdateThreadTitleInput!) {
        updateThreadTitle(input: $input) {
          thread {
            id
            title
          }
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { threadId: thread_id, title } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.updateThreadTitle?.error) {
      return { content: [{ type: "text", text: `Error: ${data.updateThreadTitle.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Thread title updated to: ${title}` }] };
  }
);

// Tool: delete_thread
server.tool(
  "delete_thread",
  "Permanently delete a thread",
  {
    thread_id: z.string().describe("The thread ID to delete"),
  },
  async ({ thread_id }) => {
    const mutation = `
      mutation DeleteThread($input: DeleteThreadInput!) {
        deleteThread(input: $input) {
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { threadId: thread_id } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.deleteThread?.error) {
      return { content: [{ type: "text", text: `Error: ${data.deleteThread.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Thread ${thread_id} deleted permanently` }] };
  }
);

// Tool: create_thread_event
server.tool(
  "create_thread_event",
  "Create a custom event on a thread timeline",
  {
    thread_id: z.string().describe("The thread ID"),
    title: z.string().describe("Event title"),
    components: z.array(z.object({
      type: z.enum(["TEXT", "BADGE"]).describe("Component type"),
      text: z.string().describe("Component text content"),
    })).describe("Event components to display"),
  },
  async ({ thread_id, title, components }) => {
    const mutation = `
      mutation CreateThreadEvent($input: CreateThreadEventInput!) {
        createThreadEvent(input: $input) {
          threadEvent {
            id
          }
          error {
            message
            code
          }
        }
      }
    `;

    const componentInputs = components.map(c => {
      if (c.type === "TEXT") {
        return { componentText: { text: c.text } };
      } else {
        return { componentBadge: { text: c.text } };
      }
    });

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { threadId: thread_id, title, components: componentInputs } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.createThreadEvent?.error) {
      return { content: [{ type: "text", text: `Error: ${data.createThreadEvent.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Thread event created: ${data?.createThreadEvent?.threadEvent?.id}` }] };
  }
);

// =============================================================================
// LABEL TOOLS
// =============================================================================

// Tool: list_label_types
server.tool(
  "list_label_types",
  "List all available label types",
  {},
  async () => {
    const query = `
      query LabelTypes {
        labelTypes(first: 100) {
          edges {
            node {
              id
              name
              icon
              isArchived
            }
          }
        }
      }
    `;

    const result = await plain.rawRequest({ query, variables: {} });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    const labels = data?.labelTypes?.edges?.map((e: any) => e.node) || [];

    return { content: [{ type: "text", text: JSON.stringify(labels, null, 2) }] };
  }
);

// Tool: create_label_type
server.tool(
  "create_label_type",
  "Create a new label type",
  {
    name: z.string().describe("Label name"),
    icon: z.string().optional().describe("Label icon (emoji)"),
  },
  async ({ name, icon }) => {
    const mutation = `
      mutation CreateLabelType($input: CreateLabelTypeInput!) {
        createLabelType(input: $input) {
          labelType {
            id
            name
            icon
          }
          error {
            message
            code
          }
        }
      }
    `;

    const input: any = { name };
    if (icon) input.icon = icon;

    const result = await plain.rawRequest({ query: mutation, variables: { input } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.createLabelType?.error) {
      return { content: [{ type: "text", text: `Error: ${data.createLabelType.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: JSON.stringify(data?.createLabelType?.labelType, null, 2) }] };
  }
);

// Tool: add_labels_to_thread
server.tool(
  "add_labels_to_thread",
  "Add labels to a thread",
  {
    thread_id: z.string().describe("The thread ID"),
    label_type_ids: z.array(z.string()).describe("Label type IDs to add"),
  },
  async ({ thread_id, label_type_ids }) => {
    const result = await plain.addLabels({
      threadId: thread_id,
      labelTypeIds: label_type_ids,
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Labels added to thread ${thread_id}` }] };
  }
);

// Tool: remove_labels_from_thread
server.tool(
  "remove_labels_from_thread",
  "Remove labels from a thread",
  {
    thread_id: z.string().describe("The thread ID"),
    label_type_ids: z.array(z.string()).describe("Label type IDs to remove"),
  },
  async ({ thread_id, label_type_ids }) => {
    const mutation = `
      mutation RemoveLabels($input: RemoveLabelsInput!) {
        removeLabels(input: $input) {
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { threadId: thread_id, labelTypeIds: label_type_ids } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.removeLabels?.error) {
      return { content: [{ type: "text", text: `Error: ${data.removeLabels.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Labels removed from thread ${thread_id}` }] };
  }
);

// =============================================================================
// COMPANY & TENANT TOOLS
// =============================================================================

// Tool: upsert_company
server.tool(
  "upsert_company",
  "Create or update a company",
  {
    name: z.string().describe("Company name"),
    domain: z.string().optional().describe("Company domain (e.g., example.com)"),
    external_id: z.string().optional().describe("External system ID"),
  },
  async ({ name, domain, external_id }) => {
    const mutation = `
      mutation UpsertCompany($input: UpsertCompanyInput!) {
        upsertCompany(input: $input) {
          company {
            id
            name
            domainName
          }
          error {
            message
            code
          }
        }
      }
    `;

    const input: any = { name };
    if (domain) input.domainName = domain;
    if (external_id) input.externalId = external_id;

    const result = await plain.rawRequest({ query: mutation, variables: { input } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.upsertCompany?.error) {
      return { content: [{ type: "text", text: `Error: ${data.upsertCompany.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: JSON.stringify(data?.upsertCompany?.company, null, 2) }] };
  }
);

// Tool: delete_company
server.tool(
  "delete_company",
  "Delete a company",
  {
    company_id: z.string().describe("The company ID to delete"),
  },
  async ({ company_id }) => {
    const mutation = `
      mutation DeleteCompany($input: DeleteCompanyInput!) {
        deleteCompany(input: $input) {
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { companyId: company_id } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.deleteCompany?.error) {
      return { content: [{ type: "text", text: `Error: ${data.deleteCompany.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Company ${company_id} deleted successfully` }] };
  }
);

// Tool: upsert_tenant
server.tool(
  "upsert_tenant",
  "Create or update a tenant",
  {
    identifier: z.string().describe("Tenant identifier (unique)"),
    name: z.string().describe("Tenant name"),
    external_id: z.string().optional().describe("External system ID"),
  },
  async ({ identifier, name, external_id }) => {
    const mutation = `
      mutation UpsertTenant($input: UpsertTenantInput!) {
        upsertTenant(input: $input) {
          tenant {
            id
            identifier
            name
          }
          error {
            message
            code
          }
        }
      }
    `;

    const input: any = { identifier, name };
    if (external_id) input.externalId = external_id;

    const result = await plain.rawRequest({ query: mutation, variables: { input } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.upsertTenant?.error) {
      return { content: [{ type: "text", text: `Error: ${data.upsertTenant.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: JSON.stringify(data?.upsertTenant?.tenant, null, 2) }] };
  }
);

// Tool: delete_tenant
server.tool(
  "delete_tenant",
  "Delete a tenant",
  {
    tenant_id: z.string().describe("The tenant ID to delete"),
  },
  async ({ tenant_id }) => {
    const mutation = `
      mutation DeleteTenant($input: DeleteTenantInput!) {
        deleteTenant(input: $input) {
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { tenantId: tenant_id } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.deleteTenant?.error) {
      return { content: [{ type: "text", text: `Error: ${data.deleteTenant.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Tenant ${tenant_id} deleted successfully` }] };
  }
);

// =============================================================================
// SNIPPET TOOLS
// =============================================================================

// Tool: list_snippets
server.tool(
  "list_snippets",
  "List all snippets (canned responses)",
  {
    limit: z.number().min(1).max(100).optional().default(50).describe("Number of snippets to return"),
  },
  async ({ limit }) => {
    const query = `
      query Snippets($first: Int) {
        snippets(first: $first) {
          edges {
            node {
              id
              name
              text
              createdAt { iso8601 }
            }
          }
        }
      }
    `;

    const result = await plain.rawRequest({ query, variables: { first: limit } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    const snippets = data?.snippets?.edges?.map((e: any) => e.node) || [];

    return { content: [{ type: "text", text: JSON.stringify(snippets, null, 2) }] };
  }
);

// Tool: create_snippet
server.tool(
  "create_snippet",
  "Create a new snippet (canned response)",
  {
    name: z.string().describe("Snippet name/shortcut"),
    text: z.string().describe("Snippet text content"),
  },
  async ({ name, text }) => {
    const mutation = `
      mutation CreateSnippet($input: CreateSnippetInput!) {
        createSnippet(input: $input) {
          snippet {
            id
            name
            text
          }
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { name, text } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.createSnippet?.error) {
      return { content: [{ type: "text", text: `Error: ${data.createSnippet.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: JSON.stringify(data?.createSnippet?.snippet, null, 2) }] };
  }
);

// Tool: update_snippet
server.tool(
  "update_snippet",
  "Update an existing snippet",
  {
    snippet_id: z.string().describe("The snippet ID to update"),
    name: z.string().optional().describe("New snippet name"),
    text: z.string().optional().describe("New snippet text"),
  },
  async ({ snippet_id, name, text }) => {
    const mutation = `
      mutation UpdateSnippet($input: UpdateSnippetInput!) {
        updateSnippet(input: $input) {
          snippet {
            id
            name
            text
          }
          error {
            message
            code
          }
        }
      }
    `;

    const input: any = { snippetId: snippet_id };
    if (name) input.name = name;
    if (text) input.text = text;

    const result = await plain.rawRequest({ query: mutation, variables: { input } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.updateSnippet?.error) {
      return { content: [{ type: "text", text: `Error: ${data.updateSnippet.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Snippet ${snippet_id} updated successfully` }] };
  }
);

// Tool: delete_snippet
server.tool(
  "delete_snippet",
  "Delete a snippet",
  {
    snippet_id: z.string().describe("The snippet ID to delete"),
  },
  async ({ snippet_id }) => {
    const mutation = `
      mutation DeleteSnippet($input: DeleteSnippetInput!) {
        deleteSnippet(input: $input) {
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { snippetId: snippet_id } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.deleteSnippet?.error) {
      return { content: [{ type: "text", text: `Error: ${data.deleteSnippet.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Snippet ${snippet_id} deleted successfully` }] };
  }
);

// =============================================================================
// WEBHOOK TOOLS
// =============================================================================

// Tool: list_webhooks
server.tool(
  "list_webhooks",
  "List all webhook targets",
  {},
  async () => {
    const query = `
      query WebhookTargets {
        webhookTargets(first: 50) {
          edges {
            node {
              id
              url
              isEnabled
              eventSubscriptions {
                eventType
              }
              createdAt { iso8601 }
            }
          }
        }
      }
    `;

    const result = await plain.rawRequest({ query, variables: {} });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    const webhooks = data?.webhookTargets?.edges?.map((e: any) => ({
      ...e.node,
      eventSubscriptions: e.node.eventSubscriptions?.map((s: any) => s.eventType),
    })) || [];

    return { content: [{ type: "text", text: JSON.stringify(webhooks, null, 2) }] };
  }
);

// Tool: create_webhook
server.tool(
  "create_webhook",
  "Create a new webhook target",
  {
    url: z.string().describe("Webhook URL endpoint"),
    event_types: z.array(z.string()).describe("Event types to subscribe to (e.g., 'thread.created', 'thread.status_transitioned')"),
    is_enabled: z.boolean().optional().default(true).describe("Whether webhook is enabled"),
  },
  async ({ url, event_types, is_enabled }) => {
    const mutation = `
      mutation CreateWebhookTarget($input: CreateWebhookTargetInput!) {
        createWebhookTarget(input: $input) {
          webhookTarget {
            id
            url
            isEnabled
          }
          error {
            message
            code
          }
        }
      }
    `;

    const eventSubscriptions = event_types.map(eventType => ({ eventType }));

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { url, eventSubscriptions, isEnabled: is_enabled } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.createWebhookTarget?.error) {
      return { content: [{ type: "text", text: `Error: ${data.createWebhookTarget.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: JSON.stringify(data?.createWebhookTarget?.webhookTarget, null, 2) }] };
  }
);

// Tool: update_webhook
server.tool(
  "update_webhook",
  "Update a webhook target",
  {
    webhook_id: z.string().describe("The webhook target ID"),
    url: z.string().optional().describe("New webhook URL"),
    event_types: z.array(z.string()).optional().describe("New event types to subscribe to"),
    is_enabled: z.boolean().optional().describe("Whether webhook is enabled"),
  },
  async ({ webhook_id, url, event_types, is_enabled }) => {
    const mutation = `
      mutation UpdateWebhookTarget($input: UpdateWebhookTargetInput!) {
        updateWebhookTarget(input: $input) {
          webhookTarget {
            id
            url
            isEnabled
          }
          error {
            message
            code
          }
        }
      }
    `;

    const input: any = { webhookTargetId: webhook_id };
    if (url) input.url = url;
    if (event_types) input.eventSubscriptions = event_types.map(eventType => ({ eventType }));
    if (is_enabled !== undefined) input.isEnabled = is_enabled;

    const result = await plain.rawRequest({ query: mutation, variables: { input } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.updateWebhookTarget?.error) {
      return { content: [{ type: "text", text: `Error: ${data.updateWebhookTarget.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Webhook ${webhook_id} updated successfully` }] };
  }
);

// Tool: delete_webhook
server.tool(
  "delete_webhook",
  "Delete a webhook target",
  {
    webhook_id: z.string().describe("The webhook target ID to delete"),
  },
  async ({ webhook_id }) => {
    const mutation = `
      mutation DeleteWebhookTarget($input: DeleteWebhookTargetInput!) {
        deleteWebhookTarget(input: $input) {
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { webhookTargetId: webhook_id } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.deleteWebhookTarget?.error) {
      return { content: [{ type: "text", text: `Error: ${data.deleteWebhookTarget.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Webhook ${webhook_id} deleted successfully` }] };
  }
);

// =============================================================================
// USER & WORKSPACE TOOLS
// =============================================================================

// Tool: list_users
server.tool(
  "list_users",
  "List workspace users",
  {
    limit: z.number().min(1).max(100).optional().default(50).describe("Number of users to return"),
  },
  async ({ limit }) => {
    const query = `
      query Users($first: Int) {
        users(first: $first) {
          edges {
            node {
              id
              fullName
              publicName
              email
              status
              createdAt { iso8601 }
            }
          }
        }
      }
    `;

    const result = await plain.rawRequest({ query, variables: { first: limit } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    const users = data?.users?.edges?.map((e: any) => e.node) || [];

    return { content: [{ type: "text", text: JSON.stringify(users, null, 2) }] };
  }
);

// Tool: get_workspace
server.tool(
  "get_workspace",
  "Get current workspace information",
  {},
  async () => {
    const query = `
      query Workspace {
        workspace {
          id
          name
          publicName
          createdAt { iso8601 }
        }
      }
    `;

    const result = await plain.rawRequest({ query, variables: {} });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: JSON.stringify((result.data as any)?.workspace, null, 2) }] };
  }
);

// =============================================================================
// MESSAGING TOOLS
// =============================================================================

// Tool: send_email
server.tool(
  "send_email",
  "Send a new email to a customer (starts a new thread)",
  {
    customer_id: z.string().describe("The customer ID"),
    subject: z.string().describe("Email subject"),
    text_content: z.string().describe("Plain text email content"),
    html_content: z.string().optional().describe("HTML email content"),
  },
  async ({ customer_id, subject, text_content, html_content }) => {
    const mutation = `
      mutation SendNewEmail($input: SendNewEmailInput!) {
        sendNewEmail(input: $input) {
          thread {
            id
            title
          }
          error {
            message
            code
          }
        }
      }
    `;

    const input: any = {
      customerId: customer_id,
      subject,
      textContent: text_content,
    };
    if (html_content) input.htmlContent = html_content;

    const result = await plain.rawRequest({ query: mutation, variables: { input } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.sendNewEmail?.error) {
      return { content: [{ type: "text", text: `Error: ${data.sendNewEmail.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Email sent. Thread: ${JSON.stringify(data?.sendNewEmail?.thread, null, 2)}` }] };
  }
);

// Tool: send_chat
server.tool(
  "send_chat",
  "Send a chat message to a customer",
  {
    customer_id: z.string().describe("The customer ID"),
    text: z.string().describe("Chat message text"),
  },
  async ({ customer_id, text }) => {
    const mutation = `
      mutation SendChat($input: SendChatInput!) {
        sendChat(input: $input) {
          thread {
            id
          }
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { customerId: customer_id, text } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.sendChat?.error) {
      return { content: [{ type: "text", text: `Error: ${data.sendChat.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Chat sent. Thread ID: ${data?.sendChat?.thread?.id}` }] };
  }
);

// =============================================================================
// AUTORESPONDER TOOLS
// =============================================================================

// Tool: list_autoresponders
server.tool(
  "list_autoresponders",
  "List all autoresponders",
  {},
  async () => {
    const query = `
      query Autoresponders {
        autoresponders(first: 50) {
          edges {
            node {
              id
              name
              isEnabled
              createdAt { iso8601 }
            }
          }
        }
      }
    `;

    const result = await plain.rawRequest({ query, variables: {} });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    const autoresponders = data?.autoresponders?.edges?.map((e: any) => e.node) || [];

    return { content: [{ type: "text", text: JSON.stringify(autoresponders, null, 2) }] };
  }
);

// Tool: create_autoresponder
server.tool(
  "create_autoresponder",
  "Create a new autoresponder",
  {
    name: z.string().describe("Autoresponder name"),
    text_content: z.string().describe("Autoresponder message text"),
    markdown_content: z.string().optional().describe("Markdown version of the message"),
    is_enabled: z.boolean().optional().default(true).describe("Whether autoresponder is enabled"),
  },
  async ({ name, text_content, markdown_content, is_enabled }) => {
    const mutation = `
      mutation CreateAutoresponder($input: CreateAutoresponderInput!) {
        createAutoresponder(input: $input) {
          autoresponder {
            id
            name
            isEnabled
          }
          error {
            message
            code
          }
        }
      }
    `;

    const input: any = { name, textContent: text_content, isEnabled: is_enabled };
    if (markdown_content) input.markdownContent = markdown_content;

    const result = await plain.rawRequest({ query: mutation, variables: { input } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.createAutoresponder?.error) {
      return { content: [{ type: "text", text: `Error: ${data.createAutoresponder.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: JSON.stringify(data?.createAutoresponder?.autoresponder, null, 2) }] };
  }
);

// Tool: delete_autoresponder
server.tool(
  "delete_autoresponder",
  "Delete an autoresponder",
  {
    autoresponder_id: z.string().describe("The autoresponder ID to delete"),
  },
  async ({ autoresponder_id }) => {
    const mutation = `
      mutation DeleteAutoresponder($input: DeleteAutoresponderInput!) {
        deleteAutoresponder(input: $input) {
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { autoresponderId: autoresponder_id } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.deleteAutoresponder?.error) {
      return { content: [{ type: "text", text: `Error: ${data.deleteAutoresponder.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Autoresponder ${autoresponder_id} deleted successfully` }] };
  }
);

// =============================================================================
// TIER & SLA TOOLS
// =============================================================================

// Tool: list_tiers
server.tool(
  "list_tiers",
  "List all support tiers",
  {},
  async () => {
    const query = `
      query Tiers {
        tiers(first: 50) {
          edges {
            node {
              id
              name
              color
              createdAt { iso8601 }
            }
          }
        }
      }
    `;

    const result = await plain.rawRequest({ query, variables: {} });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    const tiers = data?.tiers?.edges?.map((e: any) => e.node) || [];

    return { content: [{ type: "text", text: JSON.stringify(tiers, null, 2) }] };
  }
);

// Tool: create_tier
server.tool(
  "create_tier",
  "Create a new support tier",
  {
    name: z.string().describe("Tier name"),
    color: z.string().optional().describe("Tier color (hex code)"),
  },
  async ({ name, color }) => {
    const mutation = `
      mutation CreateTier($input: CreateTierInput!) {
        createTier(input: $input) {
          tier {
            id
            name
            color
          }
          error {
            message
            code
          }
        }
      }
    `;

    const input: any = { name };
    if (color) input.color = color;

    const result = await plain.rawRequest({ query: mutation, variables: { input } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.createTier?.error) {
      return { content: [{ type: "text", text: `Error: ${data.createTier.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: JSON.stringify(data?.createTier?.tier, null, 2) }] };
  }
);

// Tool: delete_tier
server.tool(
  "delete_tier",
  "Delete a support tier",
  {
    tier_id: z.string().describe("The tier ID to delete"),
  },
  async ({ tier_id }) => {
    const mutation = `
      mutation DeleteTier($input: DeleteTierInput!) {
        deleteTier(input: $input) {
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { tierId: tier_id } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.deleteTier?.error) {
      return { content: [{ type: "text", text: `Error: ${data.deleteTier.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Tier ${tier_id} deleted successfully` }] };
  }
);

// =============================================================================
// CUSTOMER GROUP TOOLS
// =============================================================================

// Tool: list_customer_groups
server.tool(
  "list_customer_groups",
  "List all customer groups",
  {
    limit: z.number().min(1).max(100).optional().default(50).describe("Number of groups to return"),
  },
  async ({ limit }) => {
    const query = `
      query CustomerGroups($first: Int) {
        customerGroups(first: $first) {
          edges {
            node {
              id
              name
              key
              color
              createdAt { iso8601 }
            }
          }
        }
      }
    `;

    const result = await plain.rawRequest({ query, variables: { first: limit } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    const groups = data?.customerGroups?.edges?.map((e: any) => e.node) || [];

    return { content: [{ type: "text", text: JSON.stringify(groups, null, 2) }] };
  }
);

// Tool: create_customer_group
server.tool(
  "create_customer_group",
  "Create a new customer group",
  {
    name: z.string().describe("Group name"),
    key: z.string().describe("Unique group key"),
    color: z.string().optional().describe("Group color (hex code)"),
  },
  async ({ name, key, color }) => {
    const mutation = `
      mutation CreateCustomerGroup($input: CreateCustomerGroupInput!) {
        createCustomerGroup(input: $input) {
          customerGroup {
            id
            name
            key
            color
          }
          error {
            message
            code
          }
        }
      }
    `;

    const input: any = { name, key };
    if (color) input.color = color;

    const result = await plain.rawRequest({ query: mutation, variables: { input } });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.createCustomerGroup?.error) {
      return { content: [{ type: "text", text: `Error: ${data.createCustomerGroup.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: JSON.stringify(data?.createCustomerGroup?.customerGroup, null, 2) }] };
  }
);

// Tool: add_customer_to_groups
server.tool(
  "add_customer_to_groups",
  "Add a customer to one or more groups",
  {
    customer_id: z.string().describe("The customer ID"),
    group_ids: z.array(z.string()).describe("Customer group IDs to add customer to"),
  },
  async ({ customer_id, group_ids }) => {
    const mutation = `
      mutation AddCustomerToCustomerGroups($input: AddCustomerToCustomerGroupsInput!) {
        addCustomerToCustomerGroups(input: $input) {
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { customerId: customer_id, customerGroupIds: group_ids } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.addCustomerToCustomerGroups?.error) {
      return { content: [{ type: "text", text: `Error: ${data.addCustomerToCustomerGroups.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Customer added to ${group_ids.length} group(s)` }] };
  }
);

// Tool: remove_customer_from_groups
server.tool(
  "remove_customer_from_groups",
  "Remove a customer from one or more groups",
  {
    customer_id: z.string().describe("The customer ID"),
    group_ids: z.array(z.string()).describe("Customer group IDs to remove customer from"),
  },
  async ({ customer_id, group_ids }) => {
    const mutation = `
      mutation RemoveCustomerFromCustomerGroups($input: RemoveCustomerFromCustomerGroupsInput!) {
        removeCustomerFromCustomerGroups(input: $input) {
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { customerId: customer_id, customerGroupIds: group_ids } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.removeCustomerFromCustomerGroups?.error) {
      return { content: [{ type: "text", text: `Error: ${data.removeCustomerFromCustomerGroups.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Customer removed from ${group_ids.length} group(s)` }] };
  }
);

// =============================================================================
// THREAD FIELD TOOLS
// =============================================================================

// Tool: list_thread_field_schemas
server.tool(
  "list_thread_field_schemas",
  "List all custom thread field schemas",
  {},
  async () => {
    const query = `
      query ThreadFieldSchemas {
        threadFieldSchemas(first: 100) {
          edges {
            node {
              id
              key
              label
              type
              isRequired
            }
          }
        }
      }
    `;

    const result = await plain.rawRequest({ query, variables: {} });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    const schemas = data?.threadFieldSchemas?.edges?.map((e: any) => e.node) || [];

    return { content: [{ type: "text", text: JSON.stringify(schemas, null, 2) }] };
  }
);

// Tool: upsert_thread_field
server.tool(
  "upsert_thread_field",
  "Set a custom field value on a thread",
  {
    thread_id: z.string().describe("The thread ID"),
    key: z.string().describe("Field key (must match a thread field schema key)"),
    value: z.string().describe("Field value"),
  },
  async ({ thread_id, key, value }) => {
    const mutation = `
      mutation UpsertThreadField($input: UpsertThreadFieldInput!) {
        upsertThreadField(input: $input) {
          threadField {
            key
            value
          }
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { threadId: thread_id, key, stringValue: value } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.upsertThreadField?.error) {
      return { content: [{ type: "text", text: `Error: ${data.upsertThreadField.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Thread field '${key}' set to '${value}'` }] };
  }
);

// =============================================================================
// DELETE NOTE TOOL
// =============================================================================

// Tool: delete_note
server.tool(
  "delete_note",
  "Delete an internal note from a thread",
  {
    note_id: z.string().describe("The note ID to delete"),
  },
  async ({ note_id }) => {
    const mutation = `
      mutation DeleteNote($input: DeleteNoteInput!) {
        deleteNote(input: $input) {
          error {
            message
            code
          }
        }
      }
    `;

    const result = await plain.rawRequest({
      query: mutation,
      variables: { input: { noteId: note_id } },
    });

    if (result.error) {
      return { content: [{ type: "text", text: `Error: ${result.error.message}` }], isError: true };
    }

    const data = result.data as any;
    if (data?.deleteNote?.error) {
      return { content: [{ type: "text", text: `Error: ${data.deleteNote.error.message}` }], isError: true };
    }

    return { content: [{ type: "text", text: `Note ${note_id} deleted successfully` }] };
  }
);

// =============================================================================
// ORIGINAL THREAD TOOLS (from v1)
// =============================================================================

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

// Tool: change_thread_status_to_todo
server.tool(
  "change_thread_status_to_todo",
  "Change thread status to Todo with optional status detail. Use this instead of mark_thread_todo when you need to set a specific status detail.",
  {
    thread_id: z.string().describe("The thread ID"),
    status_detail: z
      .enum([
        "CREATED",
        "IN_PROGRESS",
        "NEW_REPLY",
        "THREAD_LINK_UPDATED",
        "THREAD_DISCUSSION_RESOLVED",
      ])
      .optional()
      .describe(
        "Status detail: CREATED (Needs first response), IN_PROGRESS (Investigating), NEW_REPLY (Needs next response), THREAD_LINK_UPDATED (Close the loop), THREAD_DISCUSSION_RESOLVED (Discussion resolved)"
      ),
  },
  async ({ thread_id, status_detail }) => {
    const result = await plain.markThreadAsTodo({
      threadId: thread_id,
      statusDetail: status_detail as TodoStatusDetail | undefined,
    });

    if (result.error) {
      return {
        content: [{ type: "text", text: `Error: ${result.error.message}` }],
        isError: true,
      };
    }

    const statusMsg = status_detail ? ` with status detail: ${status_detail}` : "";
    return {
      content: [
        {
          type: "text",
          text: `Thread ${thread_id} changed to Todo${statusMsg}`,
        },
      ],
    };
  }
);

// Tool: snooze_thread
server.tool(
  "snooze_thread",
  "Snooze a support thread. Use WAITING_FOR_CUSTOMER (no duration) to snooze until customer replies, or WAITING_FOR_DURATION with duration_seconds for time-based snooze.",
  {
    thread_id: z.string().describe("The thread ID to snooze"),
    duration_seconds: z
      .number()
      .min(60)
      .max(5184000) // max 60 days per Plain API
      .nullish()
      .describe("Duration to snooze in seconds. Required for WAITING_FOR_DURATION, omit for WAITING_FOR_CUSTOMER."),
    status_detail: z
      .enum(["WAITING_FOR_CUSTOMER", "WAITING_FOR_DURATION"])
      .describe(
        "WAITING_FOR_CUSTOMER: snooze until customer replies (no duration). WAITING_FOR_DURATION: snooze for specified duration."
      ),
  },
  async ({ thread_id, duration_seconds, status_detail }) => {
    // WAITING_FOR_CUSTOMER cannot have duration, WAITING_FOR_DURATION requires it
    const snoozeInput: {
      threadId: string;
      statusDetail: SnoozeStatusDetail;
      durationSeconds?: number;
    } = {
      threadId: thread_id,
      statusDetail: status_detail as SnoozeStatusDetail,
    };

    if (status_detail === "WAITING_FOR_DURATION") {
      if (!duration_seconds) {
        return {
          content: [{ type: "text", text: "Error: duration_seconds is required when using WAITING_FOR_DURATION" }],
          isError: true,
        };
      }
      snoozeInput.durationSeconds = duration_seconds;
    }

    const result = await plain.snoozeThread(snoozeInput);

    if (result.error) {
      const details = (result.error as any).errorDetails;
      let errorMsg = `Error: ${result.error.message}`;
      if (details?.fields && details.fields.length > 0) {
        const fieldErrors = details.fields
          .map((f: { field: string; message: string }) => `${f.field}: ${f.message}`)
          .join(", ");
        errorMsg += ` (${fieldErrors})`;
      }
      return {
        content: [{ type: "text", text: errorMsg }],
        isError: true,
      };
    }

    const statusMsg = status_detail === "WAITING_FOR_CUSTOMER"
      ? "until customer replies"
      : `for ${Math.round((duration_seconds || 0) / 3600)} hour(s)`;
    return {
      content: [
        {
          type: "text",
          text: `Thread ${thread_id} snoozed ${statusMsg}`,
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
