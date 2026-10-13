import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readdir } from "node:fs/promises";
import { config } from "../config.ts";
import { OpenAICompatClient } from "../model_client/openaiCompatClient.ts";
import { PromptBuilder } from "../prompt_builder/promptBuilder.ts";
import { SessionMemory } from "../memory/sessionMemory.ts";
import { ToolRegistry } from "../tool_registry/toolRegistry.ts";
import { createAgent, listAgentModes } from "../agents/agentFactory.ts";
import { defaultSkillRoots, setActiveSkillRegistry, SkillRegistry } from "../skill_registry/skillRegistry.ts";
import type { AgentContext, AgentMode, LLMResponse, Message, Tool } from "../types.ts";

const port = Number.parseInt(process.env.MYAGENT_API_PORT ?? "8787", 10);

function isTool(value: unknown): value is Tool {
  if (!value || typeof value !== "object") return false;
  const tool = value as Partial<Tool>;
  return typeof tool.name === "string" && typeof tool.description === "string"
    && typeof tool.run === "function" && !!tool.schema;
}

async function registerTools(registry: ToolRegistry): Promise<void> {
  const toolsDirectory = new URL("../tools/", import.meta.url);
  const entries = await readdir(toolsDirectory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(ts|js)$/.test(entry.name) || entry.name.endsWith(".d.ts")) continue;
    const module = await import(new URL(entry.name, toolsDirectory).href);
    for (const exportedValue of Object.values(module)) {
      if (isTool(exportedValue)) registry.register(exportedValue);
    }
  }
}

function demoModel(): AgentContext["model"] {
  return {
    async chat(messages) {
      const lastUser = [...messages].reverse().find((message) => message.role === "user");
      const prompt = lastUser?.content?.trim() || "你的消息";
      return { content: `这是演示模式回复：我收到了“${prompt}”。配置 OPENAI_API_KEY 后即可连接真实模型。` } satisfies LLMResponse;
    },
  };
}

type AgentSession = {
  run: (message: string) => Promise<string>;
  history: () => Array<Pick<Message, "role" | "content">>;
  list: () => SessionSummary[];
  activeId: () => number | null;
  select: (conversationId: number | null) => void;
};

type SessionSummary = {
  id: number;
  previousId: number | null;
  title: string;
};

function createSessionTitle(userInput: string): string {
  const firstLine = userInput.replace(/\s+/g, " ").trim();
  if (!firstLine) return "Untitled task";
  return firstLine.length > 42 ? `${firstLine.slice(0, 42).trimEnd()}…` : firstLine;
}

async function createSession(mode: AgentMode): Promise<AgentSession> {
  const registry = new ToolRegistry();
  await registerTools(registry);
  const skills = new SkillRegistry(defaultSkillRoots());
  await skills.load();
  setActiveSkillRegistry(skills);
  const promptBuilder = new PromptBuilder(config.systemPrompt, skills.buildPromptContext() || undefined);
  const memory = new SessionMemory(promptBuilder.build(), {
    persistenceFilePath: `.myagent/sessions/web-${mode}.jsonl`,
  });
  const model = config.apiKey
    ? new OpenAICompatClient(config.apiKey, config.baseUrl, config.model, undefined, undefined, config.contextWindowTokens)
    : demoModel();
  const agent = createAgent(mode);
  let queue = Promise.resolve();

  return {
    run(message: string) {
      const task = queue.then(async () => {
        const answer = await agent.run({ userInput: message, model, tools: registry, memory, promptBuilder });
        await memory.flush();
        return answer;
      });
      queue = task.then(() => undefined, () => undefined);
      return task;
    },
    history() {
      return memory.getHistory()
        .slice(1)
        .filter((message): message is Message & { content: string } =>
          (message.role === "user" || message.role === "assistant")
          && typeof message.content === "string"
          && message.content.trim().length > 0,
        )
        .map(({ role, content }) => ({ role, content }));
    },
    list() {
      return memory.getConversations().map(({ id, previousId, userInput }) => ({
        id,
        previousId,
        title: createSessionTitle(userInput),
      }));
    },
    activeId() {
      return memory.getActiveConversationId();
    },
    select(conversationId) {
      memory.selectConversation(conversationId);
    },
  };
}

const sessions = new Map<string, Promise<AgentSession>>();
function getSession(mode: string): Promise<AgentSession> {
  const selectedMode = listAgentModes().includes(mode) ? mode : config.agentMode;
  let session = sessions.get(selectedMode);
  if (!session) {
    session = createSession(selectedMode);
    sessions.set(selectedMode, session);
  }
  return session;
}

function sendJson(response: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" });
  response.end(body);
}

function sessionState(mode: string, session: AgentSession) {
  return {
    mode,
    activeId: session.activeId(),
    sessions: session.list(),
    messages: session.history(),
  };
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new Error("Request body too large.");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") {
      response.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" });
      response.end();
      return;
    }
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "GET" && requestUrl.pathname === "/api/health") {
      sendJson(response, 200, { ok: true, demo: !config.apiKey, model: config.model, modes: listAgentModes() });
      return;
    }
    if (request.method === "GET" && requestUrl.pathname === "/api/history") {
      const mode = requestUrl.searchParams.get("mode") ?? config.agentMode;
      const session = await getSession(mode);
      sendJson(response, 200, { mode, messages: session.history() });
      return;
    }
    if (request.method === "GET" && requestUrl.pathname === "/api/sessions") {
      const mode = requestUrl.searchParams.get("mode") ?? config.agentMode;
      const session = await getSession(mode);
      sendJson(response, 200, sessionState(mode, session));
      return;
    }
    if (request.method === "POST" && requestUrl.pathname === "/api/sessions/select") {
      const body = JSON.parse(await readBody(request)) as {
        mode?: unknown;
        conversationId?: unknown;
      };
      const mode = typeof body.mode === "string" ? body.mode : config.agentMode;
      const conversationId = body.conversationId === null || body.conversationId === undefined
        ? null
        : body.conversationId;
      if (conversationId !== null && (typeof conversationId !== "number" || !Number.isInteger(conversationId) || conversationId < 1)) {
        sendJson(response, 400, { error: "conversationId must be a positive integer or null" });
        return;
      }
      const session = await getSession(mode);
      session.select(conversationId as number | null);
      sendJson(response, 200, sessionState(mode, session));
      return;
    }
    if (request.method === "POST" && requestUrl.pathname === "/api/chat") {
      const body = JSON.parse(await readBody(request)) as { message?: unknown; mode?: unknown };
      if (typeof body.message !== "string" || !body.message.trim()) {
        sendJson(response, 400, { error: "message must be a non-empty string" });
        return;
      }
      const mode = typeof body.mode === "string" ? body.mode : config.agentMode;
      const reply = await (await getSession(mode)).run(body.message);
      sendJson(response, 200, { reply, demo: !config.apiKey });
      return;
    }
    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    sendJson(response, 500, { error: message });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`MyAgent API listening at http://127.0.0.1:${port}`);
  console.log(config.apiKey ? "Model mode: configured" : "Model mode: demo (set OPENAI_API_KEY for a real model)");
});
