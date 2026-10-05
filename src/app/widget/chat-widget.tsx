"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WidgetStrings } from "@/lib/i18n";

type Message = { id: string; role: "patient" | "assistant" | "staff"; text: string; createdAt: string };
type Session = { conversationId: string; visitorToken: string };

const SESSION_KEY = "inquira.session";
const POLL_MS = 5000;

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(session: Session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage blocked (e.g. third-party iframe in Safari): chat still works for this page view.
  }
}

function merge(existing: Message[], incoming: Message[]): Message[] {
  const seen = new Set(existing.map((m) => m.id));
  const added = incoming.filter((m) => !seen.has(m.id));
  if (added.length === 0) return existing;
  return [...existing, ...added].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function ChatWidget({
  clinicName,
  strings,
  dir,
}: {
  clinicName: string;
  strings: WidgetStrings;
  dir: "ltr" | "rtl";
}) {
  // Restores an earlier conversation on this device (null during SSR).
  const [session, setSession] = useState<Session | null>(() =>
    typeof window === "undefined" ? null : loadSession(),
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const [humanMode, setHumanMode] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastSeen = messages.at(-1)?.createdAt;

  const fetchMessages = useCallback(async (s: Session, after?: string) => {
    const params = new URLSearchParams({ conversationId: s.conversationId, visitorToken: s.visitorToken });
    if (after) params.set("after", after);
    const res = await fetch(`/api/chat?${params}`);
    if (res.status === 404) {
      // Conversation was deleted or token is stale: start fresh.
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch {}
      setSession(null);
      return;
    }
    if (!res.ok) return;
    const data = (await res.json()) as { messages: Message[]; mode: "ai" | "human" };
    setMessages((prev) => merge(prev, data.messages));
    setHumanMode(data.mode === "human");
  }, []);

  // Load the history of a restored conversation once.
  const restored = useRef(session);
  useEffect(() => {
    if (restored.current) void fetchMessages(restored.current);
  }, [fetchMessages]);

  // Poll for coordinator replies.
  useEffect(() => {
    if (!session) return;
    const timer = setInterval(() => void fetchMessages(session, lastSeen), POLL_MS);
    return () => clearInterval(timer);
  }, [session, lastSeen, fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    const optimistic: Message = {
      id: `local-${Date.now()}`,
      role: "patient",
      text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");
    setSending(true);
    setError(false);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...session, message: text }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as Session & { messages: Message[] };
      const next = { conversationId: data.conversationId, visitorToken: data.visitorToken };
      if (!session) {
        setSession(next);
        saveSession(next);
      }
      setMessages((prev) => merge(prev.filter((m) => m.id !== optimistic.id), data.messages));
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(text);
      setError(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <div dir={dir} className="flex h-dvh flex-col bg-white text-slate-900">
      <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <div className="grid size-9 place-items-center rounded-full bg-teal-600 text-sm font-semibold text-white">
          {clinicName.charAt(0)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{clinicName}</p>
          <p className="truncate text-xs text-slate-500">{strings.subtitle}</p>
        </div>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4" aria-live="polite">
        <Bubble role="assistant" text={strings.greeting} />
        {messages.map((m) => (
          <Bubble key={m.id} role={m.role} text={m.text} />
        ))}
        {humanMode && <p className="py-1 text-center text-xs text-slate-400">{strings.human}</p>}
        {sending && !humanMode && <p className="px-1 text-xs text-slate-400">{strings.typing}</p>}
        <div ref={bottomRef} />
      </div>

      {error && <p className="px-4 pb-1 text-xs text-red-600">{strings.error}</p>}

      <form onSubmit={send} className="flex items-end gap-2 border-t border-slate-100 p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder={strings.placeholder}
          aria-label={strings.placeholder}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="h-10 rounded-xl bg-teal-600 px-4 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-40"
        >
          {strings.send}
        </button>
      </form>
      <p className="pb-2 text-center text-[10px] text-slate-400">{strings.disclaimer}</p>
    </div>
  );
}

function Bubble({ role, text }: { role: Message["role"]; text: string }) {
  const mine = role === "patient";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <p
        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
          mine
            ? "rounded-ee-md bg-teal-600 text-white"
            : role === "staff"
              ? "rounded-es-md bg-amber-50 text-slate-900 ring-1 ring-amber-200"
              : "rounded-es-md bg-slate-100 text-slate-900"
        }`}
      >
        {text}
      </p>
    </div>
  );
}
