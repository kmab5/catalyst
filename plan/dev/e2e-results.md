# Acceptance record

Recorded on Windows with Node 22.23.5 and pnpm 9.15.9. Unit and integration tests use local fixtures or a loopback provider. The separate live run used OpenRouter against the public Taxonomy checkout.

## Agent A

- A fresh checkout at `57e229c` installed with the frozen lockfile and passed 127 tests before any build output was present.
- The loopback integration test indexes a temporary repository through the real engine and provider adapter. It validates summaries, flow edges, a feature changeability card and the overview, then consumes found and absent answers through the HTTP Ask stream. A warm run made zero provider requests, a single-file edit regenerated one file summary, and English and Turkish records coexisted.
- Real HTTP tests cover the project token, node IDs in URLs, streaming and reconnection, static delivery and port fallback. The in-memory MCP client lists ten tools and retrieves a blast radius from the server.

## Golden repositories

| Repository and revision | Observed result |
|---|---|
| Taxonomy `298a885` | Structural inspection found 187 files, 771 graph nodes, 1,850 structural edges, 29 routes and layouts, five Prisma models, and 15 environment names. An unchanged structural re-index took 350 ms and made zero provider calls. |
| FastAPI template `f8c6c14`, `backend/` | 57 files, 40 parsed Python sources, 344 nodes and 858 structural edges. All 23 routes have the mounted `/api/v1` prefix. `POST /api/v1/items/` reaches a write to `db:sqlalchemy:Item`. The latest real engine run completed in 362 ms. |
| Supabase Stripe starter `9839fd4` | 83 files, 57 parsed sources, 322 nodes and 711 structural edges. Identified the users, customers, prices, products and subscriptions tables and the auth and Stripe services. |
| Go RealWorld `de2be2a` | 40 files and 21 Go sources. The graph contained 173 imports and 485 call edges marked heuristic. Registration calls from `hello.go` resolved to the users and articles packages. |

Five Taxonomy X-Rays were compared with source. All 43 displayed direct connections across those five nodes had supporting evidence.

| X-Ray | Evidence checked |
|---|---|
| Stripe webhook POST | `app/api/webhooks/stripe/route.ts` lines 8, 15, 18 and 35 identify the handler, Stripe client, environment secret name and user write. |
| Dashboard billing page | The billing page calls the session and plan helpers, uses the Stripe client and renders the components listed in its JSX. |
| Subscription plan helper | `lib/subscription.ts` reads the user and selects the free or pro plan. The billing page, posts API and Stripe API call it. |
| Pages Router auth handler | `pages/api/auth/[...nextauth].ts` line 6 connects the catch-all API route to `NextAuth(authOptions)`. |
| Session helper | `lib/session.ts` lines 5–6 define the helper. The dashboard page, layout, settings, billing and editor pages contain its five inbound calls. |

## Live AI acceptance

The OpenRouter connection test succeeded. An initial run exposed serialized file summaries and was interrupted before completion. A resumed twelve-worker run completed in 65.4 seconds, including 46.6 seconds in summarization. This timing includes cache reuse and does not establish the five-minute cold AI target.

The SQLite index retained 99 summary records. The provider returned HTTP 402, and the account credits endpoint confirmed an exhausted balance. The run reported `aiStatus: partial` and used structural feature groups. The live AI overview, four named features, provider-backed Ask answers, cold AI run on the unseen repository and live warm-cache target remain unverified. Screenshots document the actual partial index. [Demo walkthrough](../../demo/script.md)

