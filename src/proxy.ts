import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionValue } from "@/lib/auth";

// Keeps the coordinator dashboard behind a login.
export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/dashboard/login")) return NextResponse.next();
  if (await verifySessionValue(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  return NextResponse.redirect(new URL("/dashboard/login", request.url));
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
