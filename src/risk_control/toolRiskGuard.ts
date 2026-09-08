import { isAbsolute, relative, resolve } from "node:path";
import type { Tool } from "../types.ts";

export type RiskDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

/**
 * A deterministic, pre-execution policy for tool calls. The policy deliberately
 * returns an explanation instead of throwing so the explanation can be sent
 * back to the model as a tool result.
 */
export class ToolRiskGuard {
  private readonly blockedToolNames: Set<string>;

  constructor(
    private readonly projectRoot = process.cwd(),
    blockedTools = process.env.RISK_BLOCKED_TOOLS ?? "",
  ) {
    this.blockedToolNames = new Set(
      blockedTools
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
    );
  }

  evaluate(tool: Tool, args: Record<string, unknown>): RiskDecision {
    if (this.blockedToolNames.has(tool.name)) {
      return {
        allowed: false,
        reason: `Tool \"${tool.name}\" is listed in RISK_BLOCKED_TOOLS.`,
      };
    }

    if (tool.name === "run_shell_command") {
      return this.evaluateShellCommand(args.command);
    }

    if (tool.name === "create_file" || tool.name === "edit_file") {
      return this.evaluateProjectPath(args.filePath, "Writing");
    }

    if (tool.name === "read_file" && typeof args.filePath === "string" && !args.filePath.startsWith("skill://")) {
      return this.evaluateProjectPath(args.filePath, "Reading");
    }

    return { allowed: true };
  }

  private evaluateShellCommand(command: unknown): RiskDecision {
    if (typeof command !== "string" || !command.trim()) {
      return { allowed: true };
    }

    const checks: Array<[RegExp, string]> = [
      [/(?:^|[;&|]\s*)(?:sudo\s+)?rm\s+[^\n]*-[a-z]*r[a-z]*f|(?:^|[;&|]\s*)(?:sudo\s+)?rm\s+-[a-z]*f[a-z]*r/i, "recursive file deletion"],
      [/(?:^|[;&|]\s*)(?:rmdir|rd)\s+[^\n]*(?:\/s|\/q)/i, "recursive directory deletion"],
      [/(?:^|[;&|]\s*)(?:del|erase)\s+\/[a-z]*[fq]/i, "forced file deletion"],
      [/(?:^|[;&|]\s*)(?:format|diskpart|clear-disk|remove-partition)\b/i, "disk formatting or partition modification"],
      [/(?:^|[;&|]\s*)(?:shutdown|restart-computer|restart)\b/i, "system shutdown or restart"],
      [/git\s+reset\s+--hard|git\s+clean\s+-[a-z]*f|git\s+push\b[^\n]*--force/i, "irreversible Git operation"],
      [/(?:curl|wget|invoke-webrequest|iwr)\b[^\n]*\|\s*(?:sh|bash|zsh|pwsh|powershell|iex)\b/i, "downloaded content piped directly to a shell"],
      [/(?:^|[;&|]\s*)(?:chmod|chown)\s+-R\b/i, "recursive permission or ownership change"],
    ];

    for (const [pattern, reason] of checks) {
      if (pattern.test(command)) {
        return { allowed: false, reason: `Detected ${reason} in the shell command.` };
      }
    }

    return { allowed: true };
  }

  private evaluateProjectPath(filePath: unknown, operation: "Reading" | "Writing"): RiskDecision {
    if (typeof filePath !== "string" || !filePath.trim()) {
      return { allowed: true };
    }

    const root = resolve(this.projectRoot);
    const target = resolve(root, filePath);
    const pathFromRoot = relative(root, target);
    if (pathFromRoot === ".." || pathFromRoot.startsWith(`..\\`) || pathFromRoot.startsWith("../") || isAbsolute(pathFromRoot)) {
      return {
        allowed: false,
        reason: `${operation} a path outside the project working directory is not allowed.`,
      };
    }

    const segments = pathFromRoot.split(/[\\/]+/);
    if (segments.some((segment) => segment === ".git" || segment === ".env" || segment.startsWith(".env."))) {
      return {
        allowed: false,
        reason: `${operation} Git metadata or environment-secret files is not allowed by the default risk policy.`,
      };
    }

    return { allowed: true };
  }
}
