import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import axios from "axios";

const MEETGEEK_BASE_URL = process.env.MEETGEEK_BASE_URL || "https://api.meetgeek.ai";

function getApiToken(): string {
  const token = process.env.MEETGEEK_API_KEY;
  if (!token) throw new Error("MEETGEEK_API_KEY environment variable is required");
  return token;
}

function createMeetgeekClient(token: string) {
  return axios.create({
    baseURL: MEETGEEK_BASE_URL,
    headers: {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
    },
  });
}

function createServer() {
  const server = new McpServer({
    name: "MeetgeekMCP",
    version: "1.0.0",
    description: "MCP server for MeetGeek AI meeting assistant",
  });

  server.tool(
    "list_meetings",
    "List recent meetings from MeetGeek",
    {
      limit: z.number().optional().describe("Number of meetings to return (default 10)"),
      offset: z.number().optional().describe("Offset for pagination"),
    },
    async ({ limit = 10, offset = 0 }: any) => {
      const token = getApiToken();
      const client = createMeetgeekClient(token);
      const response = await client.get("/v1/meetings/", { params: { limit, offset } });
      return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
    }
  );

  server.tool(
    "get_meeting",
    "Get details of a specific meeting",
    {
      meeting_id: z.string().describe("The meeting ID"),
    },
    async ({ meeting_id }: any) => {
      const token = getApiToken();
      const client = createMeetgeekClient(token);
      const response = await client.get(`/v1/meetings/${meeting_id}/`);
      return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
    }
  );

  server.tool(
    "get_meeting_transcript",
    "Get the transcript of a meeting",
    {
      meeting_id: z.string().describe("The meeting ID"),
    },
    async ({ meeting_id }: any) => {
      const token = getApiToken();
      const client = createMeetgeekClient(token);
      const response = await client.get(`/v1/meetings/${meeting_id}/transcript/`);
      return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
    }
  );

  server.tool(
    "get_meeting_summary",
    "Get the AI summary and key points of a meeting",
    {
      meeting_id: z.string().describe("The meeting ID"),
    },
    async ({ meeting_id }: any) => {
      const token = getApiToken();
      const client = createMeetgeekClient(token);
      const response = await client.get(`/v1/meetings/${meeting_id}/summary/`);
      return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
    }
  );

  server.tool(
    "search_meetings",
    "Search meetings by keyword",
    {
      query: z.string().describe("Search query"),
      limit: z.number().optional().describe("Number of results"),
    },
    async ({ query, limit = 10 }: any) => {
      const token = getApiToken();
      const client = createMeetgeekClient(token);
      const response = await client.get("/v1/meetings/search/", { params: { q: query, limit } });
      return { content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }] };
    }
  );

  return server;
}

const transports: Record<string, SSEServerTransport> = {};

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const url = new URL(req.url!, `http://${req.headers.host}`);

  if (url.pathname === "/sse" || url.pathname === "/") {
    console.log("New SSE connection attempt");
    const transport = new SSEServerTransport("/messages", res);
    const sessionId = transport.sessionId;
    transports[sessionId] = transport;
    
    const server = createServer();
    await server.connect(transport);
    
    console.log(`SSE connection established for session: ${sessionId}`);
    
    req.on("close", () => {
      console.log(`SSE connection closed for session: ${sessionId}`);
      delete transports[sessionId];
    });
  } else if (url.pathname === "/messages") {
    const sessionId = url.searchParams.get("sessionId");
    console.log(`Message received for session: ${sessionId}`);
    
    if (!sessionId || !transports[sessionId]) {
      console.error(`Invalid or missing sessionId: ${sessionId}`);
      res.status(400).json({ error: "Invalid or missing sessionId" });
      return;
    }
    
    try {
      await transports[sessionId].handlePostMessage(req, res);
      console.log(`Message handled for session: ${sessionId}`);
    } catch (error) {
      console.error(`Error handling message for session ${sessionId}:`, error);
      res.status(500).json({ error: "Internal server error handling message" });
    }
  } else {
    res.status(200).json({
      name: "meetgeek-mcp-server",
      version: "1.0.0",
      description: "MeetGeek MCP server - connect via /sse",
      endpoints: { sse: "/sse", messages: "/messages" }
    });
  }
}
