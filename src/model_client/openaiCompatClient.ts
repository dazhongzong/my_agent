import OpenAI from "openai";
import type { LLMResponse, Message, Tool } from "../types.ts";
import { trimMessagesToTokenLimit, type ContextUsage } from "./contextWindow.ts";

export class OpenAICompatClient {
  private readonly client: OpenAI;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly onReasoning?: (content: string) => void,
    private readonly onContent?: (content: string) => void,
    private readonly contextWindowTokens = 8192,
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

    this.contextUsage = {
      usedTokens: 0,
      maxTokens: this.contextWindowTokens,
    };
  }

  private contextUsage: ContextUsage;

  getContextUsage(): ContextUsage {
    return this.contextUsage;
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
    const limitedContext = trimMessagesToTokenLimit(messages, this.contextWindowTokens);
    this.contextUsage = limitedContext.usage;

    const sdkMessages = limitedContext.messages.map((message) => {
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

    const toolCalls = Array.from(toolCallParts.values()).map((call) => {
      const parsedArguments = this.parseToolArguments(call.arguments);
      return {
        id: call.id,
        name: call.name,
        arguments: parsedArguments.arguments,
        ...(parsedArguments.error ? { parseError: parsedArguments.error } : {}),
      };
    });

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

  private parseToolArguments(rawArguments: string): {
    arguments: Record<string, any>;
    error?: string;
  } {
    try {
      const parsed = JSON.parse(rawArguments || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {
          arguments: {},
          error: "工具参数必须是 JSON 对象。",
        };
      }

      return { arguments: parsed as Record<string, any> };
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : "JSON 解析失败";
      return {
        arguments: {},
        error: `工具参数 JSON 无效，可能在输出中被截断：${reason}`,
      };
    }
  }
}
