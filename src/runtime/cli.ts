import { config } from "../config.ts";
import { OpenAICompatClient } from "../model_client/openaiCompatClient.ts";
import { PromptBuilder } from "../prompt_builder/promptBuilder.ts";
import { SessionMemory } from "../memory/sessionMemory.ts";
import { ToolRegistry } from "../tool_registry/toolRegistry.ts";
import { createAgent } from "../agents/agentFactory.ts";
import { InteractiveCli } from "./interactiveCli.ts";
import { defaultSkillRoots, setActiveSkillRegistry, SkillRegistry } from "../skill_registry/skillRegistry.ts";
import { readdir } from "node:fs/promises";
import type { AgentMode, Tool } from "../types.ts";

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
        console.log(`Registered tool: ${exportedValue.name}`);
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
  const skills = new SkillRegistry(defaultSkillRoots());
  await skills.load();
  setActiveSkillRegistry(skills);

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
    config.contextWindowTokens,
  );
  const skillPromptContext = skills.buildPromptContext();
  const promptBuilder = new PromptBuilder(config.systemPrompt, skillPromptContext || undefined);
  const memory = new SessionMemory(promptBuilder.build(), {
    persistenceFilePath: config.sessionMemoryFile,
  });
  console.log(`Session memory file: ${config.sessionMemoryFile}`);
  console.log(`Loaded conversation nodes: ${memory.getConversations().length}`);
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
      console.log("\nModel returned no text.\n");
    } else {
      process.stdout.write("\n\n");
    }

    const usage = client.getContextUsage();
    const percentage = Math.round((usage.usedTokens / usage.maxTokens) * 100);
    console.log(`[context] approx ${usage.usedTokens} / ${usage.maxTokens} tokens (${percentage}%)`);
    await memory.flush();
  };

  if (userInput) {
    await runAgent(userInput);
    return;
  }

  await new InteractiveCli(memory, registry, skills, runAgent).start();
}
