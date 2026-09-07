import type { AgentContext, AgentStrategy } from "../types.ts";

export class PlanExecuteAgent implements AgentStrategy {
    async run(context: AgentContext): Promise<string> {
        context.memory.addUserMessage(context.userInput);

        const planPrompt = `Create a short execution plan for this task. Return JSON like {"steps":["step1","step2"]}. Task: ${context.userInput}`;
        context.memory.drainPendingMessages();
        const planResponse = await context.model.chat(
            [...context.memory.getHistory(), { role: "user", content: planPrompt }],
            context.tools.list(),
        );
        const planText = planResponse.content || "[]";

        let steps: string[] = [];
        try {
            const parsed = JSON.parse(planText);
            steps = Array.isArray(parsed.steps) ? parsed.steps : [planText];
        } catch {
            steps = [planText];
        }

        const results: string[] = [];
        for (const step of steps) {
            context.memory.drainPendingMessages();
            const response = await context.model.chat(
                [...context.memory.getHistory(), { role: "user", content: `Execute this step: ${step}` }],
                context.tools.list(),
            );
            results.push(response.content || "No result");
        }

        const summary = results.join("\n\n");
        context.memory.addAssistantMessage(summary);
        return summary;
    }
}
