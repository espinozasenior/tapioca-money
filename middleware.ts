/**
 * Next.js Edge Middleware — Origin header check for mutation requests.
 *
 * Blocks cross-origin POST/PATCH/DELETE requests unless the Origin header
 * matches the app's own domain or a configured allowlist. This prevents
 * CSRF-style attacks on API routes that mutate state.
 *
 * GET/HEAD/OPTIONS are exempt (safe methods per HTTP spec).
 */

import { NextRequest, NextResponse } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function getAllowedOrigins(): Set<string> {
  const origins = new Set<string>();

  // Production domain
  if (process.env.NEXT_PUBLIC_APP_URL) {
    origins.add(new URL(process.env.NEXT_PUBLIC_APP_URL).origin);
  }

  // Vercel preview deployments (*.vercel.app)
  if (process.env.VERCEL_URL) {
    origins.add(`https://${process.env.VERCEL_URL}`);
  }

  // Vercel branch preview URLs
  if (process.env.VERCEL_BRANCH_URL) {
    origins.add(`https://${process.env.VERCEL_BRANCH_URL}`);
  }

  // Additional allowed origins (comma-separated)
  if (process.env.ALLOWED_ORIGINS) {
    for (const origin of process.env.ALLOWED_ORIGINS.split(",")) {
      const trimmed = origin.trim();
      if (trimmed) origins.add(trimmed);
    }
  }

  // Production domain (always allowed)
  origins.add("https://tapioca.money");
  origins.add("https://www.tapioca.money");

  // Localhost for development (both http and https)
  origins.add("http://localhost:3000");
  origins.add("https://localhost:3000");
  origins.add("http://localhost:3001");
  origins.add("https://localhost:3001");

  return origins;
}

export function middleware(request: NextRequest) {
  // Skip safe methods
  if (SAFE_METHODS.has(request.method)) {
    return NextResponse.next();
  }

  // Skip cron endpoints (authenticated by CRON_SECRET, not Origin)
  if (request.nextUrl.pathname.startsWith("/api/agent/cron")) {
    return NextResponse.next();
  }

  const origin = request.headers.get("origin");

  // No Origin header — server-to-server call or same-origin navigation.
  // Browsers always send Origin on cross-origin requests.
  if (!origin) {
    return NextResponse.next();
  }

  const allowedOrigins = getAllowedOrigins();

  // Allow Vercel preview URLs pattern: *.vercel.app
  const isVercelPreview = origin.endsWith(".vercel.app");

  if (allowedOrigins.has(origin) || isVercelPreview) {
    return NextResponse.next();
  }

  console.warn(`[Middleware] Blocked cross-origin ${request.method} from: ${origin}`);
  return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
}

export const config = {
  matcher: "/api/:path*",
};
