import type { AgentContext, AgentStrategy } from "../../types.ts";

export class MultiAgentSupervisor implements AgentStrategy {
    async run(context: AgentContext): Promise<string> {
        context.memory.addUserMessage(context.userInput);

        context.memory.drainPendingMessages();
        const planner = await context.model.chat(
            [
                ...context.memory.getHistory(),
                { role: "user", content: `Break this task into 2 worker roles and what each should do: ${context.userInput}` },
            ],
            context.tools.list(),
        );

        context.memory.drainPendingMessages();
        const worker = await context.model.chat(
            [
                ...context.memory.getHistory(),
                { role: "user", content: `Worker task: ${planner.content || context.userInput}` },
            ],
            context.tools.list(),
        );

        const finalText = worker.content || "Multi-agent execution completed.";
        context.memory.addAssistantMessage(finalText);
        return finalText;
    }
}
