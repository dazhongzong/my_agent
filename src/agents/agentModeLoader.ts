import { readdir } from "node:fs/promises";
import type { AgentModeDefinition } from "./agentRegistry.ts";

function isAgentModeDefinition(value: unknown): value is AgentModeDefinition {
    if (!value || typeof value !== "object") {
        return false;
    }

    const definition = value as Partial<AgentModeDefinition>;
    return typeof definition.mode === "string"
        && definition.mode.trim().length > 0
        && typeof definition.create === "function";
}

export async function discoverAgentModes(
    directory: URL,
    extension: ".ts" | ".js" = import.meta.url.endsWith(".ts") ? ".ts" : ".js",
): Promise<AgentModeDefinition[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    const definitions: AgentModeDefinition[] = [];

    for (const entry of entries) {
        if (entry.isDirectory()) {
            definitions.push(...await discoverAgentModes(
                new URL(`${encodeURIComponent(entry.name)}/`, directory),
                extension,
            ));
            continue;
        }

        if (!entry.isFile()
            || !entry.name.endsWith(extension)
            || /\.(?:d|test|spec)\.(?:ts|js)$/.test(entry.name)) {
            continue;
        }

        const moduleUrl = new URL(encodeURIComponent(entry.name), directory);
        const module = await import(moduleUrl.href);
        // Helper modules may live alongside modes without exporting a definition.
        if (!("agentMode" in module)) {
            continue;
        }

        if (!isAgentModeDefinition(module.agentMode)) {
            throw new Error(`Invalid agentMode export in ${moduleUrl.href}: expected a non-empty mode and a create function.`);
        }

        definitions.push(module.agentMode);
    }

    return definitions;
}
