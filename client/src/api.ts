export type HealthResponse = {
  ok: boolean;
  demo: boolean;
  modes: string[];
  model: string;
};

export type ChatResponse = {
  reply?: string;
  error?: string;
  demo?: boolean;
};

export type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type HistoryResponse = {
  mode: string;
  messages: HistoryMessage[];
};

export type SessionSummary = {
  id: number;
  previousId: number | null;
  title: string;
};

export type SessionState = {
  mode: string;
  activeId: number | null;
  sessions: SessionSummary[];
  messages: HistoryMessage[];
};

async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

export async function fetchHealth(): Promise<HealthResponse> {
  return readJson<HealthResponse>(await fetch("/api/health"));
}

export async function chatWithAgent(message: string, mode: string): Promise<ChatResponse> {
  return readJson<ChatResponse>(await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, mode }),
  }));
}

export async function fetchHistory(mode: string): Promise<HistoryResponse> {
  return readJson<HistoryResponse>(await fetch(`/api/history?mode=${encodeURIComponent(mode)}`));
}

export async function fetchSessions(mode: string): Promise<SessionState> {
  return readJson<SessionState>(await fetch(`/api/sessions?mode=${encodeURIComponent(mode)}`));
}

export async function selectSession(mode: string, conversationId: number | null): Promise<SessionState> {
  return readJson<SessionState>(await fetch("/api/sessions/select", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, conversationId }),
  }));
}
