import type { Message } from "../types.ts";

export type ConversationRecord = {
  id: number;
  previousId: number | null;
  userInput: string;
  messages: Message[];
};

export class SessionMemory {
  private readonly systemMessage: Message;
  private conversations: ConversationRecord[] = [];
  private readonly pendingUserMessages: string[] = [];
  private nextConversationId = 1;

  constructor(systemPrompt: string) {
    this.systemMessage = { role: "user", content: systemPrompt };
  }

  addUserMessage(content: string): void {
    const previousConversation = this.conversations.at(-1);
    this.conversations.push({
      id: this.nextConversationId++,
      previousId: previousConversation?.id ?? null,
      userInput: content,
      messages: [{ role: "user", content }],
    });
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

  addAssistantMessage(content: string): void {
    this.currentConversation().messages.push({ role: "assistant", content });
  }

  addToolResult(toolCallId: string, name: string, content: string): void {
    this.currentConversation().messages.push({
      role: "tool",
      tool_call_id: toolCallId,
      name,
      content,
    });
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
  }

  private currentConversation(): ConversationRecord {
    const conversation = this.conversations.at(-1);
    if (!conversation) {
      throw new Error("Cannot add a response before a user message.");
    }

    return conversation;
  }
}
