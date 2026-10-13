# MyAgent

MyAgent 是一个基于 TypeScript 的本地 Agent 原型，支持 CLI 和 React 客户端。它通过 OpenAI Chat Completions 兼容接口调用模型，并提供工具调用、技能加载、会话记忆和多种 Agent 模式。

## 功能

- ReAct、Plan-Execute、Multi-Agent Supervisor
- 自动加载 `src/agents/agentMode` 下的 Agent 模式
- 自动加载 `src/tools` 下的工具
- 基于 `previousId` 的会话分支、回滚和 JSONL 持久化
- React + Vite 客户端：左侧会话列表、历史选择、Agent 模式切换
- 工具风险控制和本地演示模式

## 环境要求

- Node.js 22+
- npm
- OpenAI 或其他 OpenAI 兼容服务的 API Key（可选；没有 Key 时使用演示模型）

## 快速开始

```powershell
npm install
```

在项目根目录创建 `.env`：

```dotenv
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
AGENT_MODE=react
CONTEXT_WINDOW_TOKENS=8192
```

启动 CLI：

```powershell
npm run dev
```

启动客户端和 API：

```powershell
npm run frontend:dev
```

然后打开 <http://localhost:5173>。Vite 将 `/api` 请求代理到 `http://localhost:8787`。

没有配置 `OPENAI_API_KEY` 时，API 会返回本地演示回复，不会访问外部模型。

## 客户端会话

客户端左侧显示当前 Agent 模式的历史会话。每条会话默认使用首条用户消息生成标题，点击标题即可加载该节点及其祖先链；点击 **New task** 会创建新的会话根节点。

相关接口：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/api/health` | 检查服务状态和可用模式 |
| `GET` | `/api/sessions?mode=react` | 获取会话列表和当前历史消息 |
| `POST` | `/api/sessions/select` | 选择会话，`conversationId: null` 表示新任务 |
| `POST` | `/api/chat` | 执行一次 Agent 请求 |

会话文件默认保存在 `.myagent/sessions/`。CLI 可通过 `SESSION_MEMORY_FILE` 指定持久化文件。

## Agent 模式

模式定义放在 `src/agents/agentMode` 下，支持子目录。工厂会在启动时自动扫描并注册导出的 `agentMode`：

```ts
import type { AgentContext, AgentStrategy } from "../../types.ts";
import type { AgentModeDefinition } from "../agentRegistry.ts";

class ReflectionAgent implements AgentStrategy {
  async run(context: AgentContext) {
    context.memory.addUserMessage(context.userInput);
    const response = await context.model.chat(context.memory.getHistory(), context.tools.list());
    const answer = response.content || "No response.";
    context.memory.addAssistantMessage(answer);
    return answer;
  }
}

export const agentMode: AgentModeDefinition = {
  mode: "reflection",
  create: () => new ReflectionAgent(),
};
```

新增模式后重启程序即可使用：

```powershell
npm run dev -- --mode=reflection "分析这个方案"
```

不需要修改 `agentFactory.ts`，也不需要手动调用注册函数。

## 工具和技能

在 `src/tools` 中导出符合 `Tool` 类型的对象，启动时会自动注册。当前包含天气查询、文件创建/修改和 Shell 命令工具。

技能目录支持：

- `.pi/skills`
- `.agents/skills`
- `skills`

每个技能目录包含带 YAML frontmatter 的 `SKILL.md`。CLI 中可用 `/skills` 查看技能，使用 `/skill:<name> <task>` 指定技能。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 使用 `tsx` 启动 CLI |
| `npm run dev:watch` | 监听源码并自动重启 |
| `npm run build` | 编译后端到 `dist/` |
| `npm start` | 运行编译后的 CLI |
| `npm run frontend:build` | 构建 React 客户端 |
| `npm run frontend:preview` | 预览前端生产构建 |

## 项目结构

```text
src/
├─ agents/agentMode/       # Agent 模式定义
├─ memory/                  # 会话记忆和分支管理
├─ model_client/            # OpenAI 兼容客户端
├─ prompt_builder/          # Prompt 组装
├─ runtime/                 # CLI 和 HTTP API
├─ tool_registry/           # 工具注册表
└─ tools/                   # 内置工具
client/                     # React + Vite 客户端
```

## CI

GitHub Actions 配置位于 `.github/workflows/test.yml`，会执行依赖安装、后端 TypeScript 构建、前端构建和冒烟测试。测试使用 Mock 模型，不需要 API Key。

请勿将真实 API Key 或 Token 提交到 Git 仓库。
