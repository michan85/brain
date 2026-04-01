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

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load conversations on mount
  useEffect(() => {
    api<Conversation[]>("/api/conversations").then(setConversations);
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when conversation changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeId]);

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

    // Optimistic user message
    const tempUserMsg: Message = {
      id: "temp-" + Date.now(),
      conversationId: activeId,
      role: "user",
      content,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    // Update sidebar title if first message
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
    } catch (err) {
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

  return (
    <div className="flex h-full bg-zinc-950 text-zinc-100">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? "w-64" : "w-0"
        } flex-shrink-0 transition-all duration-200 overflow-hidden border-r border-zinc-800 bg-zinc-900 flex flex-col`}
      >
        <div className="p-3 border-b border-zinc-800">
          <button
            onClick={newChat}
            className="w-full px-3 py-2 rounded-md bg-zinc-700 hover:bg-zinc-600 text-sm font-medium transition-colors"
          >
            + New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => loadConversation(conv.id)}
              className={`w-full text-left px-3 py-2.5 text-sm truncate hover:bg-zinc-800 transition-colors ${
                conv.id === activeId ? "bg-zinc-800 text-white" : "text-zinc-400"
              }`}
            >
              {conv.title || "New conversation"}
            </button>
          ))}
          {conversations.length === 0 && (
            <p className="p-3 text-xs text-zinc-600">No conversations yet</p>
          )}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="h-12 flex items-center px-4 border-b border-zinc-800 gap-3 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-zinc-500 hover:text-zinc-300 text-lg"
          >
            &#9776;
          </button>
          <span className="text-sm font-medium text-zinc-400">Brain</span>
        </div>

        {!activeId ? (
          /* Empty state */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-zinc-500 text-lg mb-4">Start a conversation</p>
              <button
                onClick={newChat}
                className="px-4 py-2 rounded-md bg-zinc-700 hover:bg-zinc-600 text-sm font-medium transition-colors"
              >
                New Chat
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-6">
              <div className="max-w-2xl mx-auto space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === "user"
                          ? "bg-blue-600 text-white"
                          : "bg-zinc-800 text-zinc-200"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-400">
                      <span className="inline-flex gap-1">
                        <span className="animate-pulse">Thinking</span>
                        <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                        <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                        <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                      </span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input */}
            <div className="border-t border-zinc-800 p-4 flex-shrink-0">
              <div className="max-w-2xl mx-auto flex gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  rows={1}
                  disabled={loading}
                  className="flex-1 resize-none rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
                />
                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                  className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:hover:bg-blue-600 text-sm font-medium transition-colors"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
