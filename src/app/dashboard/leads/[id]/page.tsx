import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getStore } from "@/lib/store";
import { STAGES } from "@/lib/types";
import { markRead, sendStaffReply, setMode, setStage } from "../../actions";
import { ChannelBadge, ScoreBar, StageBadge } from "../../ui";
import { AutoRefresh } from "./auto-refresh";

export const dynamic = "force-dynamic";

export default async function LeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sendError?: string }>;
}) {
  const { id } = await params;
  const { sendError } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();

  const store = getStore();
  const lead = await store.getConversation(id);
  if (!lead) notFound();
  const messages = await store.listMessages(id);
  if (lead.unreadForStaff) await markRead(id);

  const details: [string, string | null][] = [
    ["Name", lead.name],
    ["Country", lead.country],
    ["Language", lead.language],
    ["Treatment", lead.treatment],
    ["Timeframe", lead.timeframe],
    ["Budget", lead.budget],
    ["WhatsApp", lead.whatsapp],
    ["Email", lead.email],
    ["Health notes", lead.medicalNotes],
  ];
  const whatsappHref = lead.whatsapp ? `https://wa.me/${lead.whatsapp.replace(/[^\d]/g, "")}` : null;

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <AutoRefresh />
      <section className="flex min-h-[70dvh] flex-col overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-900">
              ← Leads
            </Link>
            <h1 className="font-semibold">{lead.name ?? "Anonymous visitor"}</h1>
            <ChannelBadge channel={lead.channel} />
          </div>
          <form action={setMode.bind(null, id, lead.mode === "ai" ? "human" : "ai")}>
            <button
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                lead.mode === "ai"
                  ? "bg-slate-900 text-white hover:bg-slate-700"
                  : "bg-teal-600 text-white hover:bg-teal-700"
              }`}
            >
              {lead.mode === "ai" ? "Take over chat" : "Hand back to AI"}
            </button>
          </form>
        </header>

        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "patient" ? "justify-start" : "justify-end"}`}>
              <div className="max-w-[80%]">
                <p className={`mb-0.5 text-[11px] text-slate-400 ${m.role === "patient" ? "" : "text-end"}`}>
                  {m.role === "patient" ? "Patient" : m.role === "assistant" ? "AI" : "You"} ·{" "}
                  {new Date(m.createdAt).toLocaleString()}
                </p>
                <p
                  className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                    m.role === "patient"
                      ? "bg-slate-100"
                      : m.role === "assistant"
                        ? "bg-teal-50 ring-1 ring-teal-100"
                        : "bg-amber-50 ring-1 ring-amber-200"
                  }`}
                >
                  {m.text}
                </p>
              </div>
            </div>
          ))}
        </div>

        {sendError && (
          <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
            Saved, but WhatsApp didn&apos;t deliver it. If the patient&apos;s last message is older than 24 hours,
            WhatsApp only allows approved template messages — contact them from the WhatsApp app instead.
          </p>
        )}
        <form action={sendStaffReply.bind(null, id)} className="flex items-end gap-2 border-t border-slate-100 p-3">
          <textarea
            name="text"
            required
            rows={2}
            maxLength={4000}
            placeholder={lead.mode === "ai" ? "Reply as coordinator (pauses the AI)…" : "Reply to the patient…"}
            className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
          />
          <button className="h-10 rounded-lg bg-teal-600 px-4 text-sm font-medium text-white hover:bg-teal-700">
            Send
          </button>
        </form>
      </section>

      <aside className="space-y-4">
        <div className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-slate-200">
          <div className="flex items-center justify-between">
            <StageBadge stage={lead.stage} />
            <ScoreBar score={lead.score} />
          </div>
          {lead.summary && <p className="text-sm text-slate-700">{lead.summary}</p>}
          {lead.handoffReason && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Handoff: {lead.handoffReason}</p>
          )}
          <form action={setStage.bind(null, id)} className="flex gap-2">
            <select
              name="stage"
              defaultValue={lead.stage}
              aria-label="Stage"
              className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm capitalize"
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button className="rounded-lg bg-slate-100 px-3 text-sm hover:bg-slate-200">Update</button>
          </form>
        </div>

        <dl className="space-y-2 rounded-xl bg-white p-4 text-sm ring-1 ring-slate-200">
          {details.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[100px_1fr] gap-2">
              <dt className="text-slate-500">{label}</dt>
              <dd className="break-words">{value ?? <span className="text-slate-300">—</span>}</dd>
            </div>
          ))}
        </dl>

        {whatsappHref && (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noreferrer"
            className="block rounded-xl bg-emerald-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-emerald-700"
          >
            Continue on WhatsApp
          </a>
        )}
      </aside>
    </main>
  );
}
