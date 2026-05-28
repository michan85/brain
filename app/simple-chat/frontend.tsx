import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

// @ts-ignore — loaded via CDN script tag
declare const d3: any;

// ---------- Types ----------

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

interface GraphNode {
  id: string;
  name: string;
  type: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  lastActivatedAt: number;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: string | null;
  weight: number;
}

interface GraphObservation {
  id: string;
  nodeId: string;
  content: string;
  confidence: number;
  createdAt: number;
  lastActivatedAt: number;
  supersededBy: string | null;
}

// ---------- Helpers ----------

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

function formatFullTime(ts: number) {
  if (!ts) return "never";
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function escapeHtml(text: string) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

const TYPE_COLORS: Record<string, string> = {
  person: "#e06666",
  concept: "#6699ee",
  task: "#66bb66",
  project: "#ddaa44",
  tool: "#aa66cc",
  pattern: "#cc8844",
  event: "#44bbaa",
  location: "#bb6688",
  organization: "#7788cc",
  skill: "#88bb44",
  service: "#44aacc",
  file: "#cc6699",
  object: "#99aa55",
};
const DEFAULT_COLOR = "#6677aa";
function getColor(type: string) {
  return TYPE_COLORS[type?.toLowerCase()] || DEFAULT_COLOR;
}

// ---------- Icons ----------

function BrainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z" />
      <path d="M9 21h6" /><path d="M10 17v4" /><path d="M14 17v4" />
      <path d="M12 2v3" /><path d="M8 5l1.5 2" /><path d="M16 5l-1.5 2" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
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

// ---------- Graph Visualization Component ----------

function GraphView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [graphData, setGraphData] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });
  const [stats, setStats] = useState<{ nodes: number; edges: number; observations: number } | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [observations, setObservations] = useState<GraphObservation[]>([]);
  const simulationRef = useRef<any>(null);

  useEffect(() => {
    Promise.all([
      api<{ nodes: GraphNode[]; edges: GraphEdge[] }>("/api/graph"),
      api<{ nodes: number; edges: number; observations: number }>("/api/stats"),
    ]).then(([graph, s]) => {
      setGraphData(graph);
      setStats(s);
    });
  }, []);

  // Select node and load observations
  const selectNode = useCallback(async (node: GraphNode) => {
    setSelectedNode(node);
    const res = await api<{ observations: GraphObservation[] }>(`/api/nodes/${node.id}/observations`);
    setObservations(res.observations);

    // Highlight in D3
    d3.selectAll("circle")
      .attr("stroke", (d: any) => d.id === node.id ? "#fff" : "#0a0a0f")
      .attr("stroke-width", (d: any) => d.id === node.id ? 3 : 1.5);
  }, []);

  // D3 rendering
  useEffect(() => {
    if (!containerRef.current || graphData.nodes.length === 0) return;

    const el = containerRef.current;
    d3.select(el).selectAll("*").remove();

    const width = el.clientWidth;
    const height = el.clientHeight;

    const svg = d3.select(el).append("svg").attr("viewBox", [0, 0, width, height]);
    const g = svg.append("g");

    const zoom = d3.zoom()
      .scaleExtent([0.1, 8])
      .on("zoom", (event: any) => g.attr("transform", event.transform));
    svg.call(zoom);

    const nodes = graphData.nodes.map((n: any) => ({ ...n }));
    const links = graphData.edges.map((e: any) => ({ ...e }));

    const edgeCounts: Record<string, number> = {};
    links.forEach((l: any) => {
      edgeCounts[l.source] = (edgeCounts[l.source] || 0) + 1;
      edgeCounts[l.target] = (edgeCounts[l.target] || 0) + 1;
    });

    function getRadius(d: any) {
      const count = edgeCounts[d.id] || 0;
      return Math.max(6, Math.min(20, 6 + count * 2));
    }

    simulationRef.current = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((d: any) => getRadius(d) + 4));

    const link = g.append("g").selectAll("line").data(links).join("line")
      .attr("stroke", "#2a2a4a")
      .attr("stroke-width", (d: any) => Math.max(1, (d.weight || 0.5) * 3))
      .attr("stroke-opacity", 0.6);

    const linkLabel = g.append("g").selectAll("text")
      .data(links.filter((l: any) => l.relation))
      .join("text")
      .attr("font-size", 10).attr("fill", "#555").attr("text-anchor", "middle")
      .text((d: any) => d.relation);

    const node = g.append("g").selectAll("circle").data(nodes).join("circle")
      .attr("r", (d: any) => getRadius(d))
      .attr("fill", (d: any) => getColor(d.type))
      .attr("stroke", "#0a0a0f").attr("stroke-width", 1.5)
      .attr("cursor", "pointer")
      .on("click", (_event: any, d: any) => selectNode(d))
      .call(d3.drag()
        .on("start", (event: any) => {
          if (!event.active) simulationRef.current.alphaTarget(0.3).restart();
          event.subject.fx = event.subject.x;
          event.subject.fy = event.subject.y;
        })
        .on("drag", (event: any) => {
          event.subject.fx = event.x;
          event.subject.fy = event.y;
        })
        .on("end", (event: any) => {
          if (!event.active) simulationRef.current.alphaTarget(0);
          event.subject.fx = null;
          event.subject.fy = null;
        }));

    const label = g.append("g").selectAll("text").data(nodes).join("text")
      .attr("font-size", 11).attr("fill", "#ccc").attr("text-anchor", "middle")
      .attr("dy", (d: any) => getRadius(d) + 14)
      .text((d: any) => d.name.length > 24 ? d.name.slice(0, 22) + "\u2026" : d.name);

    simulationRef.current.on("tick", () => {
      link.attr("x1", (d: any) => d.source.x).attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x).attr("y2", (d: any) => d.target.y);
      linkLabel.attr("x", (d: any) => (d.source.x + d.target.x) / 2)
        .attr("y", (d: any) => (d.source.y + d.target.y) / 2);
      node.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y);
      label.attr("x", (d: any) => d.x).attr("y", (d: any) => d.y);
    });

    return () => { simulationRef.current?.stop(); };
  }, [graphData, selectNode]);

  const types = [...new Set(graphData.nodes.map((n) => n.type))];
  const connectedEdges = selectedNode
    ? graphData.edges.filter(
        (e) => e.source === selectedNode.id || e.target === selectedNode.id
          || (e.source as any)?.id === selectedNode.id || (e.target as any)?.id === selectedNode.id
      )
    : [];

  return (
    <div className="flex-1 flex relative overflow-hidden">
      {/* Graph canvas */}
      <div ref={containerRef} className="flex-1" style={{ background: "#0a0a0f" }} />

      {/* Stats bar */}
      {stats && (
        <div className="absolute top-3 left-3 bg-[#141420] border border-[#2a2a3a] rounded-lg px-3 py-2 text-xs text-zinc-500">
          {stats.nodes} nodes &middot; {stats.edges} edges &middot; {stats.observations} observations
        </div>
      )}

      {/* Legend */}
      {types.length > 0 && (
        <div className="absolute bottom-4 left-4 bg-[#141420] border border-[#2a2a3a] rounded-lg px-3 py-2.5 text-xs">
          {types.map((t) => (
            <div key={t} className="flex items-center gap-2 mb-1 last:mb-0">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: getColor(t) }} />
              <span className="text-zinc-400">{t}</span>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {graphData.nodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-600/20 flex items-center justify-center mx-auto mb-4 ring-1 ring-violet-500/10">
              <BrainIcon className="w-8 h-8 text-violet-400/60" />
            </div>
            <p className="text-zinc-500 text-sm mb-1">Knowledge graph is empty</p>
            <p className="text-zinc-700 text-xs">Chat with the brain to populate it</p>
          </div>
        </div>
      )}

      {/* Inspector panel */}
      {selectedNode && (
        <div
          className="absolute top-0 right-0 w-[360px] h-full bg-[#141420] overflow-y-auto p-4"
          style={{ borderLeft: "1px solid #2a2a3a" }}
        >
          <button
            onClick={() => {
              setSelectedNode(null);
              d3.selectAll("circle").attr("stroke", "#0a0a0f").attr("stroke-width", 1.5);
            }}
            className="absolute top-3 right-3 text-zinc-600 hover:text-zinc-300 text-lg"
          >
            &times;
          </button>

          <h2 className="text-base font-semibold text-indigo-300 mb-1 pr-8">{selectedNode.name}</h2>
          <p className="text-xs text-zinc-600 mb-4">
            {selectedNode.type} &middot; created {formatFullTime(selectedNode.createdAt)} &middot; last active {formatFullTime(selectedNode.lastActivatedAt)}
          </p>

          {/* Metadata */}
          {Object.keys(selectedNode.metadata).length > 0 && (
            <div className="mb-4">
              <h3 className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">Metadata</h3>
              {Object.entries(selectedNode.metadata).map(([k, v]) => (
                <p key={k} className="text-xs text-zinc-500 mb-1">
                  <strong className="text-zinc-400">{k}:</strong> {JSON.stringify(v)}
                </p>
              ))}
            </div>
          )}

          {/* Observations */}
          <div className="mb-4">
            <h3 className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">
              Observations ({observations.length})
            </h3>
            {observations.length === 0 && (
              <p className="text-xs text-zinc-700">No observations</p>
            )}
            {observations.map((obs) => (
              <div
                key={obs.id}
                className={`bg-[#1a1a2a] rounded-md p-2.5 mb-2 text-[13px] leading-relaxed text-zinc-300 ${
                  obs.supersededBy ? "opacity-40 line-through" : ""
                }`}
              >
                {obs.content}
                <div className="flex gap-3 mt-1.5 text-[11px] text-zinc-600">
                  <span>confidence: {obs.confidence}</span>
                  <span>{formatFullTime(obs.createdAt)}</span>
                  {obs.supersededBy && <span>superseded</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Connections */}
          <div>
            <h3 className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">
              Connections ({connectedEdges.length})
            </h3>
            {connectedEdges.length === 0 && (
              <p className="text-xs text-zinc-700">No connections</p>
            )}
            {connectedEdges.map((e) => {
              const srcId = (e.source as any)?.id || e.source;
              const tgtId = (e.target as any)?.id || e.target;
              const isSource = srcId === selectedNode.id;
              const otherId = isSource ? tgtId : srcId;
              const otherNode = graphData.nodes.find((n) => n.id === otherId);
              return (
                <div key={e.id} className="py-1.5 text-[13px]" style={{ borderBottom: "1px solid #1a1a2a" }}>
                  {isSource ? "\u2192" : "\u2190"}{" "}
                  <span className="text-indigo-400">{e.relation || "related"}</span>{" "}
                  <span
                    className="text-zinc-400 hover:text-zinc-200 cursor-pointer hover:underline"
                    onClick={() => otherNode && selectNode(otherNode)}
                  >
                    {otherNode?.name || otherId}
                  </span>{" "}
                  <span className="text-zinc-700 text-[11px]">w:{(e.weight || 0).toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Main App ----------

type Tab = "chat" | "graph";

function App() {
  const [tab, setTab] = useState<Tab>("chat");
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
    if (tab === "chat") inputRef.current?.focus();
  }, [activeId, tab]);

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
    setTab("chat");
  }

  async function newChat() {
    const conv = await api<Conversation>("/api/conversations", { method: "POST" });
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    setMessages([]);
    setTab("chat");
    inputRef.current?.focus();
  }

  async function sendMessage() {
    if (!input.trim() || loading || !activeId) return;
    const content = input.trim();
    setInput("");
    setLoading(true);

    const tempUserMsg: Message = {
      id: "temp-" + Date.now(), conversationId: activeId, role: "user", content, createdAt: Date.now(),
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
        { id: "err-" + Date.now(), conversationId: activeId, role: "assistant", content: "Something went wrong. Check the server logs.", createdAt: Date.now() },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  const activeConv = conversations.find((c) => c.id === activeId);

  return (
    <div className="flex h-full bg-[#0a0a0f] text-zinc-100">
      {/* Sidebar */}
      <div
        className={`${sidebarOpen ? "w-72" : "w-0"} flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden bg-[#111118] flex flex-col`}
        style={{ borderRight: sidebarOpen ? "1px solid rgba(255,255,255,0.06)" : "none" }}
      >
        <div className="p-4 flex-shrink-0">
          <div className="flex items-center gap-2.5 mb-5 px-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <BrainIcon className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-wide text-zinc-200">Brain</span>
          </div>
          <button
            onClick={newChat}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-violet-600/80 to-indigo-600/80 hover:from-violet-500/90 hover:to-indigo-500/90 text-white shadow-lg shadow-violet-600/15 transition-all duration-200 active:scale-[0.98]"
          >
            <PlusIcon className="w-4 h-4" />
            New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {conversations.length > 0 && (
            <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Recent</p>
          )}
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => loadConversation(conv.id)}
              className={`group w-full text-left px-3 py-2.5 rounded-lg text-sm truncate transition-all duration-150 flex items-center gap-2.5 mb-0.5 ${
                conv.id === activeId && tab === "chat"
                  ? "bg-white/[0.07] text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]"
              }`}
            >
              <MessageIcon className={`w-3.5 h-3.5 flex-shrink-0 ${
                conv.id === activeId && tab === "chat" ? "text-violet-400" : "text-zinc-600 group-hover:text-zinc-500"
              }`} />
              <span className="truncate">{conv.title || "New conversation"}</span>
              <span className={`ml-auto text-[10px] flex-shrink-0 ${
                conv.id === activeId && tab === "chat" ? "text-zinc-500" : "text-zinc-700"
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
        <div className="h-14 flex items-center px-5 gap-4 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-zinc-600 hover:text-zinc-300 transition-colors p-1 rounded-md hover:bg-white/[0.05]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* Tab switcher */}
          <div className="flex items-center gap-1 bg-white/[0.03] rounded-lg p-0.5">
            <button
              onClick={() => setTab("chat")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                tab === "chat"
                  ? "bg-white/[0.08] text-zinc-200"
                  : "text-zinc-600 hover:text-zinc-400"
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setTab("graph")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                tab === "graph"
                  ? "bg-white/[0.08] text-zinc-200"
                  : "text-zinc-600 hover:text-zinc-400"
              }`}
            >
              Graph
            </button>
          </div>

          {tab === "chat" && activeConv && (
            <>
              <span className="text-sm text-zinc-400 truncate">{activeConv.title || "New conversation"}</span>
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

        {/* Tab content */}
        {tab === "graph" ? (
          <GraphView />
        ) : !activeId ? (
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
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-600/20 transition-all duration-200 active:scale-[0.98]"
              >
                <PlusIcon className="w-4 h-4" />
                New Chat
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
                {messages.length === 0 && !loading && (
                  <div className="text-center py-16"><p className="text-zinc-700 text-sm">Send a message to begin</p></div>
                )}
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-md shadow-violet-500/15">
                        <BrainIcon className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                    <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-600/10"
                        : "bg-white/[0.04] text-zinc-300 ring-1 ring-white/[0.06]"
                    }`}>
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
            <div className="flex-shrink-0 px-6 pb-6 pt-2">
              <div className="max-w-3xl mx-auto rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.08] hover:ring-white/[0.12] focus-within:ring-violet-500/30 transition-all duration-200 flex items-end gap-2 p-2">
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
              <p className="text-center text-[10px] text-zinc-800 mt-2">Brain uses reasoning loops and a knowledge graph to respond</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
