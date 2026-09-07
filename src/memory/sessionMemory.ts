import type { Message } from "../types.ts";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type ConversationRecord = {
  id: number;
  previousId: number | null;
  userInput: string;
  messages: Message[];
};

export type SessionMemoryOptions = {
  persistenceFilePath?: string;
};

export class SessionMemory {
  private readonly systemMessage: Message;
  private readonly persistenceFilePath?: string;
  private conversations: ConversationRecord[] = [];
  private readonly pendingUserMessages: string[] = [];
  private persistenceQueue: Promise<void> = Promise.resolve();
  private nextConversationId = 1;

  constructor(systemPrompt: string, options: SessionMemoryOptions = {}) {
    this.systemMessage = { role: "user", content: systemPrompt };
    this.persistenceFilePath = options.persistenceFilePath;
    this.loadPersistedConversations();
  }

  addUserMessage(content: string): void {
    const previousConversation = this.conversations.at(-1);
    this.conversations.push({
      id: this.nextConversationId++,
      previousId: previousConversation?.id ?? null,
      userInput: content,
      messages: [{ role: "user", content }],
    });
    this.persist();
  }

  enqueueUserMessage(content: string): void {
    this.pendingUserMessages.push(content);
  }

  drainPendingMessages(): number {
    const pendingMessages = this.pendingUserMessages.splice(0);
    for (const message of pendingMessages) {
      this.addUserMessage(message);
    }

    return pendingMessages.length;
  }

  hasPendingMessages(): boolean {
    return this.pendingUserMessages.length > 0;
  }

  async flush(): Promise<void> {
    await this.persistenceQueue;
  }

  addAssistantMessage(content: string): void {
    this.currentConversation().messages.push({ role: "assistant", content });
    this.persist();
  }

  addToolResult(toolCallId: string, name: string, content: string): void {
    this.currentConversation().messages.push({
      role: "tool",
      tool_call_id: toolCallId,
      name,
      content,
    });
    this.persist();
  }

  getHistory(): Message[] {
    return [
      this.systemMessage,
      ...this.conversations.flatMap((conversation) => conversation.messages),
    ];
  }

  getConversations(): Array<Pick<ConversationRecord, "id" | "previousId" | "userInput">> {
    return this.conversations.map(({ id, previousId, userInput }) => ({
      id,
      previousId,
      userInput,
    }));
  }

  rollbackTo(conversationId: number): void {
    const conversationIndex = this.conversations.findIndex(
      (conversation) => conversation.id === conversationId,
    );

    if (conversationIndex === -1) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    this.conversations = this.conversations.slice(0, conversationIndex + 1);
    this.persist();
  }

  private currentConversation(): ConversationRecord {
    const conversation = this.conversations.at(-1);
    if (!conversation) {
      throw new Error("Cannot add a response before a user message.");
    }

    return conversation;
  }

  private persist(): void {
    if (!this.persistenceFilePath) {
      return;
    }

    const jsonl = this.conversations
      .map((conversation) => JSON.stringify(conversation))
      .join("\n");
    const content = jsonl ? `${jsonl}\n` : "";
    const filePath = this.persistenceFilePath;

    this.persistenceQueue = this.persistenceQueue
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Unknown persistence error";
        console.error(`Previous session memory write failed: ${message}`);
      })
      .then(async () => {
        await mkdir(dirname(filePath), { recursive: true });
        await writeFile(filePath, content, "utf8");
      });
  }

  private loadPersistedConversations(): void {
    if (!this.persistenceFilePath || !existsSync(this.persistenceFilePath)) {
      return;
    }

    const content = readFileSync(this.persistenceFilePath, "utf8").trim();
    if (!content) {
      return;
    }

    const conversations = content
      .split(/\r?\n/)
      .map((line, index) => parseConversationRecord(line, index + 1));

    this.conversations = conversations;
    this.nextConversationId = conversations.reduce(
      (nextId, conversation) => Math.max(nextId, conversation.id + 1),
      1,
    );
  }
}

function parseConversationRecord(line: string, lineNumber: number): ConversationRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown JSON parse error";
    throw new Error(`Invalid session JSONL at line ${lineNumber}: ${message}`);
  }

  if (!isConversationRecord(parsed)) {
    throw new Error(`Invalid session JSONL at line ${lineNumber}: expected a ConversationRecord node.`);
  }

  return parsed;
}

function isConversationRecord(value: unknown): value is ConversationRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<ConversationRecord>;
  return Number.isInteger(record.id)
    && (record.previousId === null || Number.isInteger(record.previousId))
    && typeof record.userInput === "string"
    && Array.isArray(record.messages)
    && record.messages.every(isMessage);
}

function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Partial<Message>;
  return ["user", "assistant", "tool"].includes(message.role ?? "")
    && (message.content === undefined || typeof message.content === "string")
    && (message.tool_call_id === undefined || typeof message.tool_call_id === "string")
    && (message.name === undefined || typeof message.name === "string");
}
