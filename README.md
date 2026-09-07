# MyAgent

MyAgent 是一个基于 TypeScript 的最小 Agent 原型，用于学习 LLM、工具调用和 Agent 工作流的基本实现。项目通过 OpenAI Chat Completions 兼容接口访问模型，并提供 CLI 交互入口。

当前包含以下能力：

- ReAct Agent：模型和工具之间循环执行，直到得到最终回答
- Plan-Execute Agent：先生成步骤，再逐步执行
- Multi-Agent Supervisor：使用规划者和工作者协作完成任务
- Session memory：在一次 CLI 运行期间保留多轮对话历史，并支持按会话编号回滚
- 输入队列：模型请求期间仍可输入消息，消息会在下一次模型调用前加入会话
- 动态工具加载：启动时自动扫描并注册 `src/tools` 下的工具
- 内置天气查询、读取/创建/修改文件和执行 shell 命令工具

## 环境要求

- Node.js 22 或更高版本
- npm
- 一个 OpenAI 或 OpenAI 兼容服务的 API Key

## 快速开始

### 1. 安装依赖

```powershell
npm install
```

### 2. 配置环境变量

项目使用 Node.js 的 `--env-file=.env` 自动加载 `.env`。仓库当前没有 `.env.example`，请在项目根目录创建 `.env`，至少配置：

```dotenv
MODEL_PROVIDER=openai
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
CONTEXT_WINDOW_TOKENS=8192
```

如果使用其他 OpenAI 兼容服务，只需要替换 `OPENAI_BASE_URL` 和 `OPENAI_MODEL`。

也可以使用 GitHub Models：

```dotenv
MODEL_PROVIDER=github
GITHUB_TOKEN=your_github_token_here
GITHUB_BASE_URL=https://models.inference.ai.azure.com
GITHUB_MODEL=openai/gpt-4o-mini
```

`CONTEXT_WINDOW_TOKENS` 用于限制每次发送给模型的上下文大小，默认值为 `8192`。项目会优先保留系统提示和最近的消息，并在每次请求后显示本次发送上下文的估算 token 数；该数值基于文本长度估算，不等同于服务商的精确计费 token。

不要把真实 API Key 或 Token 提交到 Git 仓库。

### 3. 启动

启动交互模式：

```powershell
npm run dev
```

开发时使用热重载：

```powershell
npm run dev:watch
```

修改 `src` 下的 TypeScript 文件后，Node 会自动重启 Agent 进程。按 `Ctrl+C` 停止监听。

启动后可以连续输入多条消息。模型处理期间输入的消息会进入队列，并在下一次模型调用前写入会话，不会并发启动多个 Agent。输入 `exit` 或 `quit`，或者按 `Ctrl+C` 退出。

交互模式中可以使用以下会话命令：

- `/help`：查看 CLI 命令、提示和补全说明
- `/tools`：查看当前已注册工具
- `/history`：查看每条会话的编号和上一条会话编号
- `/rollback <编号>`：回滚到指定会话，之后的新消息从该会话继续

CLI 的交互层位于 `src/runtime/interactiveCli.ts`，负责命令处理、提示、Tab 补全和运行中的输入队列；`src/runtime/cli.ts` 只负责初始化配置、模型客户端、工具注册、memory 和 Agent 策略。

也可以执行单次请求：

```powershell
npm run dev -- "帮我看一下北京的天气"
```

### 4. 选择 Agent 模式

```powershell
npm run dev -- --mode=react "查询北京天气"
npm run dev -- --mode=plan_execute "帮我制定一个学习计划"
npm run dev -- --mode=multi_agent "分析这个问题并给出方案"
```

也可以在 `.env` 中设置默认模式：

```dotenv
AGENT_MODE=react
```

可选值为 `react`、`plan_execute` 和 `multi_agent`。

Agent 模式由 `agentFactory` 通过注册表创建。项目内置的 Agent 会在各自文件中主动注册自己，因此新增模式时不需要在工厂里写 `switch` 分支。

## 项目结构

```text
src/
├── index.ts                         # 程序入口，捕获并输出运行错误
├── config.ts                        # 模型、Provider 和 Agent 配置
├── types.ts                         # Message、Tool、Agent 等核心类型
├── agents/
│   ├── agentFactory.ts              # Agent 工厂入口，按模式创建已注册 Agent
│   ├── agentRegistry.ts             # Agent 模式注册表
│   ├── reactAgent.ts                # ReAct 工具调用循环，并注册 react 模式
│   ├── planExecuteAgent.ts          # 规划-执行流程，并注册 plan_execute 模式
│   └── multiAgent/
│       └── supervisor.ts            # 多 Agent 协作流程，并注册 multi_agent 模式
├── memory/
│   └── sessionMemory.ts             # 当前会话的消息历史
├── model_client/
│   └── openaiCompatClient.ts        # OpenAI 兼容模型客户端
├── prompt_builder/
│   └── promptBuilder.ts             # 系统 Prompt 组装
├── tool_registry/
│   └── toolRegistry.ts              # 工具注册、查询和列表管理
├── tools/
│   ├── weatherTool.ts               # 模拟天气查询
│   ├── writeTool.ts                 # 创建文件并写入内容
│   └── shellTool.ts                 # 执行 shell 命令
└── runtime/
      └── cli.ts                       # CLI 参数解析和交互循环
```

## 运行流程

```text
用户输入
    │
    ▼
CLI runtime
    │
    ├── 扫描并动态加载 src/tools/*
    ├── 创建模型客户端、Prompt 和 Session memory
    └── 根据 Agent 模式执行任务
               │
               ▼
         LLM 请求
               │
               ├── 返回工具调用 → ToolRegistry 查找并执行工具 → 结果写回 memory
               └── 返回普通文本 → 输出给用户
```

