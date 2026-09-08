import { ToolRiskGuard } from "../risk_control/toolRiskGuard.ts";
import type { Tool, ToolExecutionResult } from "../types.ts";

export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();
  private readonly riskGuard = new ToolRiskGuard();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    const tool = this.tools.get(name);
    if (!tool) {
      return undefined;
    }

    // Keep direct consumers of ToolRegistry safe too: any call through the
    // returned Tool still takes the same pre-execution path as ReactAgent.
    return {
      ...tool,
      run: async (args) => (await this.execute(name, args)).content,
    };
  }

  list(): Tool[] {
    return Array.from(this.tools.keys())
      .map((name) => this.get(name))
      .filter((tool): tool is Tool => tool !== undefined);
  }

  async execute(name: string, args: Record<string, any>): Promise<ToolExecutionResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { status: "failed", content: `Tool not found: ${name}` };
    }

    const decision = this.riskGuard.evaluate(tool, args);
    if (!decision.allowed) {
      return {
        status: "blocked",
        content: `RISK_CONTROL_BLOCKED: ${decision.reason} No action was executed. Reassess the task and choose a safe, non-destructive alternative.`,
      };
    }

    try {
      return { status: "executed", content: await tool.run(args) };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown tool error";
      return { status: "failed", content: `Tool failed: ${message}` };
    }
  }
}
