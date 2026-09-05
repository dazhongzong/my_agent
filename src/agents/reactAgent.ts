import type { AgentContext, AgentStrategy } from "../types.ts";

export class ReactAgent implements AgentStrategy {
    async run(context: AgentContext): Promise<string> {
        const systemPrompt = context.promptBuilder.build();
        const history = context.memory.getHistory();

        if (history.length === 0 || history[0]?.content !== systemPrompt) {
            context.memory.addUserMessage(systemPrompt);
        }

        if (!context.userInput.trim()) {
            return "Please provide a message to the agent.";
        }

        context.memory.addUserMessage(context.userInput);

        while (true) {
            context.memory.drainPendingMessages();
            const llmResponse = await context.model.chat(context.memory.getHistory(), context.tools.list());

            if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
                context.memory.addAssistantMessage(llmResponse.content || "");

                for (const call of llmResponse.toolCalls) {
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
