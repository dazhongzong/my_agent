import type { Message } from "../types.ts";

export type ContextUsage = {
    usedTokens: number;
    maxTokens: number;
};

function estimateTextTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

export function estimateMessageTokens(message: Message): number {
    return 4 + estimateTextTokens(message.content ?? "")
        + estimateTextTokens(message.name ?? "");
}

export function trimMessagesToTokenLimit(
    messages: Message[],
    maxTokens: number,
): { messages: Message[]; usage: ContextUsage } {
    if (messages.length === 0) {
        return { messages: [], usage: { usedTokens: 0, maxTokens } };
    }

    const systemMessage = messages[0];
    const recentMessages = messages.slice(1);
    const selected: Message[] = [];
    const systemTokens = estimateMessageTokens(systemMessage);
    const systemBudget = Math.min(systemTokens, maxTokens);
    let usedTokens = systemBudget;

    for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
        const message = recentMessages[index];
        const messageTokens = estimateMessageTokens(message);

        if (usedTokens + messageTokens > maxTokens) {
            continue;
        }

        selected.unshift(message);
        usedTokens += messageTokens;
    }

    const trimmedSystemMessage = systemTokens <= maxTokens
        ? systemMessage
        : {
            ...systemMessage,
            content: (systemMessage.content ?? "").slice(0, Math.max(maxTokens - 4, 0) * 4),
        };
    const finalMessages = [trimmedSystemMessage, ...selected];
    const finalUsage = finalMessages.reduce(
        (total, message) => total + estimateMessageTokens(message),
        0,
    );

    return {
        messages: finalMessages,
        usage: { usedTokens: Math.min(finalUsage, maxTokens), maxTokens },
    };
}