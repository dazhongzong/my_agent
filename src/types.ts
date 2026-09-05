export type Role = "user" | "assistant" | "tool";

export type Message = {
  role: Role;
  content?: string;
  tool_call_id?: string;
  name?: string;
};

export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, any>;
};

export type LLMResponse = {
  content: string;
  reasoningContent?: string;
  toolCalls?: ToolCall[];
};

export type ToolSchema = {
  type: "object";
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
};

export type Tool = {
  name: string;
  description: string;
  schema: ToolSchema;
  run: (args: Record<string, any>) => Promise<string>;
};

export type AgentMode = "react" | "plan_execute" | "multi_agent";

export type AgentContext = {
  userInput: string;
  model: {
    chat(messages: Message[], tools: Tool[]): Promise<LLMResponse>;
  };
  tools: {
    list(): Tool[];
    get(name: string): Tool | undefined;
  };
  memory: {
    getHistory(): Message[];
    addUserMessage(content: string): void;
    enqueueUserMessage(content: string): void;
    drainPendingMessages(): number;
    hasPendingMessages(): boolean;
    addAssistantMessage(content: string): void;
    addToolResult(toolCallId: string, name: string, content: string): void;
  };
  promptBuilder: {
    build(): string;
  };
};

export interface AgentStrategy {
  run(context: AgentContext): Promise<string>;
}
