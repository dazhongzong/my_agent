import OpenAI from "openai";
import type { LLMResponse, Message, Tool } from "../types.ts";

export class OpenAICompatClient {
  private readonly client: OpenAI;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly onReasoning?: (content: string) => void,
    private readonly onContent?: (content: string) => void,
  ) {
    const isGitHubProvider = this.baseUrl.includes("github") || this.baseUrl.includes("models.inference.ai.azure.com");

    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      defaultHeaders: isGitHubProvider
        ? {
          "X-GitHub-Api-Version": "2023-03-15",
        }
        : undefined,
    });
  }

  private buildTools(tools: Tool[]) {
    return tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.schema,
      },
    }));
  }

  async chat(messages: Message[], tools: Tool[]): Promise<LLMResponse> {
    const sdkMessages = messages.map((message) => {
      if (message.role === "tool") {
        return {
          role: "tool" as const,
          content: message.content ?? "",
          tool_call_id: message.tool_call_id ?? "",
          ...(message.name ? { name: message.name } : {}),
        } as any;
      }

      return {
        role: message.role,
        content: message.content ?? "",
        ...(message.name ? { name: message.name } : {}),
      } as any;
    });

    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: sdkMessages as any,
      tools: this.buildTools(tools) as any,
      temperature: 0.2,
      stream: true,
    }) as any;

    let content = "";
    let reasoningContent = "";
    let reasoningStarted = false;
    let contentStarted = false;
    const toolCallParts = new Map<number, { id: string; name: string; arguments: string }>();

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta ?? {};
      const contentDelta = typeof delta.content === "string" ? delta.content : "";
      const reasoningDelta = this.getReasoningDelta(delta);

      if (reasoningDelta) {
        reasoningContent += reasoningDelta;
        this.onReasoning?.(reasoningStarted ? reasoningDelta : `\n[模型思考]\n${reasoningDelta}`);
        reasoningStarted = true;
      }

      if (contentDelta) {
        content += contentDelta;
        this.onContent?.(contentStarted ? contentDelta : `\n[模型回复]\n${contentDelta}`);
        contentStarted = true;
      }

      for (const [chunkIndex, toolCall] of (delta.tool_calls ?? []).entries()) {
        const index = typeof toolCall.index === "number" ? toolCall.index : chunkIndex;
        const current = toolCallParts.get(index) ?? {
          id: toolCall.id ?? `tool-${Math.random().toString(36).slice(2)}`,
          name: "",
          arguments: "",
        };
        current.name += toolCall.function?.name ?? "";
        current.arguments += toolCall.function?.arguments ?? "";
        toolCallParts.set(index, current);
      }
    }

    const toolCalls = Array.from(toolCallParts.values()).map((call) => ({
      id: call.id,
      name: call.name,
      arguments: this.parseToolArguments(call.arguments),
    }));

    return {
      content,
      ...(reasoningContent ? { reasoningContent } : {}),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };
  }

  private getReasoningDelta(delta: unknown): string {
    if (!delta || typeof delta !== "object") {
      return "";
    }

    const responseDelta = delta as { reasoning_content?: unknown; reasoning?: unknown };
    const reasoning = responseDelta.reasoning_content ?? responseDelta.reasoning;
    return typeof reasoning === "string" ? reasoning : "";
  }

  private parseToolArguments(rawArguments: string): Record<string, any> {
    try {
      return JSON.parse(rawArguments || "{}");
    } catch {
      return { _raw: rawArguments };
    }
  }
}
