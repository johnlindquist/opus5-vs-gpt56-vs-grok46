const configuredSiteOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN;
const configuredDemoOrigin = process.env.NEXT_PUBLIC_DEMO_ORIGIN;

if (process.env.VERCEL === "1" && (!configuredSiteOrigin || !configuredDemoOrigin)) {
  throw new Error(
    "Vercel builds require NEXT_PUBLIC_SITE_ORIGIN and NEXT_PUBLIC_DEMO_ORIGIN. " +
      "The demo origin must be a separate host so submitted code never shares the results-site origin.",
  );
}

export const siteOrigin = new URL(
  configuredSiteOrigin ?? "http://localhost:3000",
);

export const demoOrigin = new URL(
  configuredDemoOrigin ?? "http://demos.localhost:3000",
);

if (siteOrigin.origin === demoOrigin.origin) {
  throw new Error(
    `Unsafe demo configuration: site and submitted artifacts share ${siteOrigin.origin}`,
  );
}

export function isolatedDemoUrl(relativePath: string): string {
  if (!relativePath.startsWith("/demos/")) {
    throw new Error(`Demo path must stay under /demos/: ${relativePath}`);
  }
  return new URL(relativePath, demoOrigin).toString();
}
