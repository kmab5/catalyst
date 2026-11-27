# Golden test repositories

Use all six repositories at their roots, including the mixed Python/React fixtures. These baselines come from twelve successful structural runs of the built CLI on Windows with Node 22.23.5 on 2026-11-27. Every run made zero provider calls. Times measure the recorded index run, excluding CLI startup. Counts and timings are reference observations.

| Checkout | Files / nodes / edges | Health flags | Cold / unchanged (s) | Verified Explorer target |
|---|---:|---:|---:|---|
| [shadcn-ui/taxonomy](https://github.com/shadcn-ui/taxonomy) | 187 / 793 / 2,042 | 55 | 6.68 / 2.36 | `app/api/webhooks/stripe/route.ts` → `POST` calls Stripe. `lib/subscription.ts` → `getUserSubscriptionPlan` drives the impact example below. |
| [KolbySisk/next-supabase-stripe-starter](https://github.com/KolbySisk/next-supabase-stripe-starter) | 83 / 332 / 790 | 24 | 5.34 / 0.36 | `src/app/api/webhooks/route.ts` → `POST` handles `/api/webhooks`. Search for the Supabase `subscriptions` table. |
| [boxyhq/saas-starter-kit](https://github.com/boxyhq/saas-starter-kit) | 325 / 1,555 / 4,962 | 89 | 13.22 / 0.95 | `pages/api/webhooks/stripe.ts` → `handleSubscriptionUpdated`. The Pages Router endpoint appears as `ANY /api/webhooks/stripe`. |
| [fastapi/full-stack-fastapi-template](https://github.com/fastapi/full-stack-fastapi-template) | 249 / 1,339 / 3,374 | 181 | 7.28 / 0.54 | `backend/app/api/routes/items.py` → `create_item`. Search for `POST /api/v1/items/` and the `Item` model. The same tree includes the React client. |
| [benavlabs/FastAPI-boilerplate](https://github.com/benavlabs/FastAPI-boilerplate) | 510 / 4,620 / 11,761 | 195 | 9.52 / 3.22 | `backend/src/modules/rate_limit/service.py` → `RateLimitService.get_for_user`. Search for the SQLAlchemy `RateLimit` model. |
| [realworld-apps/golang-gin-realworld-example-app](https://github.com/realworld-apps/golang-gin-realworld-example-app) | 40 / 329 / 991 | 77 | 0.51 / 0.14 | `articles/routers.go` → `ArticleCreate` and `ArticleList`. Use this fixture for Tier 2 Go declarations, references and source navigation. |

## Prepare the pinned fixtures

In PowerShell at the Catalyst workspace root, build once. Keep upstream checkouts outside the workspace. A fresh local copy per rehearsal keeps the database, ignore entry and sample edits separate from existing work. Existing clones must contain the pinned commit.

```powershell
pnpm install --frozen-lockfile
pnpm build
$cli = (Resolve-Path packages/cli/dist/index.js).Path
$beds = Join-Path (Split-Path $PWD.Path) catalyst-testbeds
$scratch = Join-Path ([IO.Path]::GetTempPath()) ("catalyst-golden-" + [guid]::NewGuid())
New-Item -ItemType Directory -Force $beds, $scratch | Out-Null
$fixtures = [ordered]@{
  'shadcn-ui/taxonomy' = '298a8857c7128a0d121e7f699dfd729f23b3966d'
  'KolbySisk/next-supabase-stripe-starter' = '9839fd47d282b1b41a80fb82efea80ac7d1080bc'
  'boxyhq/saas-starter-kit' = 'abc9b686823cbfb4973c79bc36fea37a3244be6c'
  'fastapi/full-stack-fastapi-template' = 'f8c6c147b12bb1c4d3253cc1b06f8b5ef81b10dd'
  'benavlabs/FastAPI-boilerplate' = '2d0ca1a79a09f6b4ec2c23520d6d63496536489a'
  'realworld-apps/golang-gin-realworld-example-app' = 'de2be2ab883217c609a22b3872f200d9fad9cfb9'
}
foreach ($slug in $fixtures.Keys) {
  $name = $slug.Split('/')[-1]
  $src = Join-Path $beds $name
  $copy = Join-Path $scratch $name
  if (!(Test-Path $src)) {
    git clone "https://github.com/$slug.git" $src
    if ($LASTEXITCODE) { throw "Clone failed for $slug" }
  }
  git clone --quiet --no-hardlinks $src $copy
  if ($LASTEXITCODE) { throw "Local clone failed for $name" }
  git -C $copy checkout --quiet --detach $fixtures[$slug]
  if ($LASTEXITCODE) { throw "Pinned revision unavailable for $name" }
}
$tax = Join-Path $scratch taxonomy
```

## Structural indexing, CLI and performance

Run both passes in the same shell. Progress goes to stderr and `--json` writes the completed run to stdout. Compare parsing separately from elapsed time since health and search still run. Taxonomy has a partial parse at `components/mdx-card.tsx` that can be retried. Structural runs leave the LLM cache empty.

```powershell
foreach ($slug in $fixtures.Keys) {
  $name = $slug.Split('/')[-1]
  $copy = Join-Path $scratch $name
  foreach ($pass in 'cold','unchanged') {
    $raw = node $cli index $copy --no-ai --json
    if ($LASTEXITCODE) { throw "Index failed for $name ($pass)" }
    $r = $raw | ConvertFrom-Json
    if ($r.status -ne 'done' -or $r.stats.llmCalls -ne 0) { throw "Unexpected run: $raw" }
    "$name $pass durationMs=$($r.finishedAt - $r.startedAt) parseMs=$($r.stats.stageMs.parse)"
  }
}
$health = node $cli health $tax --json | ConvertFrom-Json
$health.summary
$health.flags | Where-Object { $_.node.filePath -eq 'components/icons.tsx' }
node $cli serve $tax --no-open
```

Open the printed loopback URL. For CLI commands while the server is running, use another PowerShell window with `$cli` and `$tax` set to the same absolute paths.

| Surface | Action | Expected observation |
|---|---|---|
| Explorer / X-Ray | In Taxonomy open the webhook file, then select `POST` in the source outline and follow its service connection. | Source highlights the handler. The symbol links to `svc:stripe` through `calls_service`. |
| Search / Graph | Search for `Post`, `next-auth` and `STRIPE_WEBHOOK_SECRET`. Open the billing helper in Graph, show upstream connections and change depth. | Search distinguishes Prisma models, packages and environment variable names. Selecting another connected node changes the detail panel. |
| Routes | Search for `/login`, `/register`, `/dashboard/settings`, `/docs/[[...slug]]`, `/editor/[postId]` and `/api/posts`. | Page routes preserve the dynamic segments. The posts endpoint has separate HTTP methods. |
| Health | Open the hub finding for `components/icons.tsx` and follow its file link. Repeat on the Python boilerplate's cycle involving `backend/src/modules/user/models.py`. | X-Ray matches the finding. The CLI JSON contains the same rule and node as the UI. |
| Background indexing | Stop the server. Run `git clone --local "$beds/saas-starter-kit" "$scratch/background"` then `node $cli "$scratch/background" --no-ai --no-open`. Open the printed URL and refresh during indexing. | The server responds during indexing. The run reaches Overview with graph and health available. A fast machine may finish before the browser opens. |

## Git impact on a one-line change

Use the disposable Taxonomy checkout. Change one expression and compare the working tree with `HEAD` before re-indexing. The CLI may also report the automatic `.gitignore` edit.

```powershell
$path = Join-Path $tax 'lib/subscription.ts'
$before = [IO.File]::ReadAllText($path)
if (!$before.Contains('86_400_000')) { throw 'Billing fixture changed' }
try {
  [IO.File]::WriteAllText($path, $before.Replace('86_400_000','86_400_001'))
  $impact = node $cli impact $tax --base HEAD --no-narrative --json | ConvertFrom-Json
  $impact.changedFiles.path
  $impact.changedNodes.id
  $impact.affected.routes.id
  Read-Host 'In the UI open Impact, compare with HEAD and open the graph. Press Enter when finished'
} finally {
  [IO.File]::WriteAllText($path, $before)
}
```

The observed change included `lib/subscription.ts` and `getUserSubscriptionPlan`. Affected routes included `PAGE /dashboard/billing` and `GET /api/users/stripe`. In Graph, confirm that changed and affected nodes have different highlights.

## Features, Ask and AI caching

These are provider-dependent acceptance checks. For a live run, choose OpenRouter in Settings, set both models to `openrouter/free` and review the estimate before starting AI indexing. The six-repository baseline covers structural indexing only.

| Surface | Action on Taxonomy | What to verify |
|---|---|---|
| Features | Start AI indexing. Look for authentication, billing/subscriptions, posts/editor, dashboard and marketing/docs. | Review membership against the actual routes and files. Follow a billing flow step to source. Generated titles and grouping can vary. |
| Ask, positive | Run `node $cli ask 'Where are Stripe webhooks handled?' $tax --json`. Repeat in the UI and open a citation. | A grounded answer identifies `app/api/webhooks/stripe/route.ts` and opens the handler. |
| Ask, negative | Ask “Is there password reset?” and inspect the search evidence. | Expect `found: false` with a searched list for this revision. Investigate an affirmative answer by opening its cited implementation. |
| Ask, background | In browser DevTools, open Network and filter for `/ask`. Submit one question, leave for Explorer while it streams, then return to Ask. Repeat using Back and Forward. | There is one Ask POST. The answer continues in the background, and returning shows its progress or completed citations. |
| Cache | After a completed AI run, review the estimate and repeat with identical models, language and source. Compare cached summary counts and calls with the first pass. | Unchanged summaries can be reused. For deterministic cache coverage, run `pnpm --filter @catalyst/core exec vitest run src/ai/ai.test.ts -t 'caches validated output'`. |

## MCP over stdio

From the Catalyst workspace root, use the SDK installed with the server to launch the real CLI, list tools and request a Taxonomy X-Ray. The observed result contained ten tools and `file:app/api/webhooks/stripe/route.ts`.

```powershell
@'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
const [cli, root] = process.argv.slice(2)
const client = new Client({name: 'golden-test', version: '1'})
await client.connect(new StdioClientTransport({command: process.execPath, args: [cli, 'mcp', root]}))
try {
  console.log((await client.listTools()).tools.length)
  const r = await client.callTool({
    name: 'get_symbol_context', arguments: {id: 'app/api/webhooks/stripe/route.ts'}
  })
  console.log(JSON.parse(r.content[0].text).node.id)
} finally { await client.close() }
'@ | pnpm --filter @catalyst/server exec node --input-type=module - $cli $tax
```
