export type AgentMode = "react" | "plan_execute" | "multi_agent";
export type ModelProvider = "openai" | "github";

function defaultSessionMemoryFile(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `.myagent/sessions/session-${timestamp}.jsonl`;
}

export const config = {
  modelProvider: (process.env.MODEL_PROVIDER as ModelProvider | undefined) ?? "openai",
  apiKey:
    process.env.MODEL_PROVIDER === "github"
      ? process.env.GITHUB_TOKEN ?? process.env.OPENAI_API_KEY ?? ""
      : process.env.OPENAI_API_KEY ?? "",
  baseUrl:
    process.env.MODEL_PROVIDER === "github"
      ? process.env.GITHUB_BASE_URL ?? "https://models.inference.ai.azure.com"
      : process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  model:
    process.env.MODEL_PROVIDER === "github"
      ? process.env.GITHUB_MODEL ?? process.env.OPENAI_MODEL ?? "openai/gpt-4o-mini"
      : process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  contextWindowTokens: Math.max(
    1,
    Number.parseInt(process.env.CONTEXT_WINDOW_TOKENS ?? "8192", 10) || 8192,
  ),
  agentMode: (process.env.AGENT_MODE as AgentMode | undefined) ?? "react",
  sessionMemoryFile: process.env.SESSION_MEMORY_FILE ?? defaultSessionMemoryFile(),
  systemPrompt:
    process.env.AGENT_SYSTEM_PROMPT ??
    "You are a helpful assistant. Use tools when appropriate and keep answers concise.",
};
