import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Tool } from "../types.ts";

export const editTool: Tool = {
    name: "edit_file",
    description: "Edit an existing file by replacing one exact, unique text block. Read the file first and include the complete oldText.",
    schema: {
        type: "object",
        properties: {
            filePath: {
                type: "string",
                description: "The existing file path to edit, relative to the project working directory.",
            },
            oldText: {
                type: "string",
                description: "The exact text to replace, including whitespace and line breaks.",
            },
            newText: {
                type: "string",
                description: "The replacement text.",
            },
        },
        required: ["filePath", "oldText", "newText"],
    },
    async run({ filePath, oldText, newText }: Record<string, any>): Promise<string> {
        if (typeof filePath !== "string" || !filePath.trim()) {
            throw new Error("filePath must be a non-empty string.");
        }

        if (typeof oldText !== "string" || !oldText) {
            throw new Error("oldText must be a non-empty string.");
        }

        if (typeof newText !== "string") {
            throw new Error("newText must be a string.");
        }

        const targetPath = resolve(process.cwd(), filePath);
        const currentContent = await readFile(targetPath, "utf8");
        const matchCount = currentContent.split(oldText).length - 1;

        if (matchCount === 0) {
            throw new Error(`oldText was not found in ${filePath}. Read the file again and retry.`);
        }

        if (matchCount > 1) {
            throw new Error(`oldText matches ${matchCount} locations in ${filePath}; include more context so the match is unique.`);
        }

        const updatedContent = currentContent.replace(oldText, newText);
        await writeFile(targetPath, updatedContent, "utf8");

        return `Edited file: ${filePath}`;
    },
};