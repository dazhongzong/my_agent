# 从零实现自己的 Agent：TypeScript + Python 方案

## 1. 核心理解

参考这个项目的架构，Agent 的本质不是“单纯调模型”，而是：

- 输入层：用户消息、命令、技能、上下文
- Prompt 构建层：system prompt + AGENTS.md + tools + history
- Agent Loop：LLM -> tool call -> execute tool -> continue loop
- Memory / Session：消息历史、压缩、分支会话
- Runtime：CLI、TUI、RPC、SDK

一句话总结：

> Agent = 模型适配器 + 工具注册表 + 会话记忆 + 一个持续循环的 LLM/tool 调度器

---

## 2. 最小 Agent 的结构

```text
MyAgent
├─ model_client         # 调用 OpenAI / Gemini / local model
├─ prompt_builder       # 拼 system + history + tools
├─ tool_registry        # tool name -> function
├─ memory               # session history / summary
├─ loop                 # LLM -> tool -> LLM -> ...
└─ runtime              # main entry
```

核心循环：

```text
用户输入
  -> 拼接消息
  -> 调用 LLM
  -> 如果返回 tool call
      -> 执行工具
      -> 将工具结果回填到上下文
      -> 继续调用 LLM
  -> 如果返回文本
      -> 输出给用户
```

---

## 3. TypeScript 最小可运行版本

```ts
type Role = "user" | "assistant" | "tool";

type Message = {
  role: Role;
  content?: string;
  tool_call_id?: string;
  name?: string;
};

type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, any>;
};

type LLMResponse = {
  content: string;
  toolCalls?: ToolCall[];
};

type Tool = {
  name: string;
  description: string;
  schema: Record<string, any>;
  run: (args: Record<string, any>) => Promise<string>;
};

class OpenAICompatClient {
  constructor(
    private apiKey: string,
    private baseUrl: string,
    private model: string
  ) {}

  async chat(messages: Message[], tools: Tool[]): Promise<LLMResponse> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content ?? "",
        })),
        tools: tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.schema,
          },
        })),
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      throw new Error(`LLM request failed: ${await res.text()}`);
    }

    const data = await res.json();
    const choice = data.choices[0];
    const msg = choice.message;

    return {
      content: msg.content ?? "",
      toolCalls: (msg.tool_calls ?? []).map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      })),
    };
  }
}

class Agent {
  private history: Message[] = [];

  constructor(
    private model: OpenAICompatClient,
    private tools: Tool[],
    private systemPrompt: string
  ) {
    this.history = [{ role: "user", content: systemPrompt }];
  }

  private buildToolMap() {
    return Object.fromEntries(this.tools.map((tool) => [tool.name, tool]));
  }

  async run(userInput: string): Promise<string> {
    this.history.push({ role: "user", content: userInput });

    while (true) {
      const llmRes = await this.model.chat(this.history, this.tools);

      if (llmRes.toolCalls && llmRes.toolCalls.length > 0) {
        const toolMap = this.buildToolMap();

        this.history.push({
          role: "assistant",
          content: llmRes.content || "",
        });

        for (const call of llmRes.toolCalls) {
          const tool = toolMap[call.name];
          if (!tool) {
            this.history.push({
              role: "tool",
              tool_call_id: call.id,
              name: call.name,
              content: `Tool not found: ${call.name}`,
            });
            continue;
          }

          const result = await tool.run(call.arguments);

          this.history.push({
            role: "tool",
            tool_call_id: call.id,
            name: tool.name,
            content: result,
          });
        }

        continue;
      }

      this.history.push({
        role: "assistant",
        content: llmRes.content,
      });

      return llmRes.content;
    }
  }
}

const weatherTool: Tool = {
  name: "get_weather",
  description: "Get weather for a city",
  schema: {
    type: "object",
    properties: {
      city: { type: "string" },
    },
    required: ["city"],
  },
  async run({ city }) {
    return `The weather in ${city} is 24°C and sunny.`;
  },
};

(async () => {
  const client = new OpenAICompatClient(
    process.env.OPENAI_API_KEY!,
    "https://api.openai.com/v1",
    "gpt-4o-mini"
  );

  const agent = new Agent(client, [weatherTool], "You are a helpful assistant.");
  const answer = await agent.run("帮我看一下北京的天气");
  console.log(answer);
})();
```

这个版本已经覆盖了项目里最重要的两件事：

- system prompt 组装
- LLM + tool call 循环

---

## 4. Python 最小可运行版本

