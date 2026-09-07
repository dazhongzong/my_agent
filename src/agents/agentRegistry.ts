import type { AgentMode, AgentStrategy } from "../types.ts";

export type AgentCreator = () => AgentStrategy;

const agentCreators = new Map<AgentMode, AgentCreator>();

export function registerAgent(mode: AgentMode, creator: AgentCreator): void {
    const normalizedMode = mode.trim();

    if (!normalizedMode) {
        throw new Error("Agent mode must be a non-empty string.");
    }

    if (agentCreators.has(normalizedMode)) {
        throw new Error(`Agent mode already registered: ${normalizedMode}`);
    }

    agentCreators.set(normalizedMode, creator);
    console.log(`Registered agent mode: ${normalizedMode}`);
}

export function listAgentModes(): AgentMode[] {
    return Array.from(agentCreators.keys());
}

export function createRegisteredAgent(mode: AgentMode = "react"): AgentStrategy {
    const creator = agentCreators.get(mode);

    if (!creator) {
        const availableModes = listAgentModes().join(", ") || "none";
        throw new Error(`Unknown agent mode: ${mode}. Available modes: ${availableModes}`);
    }

    return creator();
}
