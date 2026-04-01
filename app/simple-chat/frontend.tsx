import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

interface Conversation {
  id: string;
  sessionId: string;
  title: string | null;
  createdAt: number;
}

interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

interface ConversationWithMessages extends Conversation {
  messages: Message[];
}

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  return res.json();
}

function formatTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function BrainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z" />
      <path d="M9 21h6" />
      <path d="M10 17v4" />
      <path d="M14 17v4" />
      <path d="M12 2v3" />
      <path d="M8 5l1.5 2" />
      <path d="M16 5l-1.5 2" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" />
      <path d="M22 2L15 22L11 13L2 9L22 2Z" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function MessageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api<Conversation[]>("/api/conversations").then(setConversations);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeId]);

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
    }
  }, [input]);

  async function loadConversation(id: string) {
    const data = await api<ConversationWithMessages>(`/api/conversations/${id}`);
    setActiveId(id);
    setMessages(data.messages);
  }

  async function newChat() {
    const conv = await api<Conversation>("/api/conversations", { method: "POST" });
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setMessages([]);
    inputRef.current?.focus();
  }

  async function sendMessage() {
    if (!input.trim() || loading || !activeId) return;

    const content = input.trim();
    setInput("");
    setLoading(true);

    const tempUserMsg: Message = {
      id: "temp-" + Date.now(),
      conversationId: activeId,
      role: "user",
      content,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    const conv = conversations.find((c) => c.id === activeId);
    if (conv && !conv.title) {
      setConversations((prev) =>
        prev.map((c) => (c.id === activeId ? { ...c, title: content.slice(0, 80) } : c))
      );
    }

    try {
      const assistantMsg = await api<Message>(`/api/conversations/${activeId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: "err-" + Date.now(),
          conversationId: activeId,
          role: "assistant",
          content: "Something went wrong. Check the server logs.",
          createdAt: Date.now(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  const activeConv = conversations.find((c) => c.id === activeId);

  return (
    <div className="flex h-full bg-[#0a0a0f] text-zinc-100">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? "w-72" : "w-0"
        } flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden bg-[#111118] flex flex-col`}
        style={{ borderRight: sidebarOpen ? "1px solid rgba(255,255,255,0.06)" : "none" }}
      >
        {/* Sidebar header */}
        <div className="p-4 flex-shrink-0">
          <div className="flex items-center gap-2.5 mb-5 px-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <BrainIcon className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-wide text-zinc-200">Brain</span>
          </div>
          <button
            onClick={newChat}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium
              bg-gradient-to-r from-violet-600/80 to-indigo-600/80 hover:from-violet-500/90 hover:to-indigo-500/90
              text-white shadow-lg shadow-violet-600/15 transition-all duration-200 active:scale-[0.98]"
          >
            <PlusIcon className="w-4 h-4" />
            New Chat
          </button>
        </div>

        {/* Conversations list */}
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {conversations.length > 0 && (
            <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              Recent
            </p>
          )}
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => loadConversation(conv.id)}
              className={`group w-full text-left px-3 py-2.5 rounded-lg text-sm truncate transition-all duration-150 flex items-center gap-2.5 mb-0.5 ${
                conv.id === activeId
                  ? "bg-white/[0.07] text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
              }`}
            >
              <MessageIcon className={`w-3.5 h-3.5 flex-shrink-0 ${
                conv.id === activeId ? "text-violet-400" : "text-zinc-600 group-hover:text-zinc-500"
              }`} />
              <span className="truncate">{conv.title || "New conversation"}</span>
              <span className={`ml-auto text-[10px] flex-shrink-0 ${
                conv.id === activeId ? "text-zinc-500" : "text-zinc-700"
              }`}>
                {formatTime(conv.createdAt)}
              </span>
            </button>
          ))}
          {conversations.length === 0 && (
            <div className="text-center py-8">
              <MessageIcon className="w-8 h-8 text-zinc-800 mx-auto mb-2" />
              <p className="text-xs text-zinc-700">No conversations yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div
          className="h-14 flex items-center px-5 gap-4 flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-zinc-600 hover:text-zinc-300 transition-colors p-1 rounded-md hover:bg-white/[0.05]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          {activeConv && (
            <>
              <span className="text-sm text-zinc-400 truncate">
                {activeConv.title || "New conversation"}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(activeConv.sessionId);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.04] transition-colors"
                title={`Session: ${activeConv.sessionId}`}
              >
                <span className="text-zinc-700">session:</span>
                {activeConv.sessionId.slice(0, 8)}
                <span className="text-[10px]">{copied ? "copied!" : ""}</span>
              </button>
            </>
          )}
        </div>

        {!activeId ? (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-600/20 flex items-center justify-center mx-auto mb-6 ring-1 ring-violet-500/10">
                <BrainIcon className="w-10 h-10 text-violet-400/60" />
              </div>
              <h2 className="text-xl font-semibold text-zinc-300 mb-2">Brain Chat</h2>
              <p className="text-zinc-600 text-sm mb-6 max-w-xs mx-auto">
                Start a conversation with the Brain agent. It reasons, remembers, and learns.
              </p>
              <button
                onClick={newChat}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium
                  bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500
                  text-white shadow-lg shadow-violet-600/20 transition-all duration-200 active:scale-[0.98]"
              >
                <PlusIcon className="w-4 h-4" />
                New Chat
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Messages area */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
                {messages.length === 0 && !loading && (
                  <div className="text-center py-16">
                    <p className="text-zinc-700 text-sm">Send a message to begin</p>
                  </div>
                )}
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-md shadow-violet-500/15">
                        <BrainIcon className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed whitespace-pre-wrap ${
                        msg.role === "user"
                          ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-600/10"
                          : "bg-white/[0.04] text-zinc-300 ring-1 ring-white/[0.06]"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-md shadow-violet-500/15">
                      <BrainIcon className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="bg-white/[0.04] ring-1 ring-white/[0.06] rounded-2xl px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                        <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" style={{ animationDelay: "200ms" }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" style={{ animationDelay: "400ms" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input area */}
            <div className="flex-shrink-0 px-6 pb-6 pt-2">
              <div
                className="max-w-3xl mx-auto rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.08] hover:ring-white/[0.12] focus-within:ring-violet-500/30 transition-all duration-200 flex items-end gap-2 p-2"
              >
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Message Brain..."
                  rows={1}
                  disabled={loading}
                  className="flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none disabled:opacity-40 min-h-[40px] max-h-[160px]"
                />
                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                  className="p-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-20 disabled:hover:from-violet-600 disabled:hover:to-indigo-600 transition-all duration-200 active:scale-95 flex-shrink-0"
                >
                  <SendIcon className="w-4 h-4 text-white" />
                </button>
              </div>
              <p className="text-center text-[10px] text-zinc-800 mt-2">
                Brain uses reasoning loops and a knowledge graph to respond
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
