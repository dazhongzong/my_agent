import type { AgentContext, AgentStrategy } from "../types.ts";
import { registerAgent } from "./agentRegistry.ts";

export class ReactAgent implements AgentStrategy {
    async run(context: AgentContext): Promise<string> {
        if (!context.userInput.trim()) {
            return "Please provide a message to the agent.";
        }

        context.memory.addUserMessage(context.userInput);

        let invalidToolCallRetries = 0;
        while (true) {
            context.memory.drainPendingMessages();
            const llmResponse = await context.model.chat(context.memory.getHistory(), context.tools.list());

            if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
                context.memory.addAssistantMessage(llmResponse.content || "");
                let hasParseError = false;

                for (const call of llmResponse.toolCalls) {
                    if (call.parseError) {
                        hasParseError = true;
                        context.memory.addToolResult(call.id, call.name || "unknown", call.parseError);
                        continue;
                    }

                    const tool = context.tools.get(call.name);

                    if (!tool) {
                        context.memory.addToolResult(call.id, call.name, `Tool not found: ${call.name}`);
                        continue;
                    }

                    try {
                        const result = await tool.run(call.arguments as Record<string, any>);
                        context.memory.addToolResult(call.id, tool.name, result);
                    } catch (error: unknown) {
                        const message = error instanceof Error ? error.message : "Unknown tool error";
                        context.memory.addToolResult(call.id, tool.name, `Tool failed: ${message}`);
                    }
                }

                if (hasParseError) {
                    invalidToolCallRetries += 1;
                    if (invalidToolCallRetries >= 2) {
                        return "模型连续生成了无效的工具参数，请重试当前请求。";
                    }
                } else {
                    invalidToolCallRetries = 0;
                }

                continue;
            }

            const finalText = llmResponse.content || "I don't have a response.";
            context.memory.addAssistantMessage(finalText);

            if (context.memory.drainPendingMessages() > 0) {
                continue;
            }

            return finalText;
        }
    }
}

registerAgent("react", () => new ReactAgent());
