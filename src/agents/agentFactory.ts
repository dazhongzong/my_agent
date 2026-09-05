import type { AgentMode, AgentStrategy } from "../types.ts";
import { ReactAgent } from "./reactAgent.ts";
import { PlanExecuteAgent } from "./planExecuteAgent.ts";
import { MultiAgentSupervisor } from "./multiAgent/supervisor.ts";

export function createAgent(mode: AgentMode = 'react'): AgentStrategy {
    switch (mode) {
        case "react":
            return new ReactAgent();
        case "plan_execute":
            return new PlanExecuteAgent();
        case "multi_agent":
            return new MultiAgentSupervisor();
        default:
            return new ReactAgent();
    }
}
