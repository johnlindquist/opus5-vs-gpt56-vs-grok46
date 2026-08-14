# Frontier Build Battle results site

Static Next.js presentation for the receipted Opus 5 vs Grok 4.6 vs GPT-5.6 Sol build comparison.

## Local development

```bash
bun install
bun run dev
```

Production verification:

```bash
bun run build
bun run start
```

The local defaults are `http://localhost:3000` for the results surface and
`http://demos.localhost:3000` for submitted code. Both names reach the same
local server but remain separate browser origins.

## Origin isolation

Submitted artifacts execute with scripts and their own origin enabled because
modern module bundles require it. They therefore **must not** share the results
site origin. Production builds on Vercel fail closed unless both variables are
set to different hosts:

```bash
NEXT_PUBLIC_SITE_ORIGIN=https://<results-project>.vercel.app
NEXT_PUBLIC_DEMO_ORIGIN=https://<separate-demo-project>.vercel.app
```

The production deployment uses two origins. Both hosts may run the same build,
but `src/proxy.ts` only serves `/demos/` on the demo host and rejects those
paths on every results host. It also rejects results pages on the demo host.
The results pages link to submitted artifacts but never load them inline; their
CSP sets `frame-src 'none'`. Every artifact starts only after an explicit
new-tab launch. The demo-host CSP sets `connect-src 'none'`, so submitted code
cannot make fetch, XHR, WebSocket, EventSource, or beacon requests. No AI
credentials are shipped to either deployment. Never configure both values to
the same origin.


## Evidence export

`scripts/export-data.ts` reads the sibling `~/dev/opus5-vs-gpt56-battle` evidence archive. It joins the frozen canonical results, Condition G projection, blind triad receipts, condition registry, prompt files, and staged demo manifests into `src/data/battle.json`, then copies all 60 byte-staged demo directories into `public/demos/`.

```bash
bun scripts/export-data.ts
```

Do not source arbitrary run workspaces directly. The exporter intentionally accepts only receipted result files and byte-identified artifacts registered by the staging manifests. Staging does not imply validator success.

## Routes

- `/` — headline tallies, score charts, and the 20-spec matrix
- `/methodology` — execution, replay validation, blind grading, and limitations
- `/specs/01` through `/specs/20` — three-way grades, staged artifacts with explicit failure labels, rubric detail, receipts, and frozen prompts

Condition G is additive. It never changes the frozen canonical Opus 19–1 Sol result; the site reports Opus–Grok and Grok–Sol as separate pairwise tallies.
