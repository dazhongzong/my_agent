import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { SessionMemory } from "../memory/sessionMemory.ts";
import type { ToolRegistry } from "../tool_registry/toolRegistry.ts";

type AgentRunner = (message: string) => Promise<void>;

type CliCommand = {
  name: string;
  usage: string;
  description: string;
};

const cliCommands: CliCommand[] = [
  {
    name: "/help",
    usage: "/help",
    description: "Show available CLI commands.",
  },
  {
    name: "/tools",
    usage: "/tools",
    description: "List registered tools.",
  },
  {
    name: "/history",
    usage: "/history",
    description: "Show conversation ids for rollback.",
  },
  {
    name: "/rollback",
    usage: "/rollback <conversation_id>",
    description: "Rollback memory to a previous conversation.",
  },
];

const exitCommands = ["exit", "quit"];

export class InteractiveCli {
  private readonly readline = createInterface({
    input,
    output,
    completer: this.complete.bind(this),
  });
  private agentRunning = false;
  private closing = false;

  constructor(
    private readonly memory: SessionMemory,
    private readonly tools: ToolRegistry,
    private readonly runAgent: AgentRunner,
  ) {}

  async start(): Promise<void> {
    console.log("Agent started. Type /help for commands, press Tab for completion, or type exit to quit.\n");

    try {
      this.readline.setPrompt("> ");
      this.readline.prompt();
      this.readline.on("line", (line) => {
        void this.handleLine(line).finally(() => {
          if (!this.closing) {
            this.readline.prompt();
          }
        });
      });
      await new Promise<void>((resolve) => this.readline.once("close", resolve));
    } finally {
      this.readline.close();
      console.log("\nAgent exited.");
    }
  }

  private complete(line: string): [string[], string] {
    const trimmedStart = line.trimStart();
    const leadingWhitespace = line.slice(0, line.length - trimmedStart.length);
    const commandCandidates = cliCommands.map((command) => `${leadingWhitespace}${command.name}`);
    const exitCandidates = exitCommands.map((command) => `${leadingWhitespace}${command}`);

    if (trimmedStart.startsWith("/rollback ")) {
      const idPrefix = trimmedStart.slice("/rollback ".length);
      const matches = this.memory
        .getConversations()
        .map((conversation) => `${leadingWhitespace}/rollback ${conversation.id}`)
        .filter((candidate) => {
          const candidateId = candidate.slice(`${leadingWhitespace}/rollback `.length);
          return candidate.startsWith(line) || candidateId.startsWith(idPrefix);
        });

      return [matches, line];
    }

    if (trimmedStart.length === 0) {
      return [[...commandCandidates, ...exitCandidates], line];
    }

    if (trimmedStart.startsWith("/")) {
      const matches = commandCandidates.filter((candidate) => candidate.startsWith(line));
      return [matches.length > 0 ? matches : commandCandidates, line];
    }

    const matches = exitCandidates.filter((candidate) => candidate.startsWith(line));
    return [matches, line];
  }

  private async handleLine(rawLine: string): Promise<void> {
    const message = rawLine.trim();

    if (!message) {
      return;
    }

    if (exitCommands.includes(message.toLowerCase())) {
      this.closing = true;
      this.readline.close();
      return;
    }

    if (message.startsWith("/")) {
      await this.handleCommand(message);
      return;
    }

    if (this.agentRunning) {
      this.memory.enqueueUserMessage(message);
      console.log("Message queued and will be sent before the next model call.\n");
      return;
    }

    this.agentRunning = true;
    try {
      await this.runAgent(message);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`Request failed: ${errorMessage}`);
    } finally {
      this.agentRunning = false;
    }
  }

  private async handleCommand(message: string): Promise<void> {
    if (message === "/help") {
      this.printHelp();
      return;
    }

    if (message === "/tools") {
      this.printTools();
      return;
    }

    if (message === "/history") {
      this.printHistory();
      return;
    }

    if (message === "/rollback" || message.startsWith("/rollback ")) {
      this.handleRollback(message);
      return;
    }

    this.printUnknownCommand(message);
  }

  private printHelp(): void {
    console.log("\nCommands:");
    for (const command of cliCommands) {
      console.log(`  ${command.usage.padEnd(28)} ${command.description}`);
    }
    console.log(`  ${exitCommands.join(" / ").padEnd(28)} Exit the CLI.`);
    console.log("\nTips:");
    console.log("  Press Tab to complete commands.");
    console.log("  Type /rollback and press Tab to complete conversation ids.\n");
  }

  private printTools(): void {
    const tools = this.tools.list();
    if (tools.length === 0) {
      console.log("\nNo tools registered.\n");
      return;
    }

    console.log("\nTools:");
    for (const tool of tools) {
      console.log(`  ${tool.name.padEnd(22)} ${tool.description}`);
    }
    console.log();
  }

  private printHistory(): void {
    const conversations = this.memory.getConversations();
    if (conversations.length === 0) {
      console.log("No conversation history yet.\n");
      return;
    }

    for (const conversation of conversations) {
      const previous = conversation.previousId === null ? "start" : conversation.previousId;
      console.log(`#${conversation.id} (previous: ${previous}) ${conversation.userInput}`);
    }
    console.log();
  }

  private handleRollback(message: string): void {
    if (this.agentRunning) {
      console.log("Agent is running. Wait for the current request to finish before rolling back.\n");
      return;
    }

    const rawConversationId = message.slice("/rollback".length).trim();
    if (!rawConversationId) {
      console.error("Usage: /rollback <conversation_id>");
      this.printHistory();
      return;
    }

    const conversationId = Number(rawConversationId);
    if (!Number.isInteger(conversationId)) {
      console.error("Usage: /rollback <conversation_id>\n");
      return;
    }

    try {
      this.memory.rollbackTo(conversationId);
      console.log(`Rolled back to conversation #${conversationId}.\n`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`${errorMessage}\n`);
    }
  }

  private printUnknownCommand(message: string): void {
    const matches = cliCommands
      .map((command) => command.name)
      .filter((commandName) => commandName.startsWith(message.slice(0, 3)));

    console.error(`Unknown command: ${message}`);
    if (matches.length > 0) {
      console.log(`Did you mean: ${matches.join(", ")}?`);
    }
    console.log("Type /help to see available commands.\n");
  }
}
