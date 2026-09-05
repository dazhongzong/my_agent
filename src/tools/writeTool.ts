import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Tool } from "../types.ts";

export const writeTool: Tool = {
    name: "create_file",
    description: "Create a new file with the provided content. Fails if the file already exists.",
    schema: {
        type: 'object',
        properties: {
            filePath: {
                type: "string",
                description: "The file path to create, relative to the project working directory.",
            },
            content: {
                type: "string",
                description: "The complete content to write into the file.",
            },
        },
        required: ["filePath", "content"],
    },
    async run({ filePath, content }: Record<string, any>): Promise<string> {
        if (typeof filePath !== "string" || !filePath.trim()) {
            throw new Error("filePath must be a non-empty string.");
        }

        if (typeof content !== "string") {
            throw new Error("content must be a string.");
        }

        const targetPath = resolve(process.cwd(), filePath);
        await mkdir(dirname(targetPath), { recursive: true });
        await writeFile(targetPath, content, { encoding: "utf8", flag: "wx" });

        return `Created file: ${filePath}`;
    },
};