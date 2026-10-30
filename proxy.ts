import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/studio"];

export async function proxy(req: NextRequest) {
  if (process.env.DEMO_NO_AUTH === "1") return NextResponse.next();
  const { pathname } = req.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  const sessionCookie =
    req.cookies.get("authjs.session-token") ??
    req.cookies.get("__Secure-authjs.session-token");

  if (!sessionCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/studio/:path*"],
};