## 内置工具

### `get_weather`

根据城市名返回天气信息。目前返回的是用于演示的固定结果。

### `create_file`

创建文件并写入完整内容，参数如下：

```json
{
   "filePath": "notes/hello.txt",
   "content": "这是我的第一份笔记"
}
```

父目录会自动创建；如果目标文件已经存在，工具会拒绝覆盖。

### `edit_file`

修改已有文件时，Agent 会先读取文件，再使用 `edit_file` 按唯一的 `oldText` 替换为 `newText`：

```json
{
   "filePath": "helloworld.py",
   "oldText": "print('hello')",
   "newText": "print('hello, agent')"
}
```

为了避免误修改，`oldText` 必须在文件中恰好匹配一次。

### `run_shell_command`

执行 shell 命令，参数如下：

```json
{
   "command": "npm run build",
   "cwd": ".",
   "timeout": 30000
}
```

该工具能够执行任意命令，只应在可信环境中启用。

## 添加新工具

在 `src/tools` 下创建一个 TypeScript 文件，并导出符合 `Tool` 类型的对象：

```ts
import type { Tool } from "../types.ts";

export const demoTool: Tool = {
   name: "demo",
   description: "演示工具",
   schema: {
      type: "object",
      properties: {},
   },
   async run(): Promise<string> {
      return "执行成功";
   },
};
```

重新启动 CLI 后，工具会被自动发现并注册，不需要修改 `cli.ts`。

## 添加新 Agent 模式

每个 Agent 模式实现 `AgentStrategy` 接口，并在自己的文件中主动注册到 Agent 注册表。

例如新增 `reflection` 模式：

```ts
import type { AgentContext, AgentStrategy } from "../types.ts";
import { registerAgent } from "./agentRegistry.ts";

export class ReflectionAgent implements AgentStrategy {
   async run(context: AgentContext): Promise<string> {
      context.memory.addUserMessage(context.userInput);
      const response = await context.model.chat(
         context.memory.getHistory(),
         context.tools.list(),
      );

      const finalText = response.content || "No response.";
      context.memory.addAssistantMessage(finalText);
      return finalText;
   }
}

registerAgent("reflection", () => new ReflectionAgent());
```

然后在 `src/agents/agentFactory.ts` 中导入一次该文件，让模块加载时执行注册逻辑：

```ts
import "./reflectionAgent.ts";
```

之后即可通过命令行选择该模式：

```powershell
npm run dev -- --mode=reflection "分析这个方案并给出改进建议"
```

`agentFactory.ts` 只负责创建已注册的 Agent：

```ts
export function createAgent(mode: AgentMode = "react"): AgentStrategy {
   return createRegisteredAgent(mode);
}
```

这种方式把模式声明放在 Agent 自己的文件里，工厂只依赖注册表，不再随着模式增加而不断扩展 `switch`。

## 构建和生产运行

编译 TypeScript：

```powershell
npm run build
```

运行编译后的 JavaScript：

```powershell
npm start
```

## npm 脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 使用 `tsx` 直接运行 TypeScript，并进入 CLI 交互模式 |
| `npm run build` | 将 `src` 编译到 `dist` |
| `npm start` | 运行 `dist/index.js` |

## Skills

MyAgent supports Pi-style skills. A skill is a directory containing a `SKILL.md` file with YAML frontmatter and Markdown instructions.

Supported skill roots:

- `.pi/skills`
- `.agents/skills`
- `skills`

Minimal skill format:

```markdown
---
name: typescript-coding
description: Use when implementing, refactoring, or reviewing TypeScript code in this project.
---

# TypeScript Coding

Follow the existing project style before introducing new abstractions.
```

Rules:

- `description` is required.
- `name` should match `^[a-z0-9][a-z0-9_-]{0,63}$`.
- If `name` is omitted, the skill directory name is used.
- `disable-model-invocation: true` keeps the skill out of automatic model selection but still allows manual use.

Runtime behavior:

- At startup, MyAgent scans skill roots and loads every `SKILL.md`.
- The system prompt receives only skill names, descriptions, and `skill://...` read paths.
- The model can call `read_file` with `skill://<name>/SKILL.md` to inspect a skill before applying it.
- In interactive mode, use `/skills` to list skills.
- Use `/skill:<name> <task>` to force the next task to use a specific skill.

## Session Persistence

Conversation memory is saved locally as JSON Lines.

Default path:

```text
.myagent/sessions/session-<timestamp>.jsonl
```

You can override it with:

```dotenv
SESSION_MEMORY_FILE=.myagent/sessions/current.jsonl
```

Each line is one conversation node shaped like `ConversationRecord`:

```json
{"id":1,"previousId":null,"userInput":"hello","messages":[{"role":"user","content":"hello"},{"role":"assistant","content":"hi"}]}
```

The file is rewritten after each memory change so each node appears once with its latest messages. Rollback rewrites the file to keep only the remaining nodes.

### Loading an existing session

To continue a previous session, start MyAgent with the same `SESSION_MEMORY_FILE` path:

```dotenv
SESSION_MEMORY_FILE=.myagent/sessions/current.jsonl
```

On startup, `SessionMemory` reads that JSONL file, restores each conversation node, and sets the next node id to `max(existing id) + 1`. If the file does not exist, MyAgent starts with an empty session and creates the file after the first memory write.

Session writes are asynchronous and serialized in memory. `SessionMemory.flush()` waits for pending writes; the CLI calls it after one-shot runs and before interactive shutdown, so the latest conversation nodes are durable before exit.
