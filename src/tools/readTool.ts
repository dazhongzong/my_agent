import type { Tool } from "../types.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveSkillUri } from "../skill_registry/skillRegistry.ts";

export const readTool: Tool = {
    name: "read_file",
    description: "Read the content of a file. Fails if the file does not exist.",
    schema: {
        type: 'object',
        properties: {
            filePath: {
                type: "string",
                description: "The file path to read, relative to the project working directory, or a skill:// URI such as skill://code-review/SKILL.md.",
            }
        },
        required: ["filePath"],
    },
    async run({ filePath }: Record<string, any>): Promise<string> {
        if (typeof filePath !== "string" || !filePath.trim()) {
            throw new Error("filePath must be a non-empty string.");
        }

        const targetPath = resolveSkillUri(filePath) ?? resolve(process.cwd(), filePath);
        return readFileSync(targetPath, "utf-8");
    },
};