```python
import json
import os
from typing import Any, Dict, List


class Tool:
    def __init__(self, name: str, description: str, schema: Dict[str, Any], func):
        self.name = name
        self.description = description
        self.schema = schema
        self.func = func


class OpenAIClient:
    def __init__(self, api_key: str, base_url: str, model: str):
        self.api_key = api_key
        self.base_url = base_url
        self.model = model

    def chat(self, messages: List[Dict[str, str]], tools: List[Tool]):
        import requests

        payload = {
            "model": self.model,
            "messages": messages,
            "tools": [
                {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.schema,
                    },
                }
                for tool in tools
            ],
            "temperature": 0.2,
        }

        resp = requests.post(
            f"{self.base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()
        choice = data["choices"][0]
        msg = choice["message"]

        tool_calls = []
        for tc in msg.get("tool_calls", []):
            tool_calls.append({
                "id": tc["id"],
                "name": tc["function"]["name"],
                "arguments": json.loads(tc["function"]["arguments"]),
            })

        return {
            "content": msg.get("content", ""),
            "tool_calls": tool_calls,
        }


class Agent:
    def __init__(self, model: OpenAIClient, tools: List[Tool], system_prompt: str):
        self.model = model
        self.tools = tools
        self.system_prompt = system_prompt
        self.history = [{"role": "user", "content": system_prompt}]

    def run(self, user_input: str) -> str:
        self.history.append({"role": "user", "content": user_input})

        while True:
            llm_res = self.model.chat(self.history, self.tools)

            if llm_res["tool_calls"]:
                self.history.append({"role": "assistant", "content": llm_res["content"]})

                tool_map = {tool.name: tool for tool in self.tools}
                for call in llm_res["tool_calls"]:
                    tool = tool_map.get(call["name"])
                    if tool is None:
                        self.history.append({
                            "role": "tool",
                            "tool_call_id": call["id"],
                            "name": call["name"],
                            "content": f"Tool not found: {call['name']}",
                        })
                        continue

                    result = tool.func(**call["arguments"])
                    self.history.append({
                        "role": "tool",
                        "tool_call_id": call["id"],
                        "name": tool.name,
                        "content": str(result),
                    })

                continue

            self.history.append({"role": "assistant", "content": llm_res["content"]})
            return llm_res["content"]


def get_weather(city: str) -> str:
    return f"The weather in {city} is 24°C and sunny."


weather_tool = Tool(
    name="get_weather",
    description="Get weather for a city",
    schema={
        "type": "object",
        "properties": {
            "city": {"type": "string"}
        },
        "required": ["city"]
    },
    func=get_weather,
)


if __name__ == "__main__":
    client = OpenAIClient(
        api_key=os.environ["OPENAI_API_KEY"],
        base_url="https://api.openai.com/v1",
        model="gpt-4o-mini"
    )
    agent = Agent(client, [weather_tool], "You are a helpful assistant.")
    print(agent.run("帮我看一下北京的天气"))
```

---

## 5. 这个项目架构里最关键的设计思路

### 5.1 System Prompt 分层

项目里不是只有一个大 prompt，而是：

- 默认 system prompt
- project-level SYSTEM.md
- APPEND_SYSTEM.md
- AGENTS.md / CLAUDE.md
- skills description
- 当前工作目录上下文

也就是说，你做自己的 agent 时，最好不要把所有内容压成一个字符串，而是分层拼接。

### 5.2 Tools 是统一接口

所有工具都应该遵循统一规范：

```ts
{
  name: "tool_name",
  description: "...",
  schema: {...},
  run: async (args) => "result"
}
```

这样模型就像“选择功能”一样调用工具。

### 5.3 Memory 是要管理的，不是天然存在的

真正生产级 agent 要考虑：

- 当前会话消息历史
- 老消息压缩总结
- 任务状态
- 会话树 / 分支
- tool output 的上下文管理

这是项目里 compaction 的核心意义。

---

## 6. 推荐实现顺序

### 阶段 1：单轮 Agent

- user message
- model answer
- 不带 tool

### 阶段 2：Tool Agent

- model decides to call tool
- run tool
- feed result back
- continue until final answer

### 阶段 3：Session Memory

- 保存历史
- 做简短 summary
- handle long conversations

### 阶段 4：工程化产品

- CLI
- config 文件
- 自定义 skills
- JSONL session storage
- compaction

---

## 7. 你自己真正要做的事

如果你想学得扎实，我建议你遵循这个路线：

1. 先实现一个最小 Agent
2. 让它能调用一个工具
3. 让它能维护 history
4. 再研究 Pi 的 session / compaction / system prompt 分层设计
5. 最后实现一个 CLI version

这条路线基本就是从“原型”走向“工程系统”的路径。

---

## 8. 一句话总结

最接近真正项目工程的 agent 设计，不是“把模型当成聊天机器人”，而是：

- 模型负责决策
- 工具负责动作
- 会话负责记忆
- 事件和状态负责控制流

这正是 Pi 这个项目最有价值的地方。

---

## 9. 进一步建议

如果你准备继续做项目，我建议你下一步直接做下面其中一个：

- TypeScript 版：适合做 CLI / TUI / 工程化 agent
- Python 版：适合做研究原型 / 自动化脚本 / 数据处理 agent

我更建议你先做 TypeScript 版本，因为它更接近真实的软件工程结构。

---

## 10. 最后：你可以如何继续深入

如果你愿意，我下一步可以直接为你输出：

1. 一个真实可运行的 TypeScript Agent 项目目录结构
2. 一个最小的 package.json + tsconfig + src 文件
3. 一个 Python 版的完整工程骨架
4. 一个可运行的 CLI 版本，支持输入命令和工具调用

如果你要，我可以继续直接生成这份可执行代码文件。
