import { NextRequest, NextResponse } from "next/server";

import { demoOrigin, siteOrigin } from "@/lib/origins";

function notFound(): NextResponse {
  return new NextResponse("Not Found", {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function proxy(request: NextRequest): NextResponse {
  const requestHost = request.nextUrl.host.toLowerCase();
  const isDemoHost = requestHost === demoOrigin.host.toLowerCase();
  const isDemoPath =
    request.nextUrl.pathname === "/demos" ||
    request.nextUrl.pathname.startsWith("/demos/");

  if (isDemoHost !== isDemoPath) return notFound();

  const response = NextResponse.next();

  if (isDemoHost) {
    response.headers.set(
      "Content-Security-Policy",
      `connect-src 'none'; object-src 'none'; base-uri 'self'; frame-ancestors ${siteOrigin.origin}`,
    );
  }

  return response;
}
