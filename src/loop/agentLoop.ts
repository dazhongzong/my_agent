import type { Message, ToolCall } from "../types.ts";
import { SessionMemory } from "../memory/sessionMemory.ts";
import type { OpenAICompatClient } from "../model_client/openaiCompatClient.ts";
import type { PromptBuilder } from "../prompt_builder/promptBuilder.ts";
import type { ToolRegistry } from "../tool_registry/toolRegistry.ts";

export class AgentLoop {
  constructor(
    private readonly model: OpenAICompatClient,
    private readonly tools: ToolRegistry,
    private readonly promptBuilder: PromptBuilder,
    private readonly memory: SessionMemory,
  ) { }

  async run(userInput: string): Promise<string> {
    const systemPrompt = this.promptBuilder.build();
    const history = this.memory.getHistory();

    if (history.length === 0 || history[0]?.content !== systemPrompt) {
      this.memory.addUserMessage(systemPrompt);
    }

    if (!userInput.trim()) {
      return "Please provide a message to the agent.";
    }

    this.memory.addUserMessage(userInput);

    while (true) {
      this.memory.drainPendingMessages();
      const llmResponse = await this.model.chat(this.memory.getHistory(), this.tools.list());

      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
        this.memory.addAssistantMessage(llmResponse.content || "");

        for (const call of llmResponse.toolCalls) {
          const tool = this.tools.get(call.name);

          if (!tool) {
            this.memory.addToolResult(call.id, call.name, `Tool not found: ${call.name}`);
            continue;
          }

          try {
            const result = await tool.run(call.arguments as Record<string, any>);
            this.memory.addToolResult(call.id, tool.name, result);
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown tool error";
            this.memory.addToolResult(call.id, tool.name, `Tool failed: ${message}`);
          }
        }

        continue;
      }

      const finalText = llmResponse.content || "I don't have a response.";
      this.memory.addAssistantMessage(finalText);

      if (this.memory.drainPendingMessages() > 0) {
        continue;
      }

      return finalText;
    }
  }
}
