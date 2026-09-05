import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Tool } from "../types.ts";

const execAsync = promisify(exec);

export const shellTool: Tool = {
    name: "run_shell_command",
    description: "Execute a shell command in the project environment and return its output.",
    schema: {
        type: "object",
        properties: {
            command: {
                type: "string",
                description: "The shell command to execute.",
            },
            cwd: {
                type: "string",
                description: "Optional working directory for the command.",
            },
            timeout: {
                type: "number",
                description: "Optional timeout in milliseconds. Defaults to 30000.",
            },
        },
        required: ["command"],
    },
    async run({ command, cwd, timeout }: Record<string, any>): Promise<string> {
        if (typeof command !== "string" || !command.trim()) {
            throw new Error("command must be a non-empty string.");
        }

        const commandTimeout = typeof timeout === "number" && timeout > 0 ? timeout : 30_000;

        try {
            const result = await execAsync(command, {
                cwd: typeof cwd === "string" && cwd.trim() ? cwd : process.cwd(),
                timeout: commandTimeout,
                maxBuffer: 1024 * 1024,
                windowsHide: true,
            });

            return [result.stdout, result.stderr ? `stderr:\n${result.stderr}` : ""]
                .filter(Boolean)
                .join("\n") || "Command completed successfully with no output.";
        } catch (error: any) {
            const output = [error.stdout, error.stderr].filter(Boolean).join("\n");
            return `Command failed with exit code ${error.code ?? "unknown"}.${output ? `\n${output}` : ""}`;
        }
    },
};