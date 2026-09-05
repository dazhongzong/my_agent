import type { Tool } from "../types.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const readTool: Tool = {
    name: "read_file",
    description: "Read the content of a file. Fails if the file does not exist.",
    schema: {
        type: 'object',
        properties: {
            filePath: {
                type: "string",
                description: "The file path to read, relative to the project working directory.",
            }
        },
        required: ["filePath"],
    },
    async run({ filePath }: Record<string, any>): Promise<string> {
        return await readFileSync(resolve(process.cwd(), filePath), "utf-8");
    },
};