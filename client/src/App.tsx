import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { chatWithAgent, fetchHealth, fetchSessions, selectSession, type HealthResponse, type SessionState, type SessionSummary } from "./api";

type ChatMessage = { id: number; role: "user" | "assistant"; content: string };

const initialMessage: ChatMessage = {
  id: 1,
  role: "assistant",
  content: "你好，我是 MyAgent。告诉我你想完成什么，我会在当前工作区里帮你拆解并执行。",
};

const starterPrompts = [
  { icon: "⌘", title: "阅读项目结构", prompt: "帮我快速了解这个项目的结构和主要入口" },
  { icon: "✦", title: "制定实现计划", prompt: "为一个新功能制定清晰的实现计划" },
  { icon: "⌁", title: "检查代码问题", prompt: "帮我检查当前项目里可能存在的问题" },
];

function modeLabel(mode: string): string {
  return mode.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("react");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [status, setStatus] = useState<"connecting" | "ready" | "demo" | "error">("connecting");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchHealth()
      .then(async (value) => {
        setHealth(value);
        const nextMode = value.modes.includes(mode) ? mode : value.modes[0] ?? "react";
        setMode(nextMode);
        setStatus(value.demo ? "demo" : "ready");
        applySessionState(await fetchSessions(nextMode));
      })
      .catch(() => setStatus("error"));
  // The initial health request also hydrates the active mode's persisted session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  function applySessionState(state: SessionState) {
    setSessions(state.sessions);
    setActiveSessionId(state.activeId);
    setMessages(state.messages.length > 0
      ? state.messages.map((message, index) => ({ ...message, id: index + 1 }))
      : [initialMessage]);
  }

  async function newTask() {
    try {
      applySessionState(await selectSession(mode, null));
    } catch {
      setMessages([initialMessage]);
      setActiveSessionId(null);
    }
    setInput("");
    inputRef.current?.focus();
  }

  function changeMode(nextMode: string) {
    setMode(nextMode);
    void fetchSessions(nextMode)
      .then(applySessionState)
      .catch(() => {
        setMessages([initialMessage]);
        setSessions([]);
        setActiveSessionId(null);
      });
  }

  function selectExistingSession(conversationId: number) {
    void selectSession(mode, conversationId)
      .then(applySessionState)
      .catch(() => setStatus("error"));
  }

  async function submitMessage(event?: FormEvent) {
    event?.preventDefault();
    const content = input.trim();
    if (!content || loading) return;

    setInput("");
    setMessages((current) => [...current, { id: Date.now(), role: "user", content }]);
    setLoading(true);

    try {
      const data = await chatWithAgent(content, mode);
      if (data.reply) {
        setMessages((current) => [...current, { id: Date.now() + 1, role: "assistant", content: data.reply! }]);
      }
      applySessionState(await fetchSessions(mode));
    } catch (error) {
      const message = error instanceof Error ? error.message : "请求失败";
      setMessages((current) => [
        ...current,
        { id: Date.now() + 1, role: "assistant", content: `暂时无法完成请求：${message}` },
      ]);
      setStatus("error");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitMessage();
    }
  }

  const statusLabel = { connecting: "Connecting", ready: "Connected", demo: "Demo mode", error: "Offline" }[status];
  const isEmpty = activeSessionId === null && messages.length === 1 && messages[0] === initialMessage;
  const activeSessionTitle = sessions.find((session) => session.id === activeSessionId)?.title ?? "New task";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand-mark">✦</div>
          <span className="brand-name">MyAgent</span>
          <button className="icon-button sidebar-toggle" aria-label="Collapse sidebar">‹</button>
        </div>
        <button className="new-task-button" onClick={newTask}><span>＋</span> New task <kbd>⌘ K</kbd></button>
        <nav className="sidebar-nav" aria-label="Workspace navigation">
          <div className="nav-item active"><span>◌</span> Current session</div>
          <div className="nav-item"><span>▱</span> All conversations</div>
          <div className="nav-item"><span>⚙</span> Settings</div>
        </nav>
        <div className="sidebar-section">
          <div className="sidebar-section-title">WORKSPACE</div>
          <div className="workspace-card"><div className="workspace-icon">M</div><div><strong>MyAgent</strong><small>Local project</small></div><span className="chevron">⌄</span></div>
        </div>
        <div className="sidebar-section recent-section">
          <div className="sidebar-section-title">RECENT TASKS</div>
          <div className="recent-list">
            {sessions.length === 0
              ? <div className="recent-empty">No conversations yet</div>
              : [...sessions].reverse().map((session) => (
                <button
                  className={`recent-item ${activeSessionId === session.id ? "active" : ""}`}
                  key={session.id}
                  onClick={() => selectExistingSession(session.id)}
                  title={session.title}
                >
                  <span className="recent-icon">•</span><span>{session.title}</span>
                </button>
              ))}
          </div>
        </div>
        <div className="sidebar-bottom"><div className={`status-dot ${status}`} /><div><strong>{statusLabel}</strong><small>{health?.model ?? "local agent"}</small></div><button className="icon-button" aria-label="More options">•••</button></div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumbs"><span>MyAgent</span><b>/</b><strong>{activeSessionTitle}</strong></div>
          <div className="topbar-actions"><span className="connection-pill"><i className={`status-dot ${status}`} /> {statusLabel}</span><button className="top-icon" aria-label="Share">↗</button><button className="top-icon" aria-label="More options">•••</button></div>
        </header>

        <section className="conversation" ref={scrollRef}>
          {isEmpty && <div className="hero"><div className="hero-orb">✦</div><div className="eyebrow">LOCAL AGENT WORKSPACE</div><h1>What are we building?</h1><p>Ask questions, inspect files, or hand over the next task.</p><div className="starter-grid">{starterPrompts.map((item) => <button className="starter-card" key={item.title} onClick={() => { setInput(item.prompt); inputRef.current?.focus(); }}><span className="starter-icon">{item.icon}</span><span><strong>{item.title}</strong><small>{item.prompt}</small></span><b>→</b></button>)}</div></div>}
          <div className="message-list">
            {messages.map((message) => <article className={`message ${message.role}`} key={message.id}><div className={`message-avatar ${message.role}`}>{message.role === "assistant" ? "✦" : "你"}</div><div className="message-content"><div className="message-author">{message.role === "assistant" ? "MyAgent" : "You"}</div><div className="message-text">{message.content}</div></div></article>)}
            {loading && <article className="message assistant"><div className="message-avatar assistant">✦</div><div className="message-content"><div className="message-author">MyAgent</div><div className="typing"><span /><span /><span /></div></div></article>}
          </div>
        </section>

        <div className="composer-wrap">
          <form className="composer" onSubmit={submitMessage}>
            <textarea ref={inputRef} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleKeyDown} placeholder="Ask MyAgent anything..." rows={1} aria-label="Ask MyAgent anything" />
            <div className="composer-toolbar"><div className="composer-tools"><button type="button" className="tool-button" aria-label="Attach file">＋</button><label className="mode-select"><span>Mode</span><select value={mode} onChange={(event) => changeMode(event.target.value)}>{(health?.modes ?? ["react"]).map((availableMode) => <option key={availableMode}>{availableMode}</option>)}</select></label><span className="mode-hint">{modeLabel(mode)}</span></div><div className="composer-submit"><span>↵ to send</span><button type="submit" disabled={loading || !input.trim()} aria-label="Send message">↑</button></div></div>
          </form>
          <div className="composer-caption">MyAgent can read and modify files in this workspace. Review tool actions before running them.</div>
        </div>
      </main>
    </div>
  );
}
