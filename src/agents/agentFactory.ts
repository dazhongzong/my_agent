import type { AgentMode, AgentStrategy } from "../types.ts";
import { createRegisteredAgent, listAgentModes, registerAgent } from "./agentRegistry.ts";
import "./reactAgent.ts";
import "./planExecuteAgent.ts";
import "./multiAgent/supervisor.ts";

export function createAgent(mode: AgentMode = "react"): AgentStrategy {
    return createRegisteredAgent(mode);
}

export { listAgentModes, registerAgent };
