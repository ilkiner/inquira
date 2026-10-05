import Link from "next/link";
import { getStore, usingMemoryStore } from "@/lib/store";
import { STAGES, type Stage } from "@/lib/types";
import { logout } from "./actions";
import { ScoreBar, StageBadge, timeAgo } from "./ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const { stage } = await searchParams;
  const filter = STAGES.includes(stage as Stage) ? (stage as Stage) : null;
  const all = await getStore().listConversations();
  const leads = filter ? all.filter((c) => c.stage === filter) : all;

  const counts = Object.fromEntries(STAGES.map((s) => [s, all.filter((c) => c.stage === s).length]));
  const needsAttention = all.filter((c) => c.stage === "handoff" && c.unreadForStaff).length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Leads</h1>
          <p className="text-sm text-slate-500">
            {all.length} conversations
            {needsAttention > 0 && (
              <span className="ms-2 font-medium text-amber-700">· {needsAttention} waiting for you</span>
            )}
          </p>
        </div>
        <form action={logout}>
          <button className="text-sm text-slate-500 hover:text-slate-900">Sign out</button>
        </form>
      </header>

      {usingMemoryStore() && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
          Demo mode: data is kept in memory and disappears on restart. Set SUPABASE_URL and
          SUPABASE_SERVICE_ROLE_KEY to persist it.
        </p>
      )}

      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        <FilterLink href="/dashboard" active={!filter} label={`All ${all.length}`} />
        {STAGES.map((s) => (
          <FilterLink key={s} href={`/dashboard?stage=${s}`} active={filter === s} label={`${s} ${counts[s]}`} />
        ))}
      </nav>

      {leads.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-500">
          No conversations yet. Open the <Link href="/" className="text-teal-700 underline">demo site</Link> and
          send a message.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
          {leads.map((c) => (
            <li key={c.id}>
              <Link
                href={`/dashboard/leads/${c.id}`}
                className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 px-4 py-3 hover:bg-slate-50 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto_auto_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {c.unreadForStaff && <span className="me-1.5 inline-block size-2 rounded-full bg-teal-500" />}
                    {c.name ?? "Anonymous visitor"}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {[c.country, c.language, c.whatsapp ?? c.email].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <p className="col-span-2 truncate text-sm text-slate-600 sm:col-span-1">
                  {c.summary ?? c.treatment ?? "No details yet"}
                </p>
                <StageBadge stage={c.stage} />
                <ScoreBar score={c.score} />
                <span className="text-xs text-slate-400">{timeAgo(c.updatedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 capitalize ${
        active ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
      }`}
    >
      {label}
    </Link>
  );
}
