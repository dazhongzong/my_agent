import type { AgentMode, AgentStrategy } from "../types.ts";
import { createRegisteredAgent, listAgentModes, registerAgent } from "./agentRegistry.ts";
import { discoverAgentModes } from "./agentModeLoader.ts";

// ESM waits for discovery before exposing the synchronous factory to callers.
for (const definition of await discoverAgentModes(new URL("./agentMode/", import.meta.url))) {
    registerAgent(definition.mode, definition.create);
}

export function createAgent(mode: AgentMode = "react"): AgentStrategy {
    return createRegisteredAgent(mode);
}

export { listAgentModes, registerAgent };
