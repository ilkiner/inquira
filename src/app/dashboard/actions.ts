"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createSessionValue,
  passwordMatches,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  verifySessionValue,
} from "@/lib/auth";
import { allow } from "@/lib/rate-limit";
import { getStore } from "@/lib/store";
import { STAGES } from "@/lib/types";

// Server actions are reachable by POST from anywhere, so each one re-checks the
// session instead of relying on the proxy alone.
async function requireSession() {
  const jar = await cookies();
  if (!(await verifySessionValue(jar.get(SESSION_COOKIE)?.value))) redirect("/dashboard/login");
}

export async function login(_: { error?: string } | undefined, formData: FormData) {
  if (!process.env.DASHBOARD_PASSWORD) return { error: "Set DASHBOARD_PASSWORD in .env.local first." };
  if (!allow("login", 10, 60_000)) return { error: "Too many attempts. Wait a minute." };
  const password = String(formData.get("password") ?? "");
  if (!(await passwordMatches(password))) return { error: "Wrong password." };

  const jar = await cookies();
  jar.set(SESSION_COOKIE, await createSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  redirect("/dashboard");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/dashboard/login");
}

const idSchema = z.uuid();

export async function setMode(conversationId: string, mode: "ai" | "human") {
  await requireSession();
  const id = idSchema.parse(conversationId);
  await getStore().updateConversation(id, { mode });
  revalidatePath(`/dashboard/leads/${id}`);
}

export async function setStage(conversationId: string, formData: FormData) {
  await requireSession();
  const id = idSchema.parse(conversationId);
  const stage = z.enum(STAGES).parse(formData.get("stage"));
  await getStore().updateConversation(id, { stage });
  revalidatePath(`/dashboard/leads/${id}`);
  revalidatePath("/dashboard");
}

export async function sendStaffReply(conversationId: string, formData: FormData) {
  await requireSession();
  const id = idSchema.parse(conversationId);
  const text = z.string().trim().min(1).max(4000).parse(formData.get("text"));
  const store = getStore();
  // Writing to the patient implies a human is now handling the chat.
  await store.updateConversation(id, { mode: "human", unreadForStaff: false });
  await store.addMessage(id, "staff", text);
  revalidatePath(`/dashboard/leads/${id}`);
}

export async function markRead(conversationId: string) {
  await requireSession();
  await getStore().updateConversation(idSchema.parse(conversationId), { unreadForStaff: false });
}
