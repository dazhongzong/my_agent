import { config, type AgentMode } from "../config.ts";
import { OpenAICompatClient } from "../model_client/openaiCompatClient.ts";
import { PromptBuilder } from "../prompt_builder/promptBuilder.ts";
import { SessionMemory } from "../memory/sessionMemory.ts";
import { ToolRegistry } from "../tool_registry/toolRegistry.ts";
import { createAgent } from "../agents/agentFactory.ts";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readdir } from "node:fs/promises";
import type { Tool } from "../types.ts";

function isTool(value: unknown): value is Tool {
  if (!value || typeof value !== "object") {
    return false;
  }

  const tool = value as Partial<Tool>;
  return typeof tool.name === "string"
    && typeof tool.description === "string"
    && typeof tool.run === "function"
    && !!tool.schema;
}

async function registerTools(registry: ToolRegistry): Promise<void> {
  const toolsDirectory = new URL("../tools/", import.meta.url);
  const entries = await readdir(toolsDirectory, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !/\.(ts|js)$/.test(entry.name) || entry.name.endsWith(".d.ts")) {
      continue;
    }

    const module = await import(new URL(entry.name, toolsDirectory).href);
    for (const exportedValue of Object.values(module)) {
      if (isTool(exportedValue)) {
        registry.register(exportedValue);
        console.log(`已注册工具: ${exportedValue.name}`);
      }
    }
  }
}

export async function runCli(): Promise<void> {
  if (!config.apiKey) {
    throw new Error("Missing OPENAI_API_KEY in environment variables.");
  }

  const args = process.argv.slice(2);
  const modeArg = args.find((arg) => arg.startsWith("--mode="));
  const mode = (modeArg ? modeArg.split("=")[1] : config.agentMode) as AgentMode;
  const userInput = args.filter((arg) => !arg.startsWith("--mode=")).join(" ");

  const registry = new ToolRegistry();
  await registerTools(registry);

  const client = new OpenAICompatClient(
    config.apiKey,
    config.baseUrl,
    config.model,
    (thinking) => {
      process.stdout.write(thinking);
    },
    (content) => {
      process.stdout.write(content);
    },
  );
  const promptBuilder = new PromptBuilder(config.systemPrompt);
  const memory = new SessionMemory(config.systemPrompt);
  const agent = createAgent(mode);

  const runAgent = async (message: string): Promise<void> => {
    const answer = await agent.run({
      userInput: message,
      model: client,
      tools: registry,
      memory,
      promptBuilder,
    });

    if (!answer) {
      console.log("\n模型没有返回文本。\n");
    } else {
      process.stdout.write("\n\n");
    }
  };

  if (userInput) {
    await runAgent(userInput);
    return;
  }

  const readline = createInterface({ input, output });
  let agentRunning = false;
  let closing = false;

  const printHistory = (): void => {
    const conversations = memory.getConversations();
    if (conversations.length === 0) {
      console.log("暂无会话记录。\n");
      return;
    }

    for (const conversation of conversations) {
      const previous = conversation.previousId === null ? "起点" : conversation.previousId;
      console.log(`#${conversation.id} (上一条: ${previous}) ${conversation.userInput}`);
    }
    console.log();
  };

  const handleMessage = async (rawMessage: string): Promise<void> => {
    const message = rawMessage.trim();

    if (["exit", "quit"].includes(message.toLowerCase())) {
      closing = true;
      readline.close();
      return;
    }

    if (message === "/history") {
      printHistory();
      return;
    }

    if (message.startsWith("/rollback ")) {
      if (agentRunning) {
        console.log("Agent 正在运行，请等待本次请求完成后再回滚。\n");
        return;
      }

      const conversationId = Number(message.slice("/rollback ".length).trim());
      if (!Number.isInteger(conversationId)) {
        console.error("用法：/rollback <编号>\n");
        return;
      }

      try {
        memory.rollbackTo(conversationId);
        console.log(`已回滚到会话 #${conversationId}。\n`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`${errorMessage}\n`);
      }
      return;
    }
    // console.log(`\n用户输入: ${message}\n`);
    if (!message) {
      return;
    }

    if (agentRunning) {
      memory.enqueueUserMessage(message);
      console.log("消息已加入队列，将在下一次模型调用前送入会话。\n");
      return;
    }

    agentRunning = true;
    try {
      await runAgent(message);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`请求失败：${errorMessage}`);
    } finally {
      agentRunning = false;
    }
  };

  console.log("Agent 已启动，可随时输入消息；输入 /history 查看会话，输入 /rollback <编号> 回滚。\n");

  try {
    readline.setPrompt("> ");
    readline.prompt();
    readline.on("line", (line) => {
      void handleMessage(line).finally(() => {
        if (!closing) {
          readline.prompt();
        }
      });
    });
    await new Promise<void>((resolve) => readline.once("close", resolve));
  } finally {
    readline.close();
    console.log("\nAgent 已退出。");
  }
}
