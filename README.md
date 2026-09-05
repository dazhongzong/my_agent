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
```

如果使用其他 OpenAI 兼容服务，只需要替换 `OPENAI_BASE_URL` 和 `OPENAI_MODEL`。

也可以使用 GitHub Models：

```dotenv
MODEL_PROVIDER=github
GITHUB_TOKEN=your_github_token_here
GITHUB_BASE_URL=https://models.inference.ai.azure.com
GITHUB_MODEL=openai/gpt-4o-mini
```

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

- `/history`：查看每条会话的编号和上一条会话编号
- `/rollback <编号>`：回滚到指定会话，之后的新消息从该会话继续

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

## 项目结构

```text
src/
├── index.ts                         # 程序入口，捕获并输出运行错误
├── config.ts                        # 模型、Provider 和 Agent 配置
├── types.ts                         # Message、Tool、Agent 等核心类型
├── agents/
│   ├── agentFactory.ts              # 根据模式创建 Agent
│   ├── reactAgent.ts                # ReAct 工具调用循环
│   ├── planExecuteAgent.ts          # 规划-执行流程
│   └── multiAgent/
│       └── supervisor.ts            # 多 Agent 协作流程
├── loop/
│   └── agentLoop.ts                 # 通用 LLM/Tool 循环实现
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
