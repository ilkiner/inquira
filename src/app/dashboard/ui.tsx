import type { Channel, Stage } from "@/lib/types";

const stageStyles: Record<Stage, string> = {
  new: "bg-slate-100 text-slate-700",
  qualifying: "bg-sky-50 text-sky-700",
  qualified: "bg-teal-50 text-teal-700",
  handoff: "bg-amber-50 text-amber-800",
  booked: "bg-emerald-100 text-emerald-800",
  lost: "bg-slate-100 text-slate-400",
};

export function StageBadge({ stage }: { stage: Stage }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${stageStyles[stage]}`}>
      {stage}
    </span>
  );
}

export function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-emerald-500" : score >= 40 ? "bg-amber-400" : "bg-slate-300";
  return (
    <div className="flex items-center gap-2" title={`Booking likelihood ${score}/100`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="w-6 text-xs tabular-nums text-slate-500">{score}</span>
    </div>
  );
}

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function ChannelBadge({ channel }: { channel: Channel }) {
  return channel === "whatsapp" ? (
    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
      WhatsApp
    </span>
  ) : (
    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Web</span>
  );
}
