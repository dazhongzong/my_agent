# MyAgent

MyAgent 是一个基于 TypeScript 的最小 Agent 原型，用于学习 LLM、工具调用和 Agent 工作流的基本实现。项目通过 OpenAI Chat Completions 兼容接口访问模型，并提供 CLI 交互入口。

当前包含以下能力：

- ReAct Agent：模型和工具之间循环执行，直到得到最终回答
- Plan-Execute Agent：先生成步骤，再逐步执行
- Multi-Agent Supervisor：使用规划者和工作者协作完成任务
- Session memory：按 `id` / `previousId` 保存当前会话分支，并支持按会话编号回滚
- 输入队列：模型请求期间仍可输入消息，消息会在下一次模型调用前加入会话
- 动态工具加载：启动时自动扫描并注册 `src/tools` 下的工具
- 动态 Agent 模式加载：工厂自动扫描并注册 `src/agents/agentMode` 下的模式（包括子目录）
- 工具调用风控：工具实际执行前会检查高风险 shell 命令、越界/敏感文件写入，以及配置为禁用的工具；拦截原因会作为 tool result 返回给模型以便重新规划
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

`CONTEXT_WINDOW_TOKENS` 用于限制每次发送给模型的上下文大小，默认值为 `8192`。每次调用模型时，MyAgent 会从当前会话节点沿 `previousId` 回溯到根节点，再按时间顺序发送这条分支上的完整消息；不会使用不属于当前分支的记录，也不会压缩会话内容。若消息总量超出窗口，项目会优先保留系统提示和最近的消息，并在每次请求后显示本次发送上下文的估算 token 数；该数值基于文本长度估算，不等同于服务商的精确计费 token。

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
- `/history`：查看当前保存的会话节点编号及其父节点编号
- `/rollback <编号>`：回滚到指定节点，仅保留该节点及其祖先节点；之后的新消息从该节点继续

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

Agent 模式由 `agentFactory` 自动扫描 `src/agents/agentMode`（包括子目录），加载模块导出的 `agentMode` 定义并注册，再通过注册表创建。新增模式不需要修改工厂，也不需要手动调用 `registerAgent`。

## 项目结构

```text
src/
├── index.ts                         # 程序入口，捕获并输出运行错误
├── config.ts                        # 模型、Provider 和 Agent 配置
├── types.ts                         # Message、Tool、Agent 等核心类型
├── agents/
│   ├── agentFactory.ts              # 自动加载模式，按模式创建已注册 Agent
│   ├── agentRegistry.ts             # Agent 模式注册表
│   ├── agentModeLoader.ts           # 递归扫描、加载和验证模式定义
│   └── agentMode/
│       ├── reactAgent.ts            # ReAct 工具调用循环，导出 react 模式
│       ├── planExecuteAgent.ts      # 规划-执行流程，导出 plan_execute 模式
│       └── multiAgent/
│           └── supervisor.ts        # 多 Agent 协作流程，导出 multi_agent 模式
├── memory/
│   └── sessionMemory.ts             # 当前会话分支、持久化和历史组装
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
    ├── Agent 工厂自动扫描并注册 src/agents/agentMode 下的模式
    ├── 创建模型客户端、Prompt 和 Session memory
    ├── 从当前节点沿 previousId 构建会话分支上下文
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

#### 工具调用风控

所有工具调用都会先经过风控，再进入工具的 `run` 方法。默认会阻止递归/强制删除、磁盘格式化或分区修改、关机重启、不可逆 Git 操作、下载内容直接交给 shell 执行，以及递归修改权限的 shell 命令。文件工具不能读取或写入项目目录以外、`.git` 或 `.env` 文件（`skill://` 路径除外）。

被拦截时，工具不会执行；模型会收到形如 `RISK_CONTROL_BLOCKED: <具体原因>` 的 tool result，并在下一轮重新思考安全替代方案。可通过环境变量禁用动态工具：

```dotenv
RISK_BLOCKED_TOOLS=run_shell_command,send_email
```

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

在 `src/agents/agentMode` 下创建 TypeScript 文件（也可以放在子目录），实现 `AgentStrategy` 接口，并导出名为 `agentMode` 的模式定义。

例如创建 `src/agents/agentMode/reflectionAgent.ts`，新增 `reflection` 模式：

```ts
import type { AgentContext, AgentStrategy } from "../../types.ts";
import type { AgentModeDefinition } from "../agentRegistry.ts";

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

export const agentMode: AgentModeDefinition = {
   mode: "reflection",
   create: () => new ReflectionAgent(),
};
```

重新启动后，工厂会自动发现并注册该模式，不需要修改任何导入列表。之后即可通过命令行选择该模式：

```powershell
npm run dev -- --mode=reflection "分析这个方案并给出改进建议"
```

工厂使用 ESM 顶层 `await` 完成初始化，因此调用者仍可以同步创建 Agent：

```ts
import { createAgent } from "./agents/agentFactory.ts";

const agent = createAgent("reflection");
```

加载规则：

- 开发模式加载 `.ts` 文件，编译后加载对应的 `.js` 文件；排除 `.d.ts`、`.test.*` 和 `.spec.*`。
- 没有导出 `agentMode` 的辅助模块不会注册为模式。
- `agentMode.mode` 必须是非空且唯一的字符串，`agentMode.create` 必须是创建 Agent 的函数；无效定义、重复模式或模块加载失败会中止初始化。
- 模式文件不要导入 `agentFactory.ts`，以免与顶层初始化形成循环依赖；共享类型从 `types.ts` 或 `agentRegistry.ts` 导入。
- 同一进程中工厂只初始化一次；添加或修改模式后需要重启（或使用 `dev:watch`）。

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
| `npm test` | 编译并运行 Agent 自动发现、注册和工具循环测试 |
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

## 会话持久化与上下文

会话记忆以本地 JSON Lines（JSONL）保存。

默认路径：

```text
.myagent/sessions/session-<timestamp>.jsonl
```

可通过环境变量覆盖：

```dotenv
SESSION_MEMORY_FILE=.myagent/sessions/current.jsonl
```

每一行都是一个 `ConversationRecord` 会话节点：

```json
{"id":1,"previousId":null,"userInput":"hello","messages":[{"role":"user","content":"hello"},{"role":"assistant","content":"hi"}]}
```

每次记忆发生变化后，文件都会重写，确保每个节点只保留一行最新内容。当前节点是最新写入的节点；新节点的 `previousId` 指向它的父节点。

构建模型上下文时，MyAgent 从当前节点沿 `previousId` 回溯至根节点，再恢复为时间正序。因此，JSONL 中即使存在不属于当前祖先链的节点，也不会被发送给模型。会话内容不会被压缩；完整分支仍会受 `CONTEXT_WINDOW_TOKENS` 限制。

`/rollback <id>` 会将会话回退到指定节点，并重写 JSONL，仅保留该节点及其祖先链。

### 加载已有会话

要继续此前的会话，请使用同一个 `SESSION_MEMORY_FILE` 路径启动 MyAgent：

```dotenv
SESSION_MEMORY_FILE=.myagent/sessions/current.jsonl
```

启动时，`SessionMemory` 会读取 JSONL，恢复会话节点，并将下一个节点 ID 设为 `max(existing id) + 1`。若文件不存在，则从空会话开始，并在首次写入记忆后创建文件。

会话写入在内存中异步串行化。`SessionMemory.flush()` 会等待待写入任务完成；CLI 会在单次请求结束后和交互式退出前调用它，确保最新会话节点已持久化。
