# Golden Test Repos

These are real open-source repos used for end-to-end testing and the demo. They were verified via the GitHub API on 2026-11-27. Clone them to `../catalyst-testbeds/`, outside this repo, so they never get committed.

| Role | Repo | Size | Stack | Why |
|---|---|---|---|---|
| **Primary demo (TS)** | [shadcn-ui/taxonomy](https://github.com/shadcn-ui/taxonomy) (MIT, 19k★) | ~129 TS files | Next.js 13 app router, Prisma, next-auth v4, Stripe | Clear features (auth, billing, posts/editor, dashboard, marketing); a well-known name. The code dates from 2023, which doesn't matter for static analysis. |
| Small and fast-indexing TS | [KolbySisk/next-supabase-stripe-starter](https://github.com/KolbySisk/next-supabase-stripe-starter) (MIT) | ~57 TS files | Next 15, Supabase DB + auth, Stripe subscriptions + webhooks | Fast iteration loop while developing; exercises the Supabase detector |
| Larger TS backup | [boxyhq/saas-starter-kit](https://github.com/boxyhq/saas-starter-kit) (Apache-2.0) | ~283 TS files | Next.js, Prisma, next-auth, Stripe | Scale test for feature-discovery batching |
| **Python** | [fastapi/full-stack-fastapi-template](https://github.com/fastapi/full-stack-fastapi-template) (MIT, 46k★) | ~43 Python files in `backend/` (plus a React frontend) | FastAPI, SQLModel, PyJWT | Clean users/items/login modules. Opening the repo root also shows mixed-language analysis. |
| Python backup | [benavlabs/FastAPI-boilerplate](https://github.com/benavlabs/FastAPI-boilerplate) (MIT) | ~174 Python files in `src` | FastAPI, SQLAlchemy 2, JWT, Redis | Richer architecture (caching, rate limits, tiers) |
| **Tier 2 (Stretch)** | [realworld-apps/golang-gin-realworld-example-app](https://github.com/realworld-apps/golang-gin-realworld-example-app) (MIT) | ~21 Go files | Gin, GORM, JWT | Small; easy users/articles/comments feature map |

```bash
mkdir -p ../catalyst-testbeds && cd ../catalyst-testbeds
git clone --depth 1 https://github.com/shadcn-ui/taxonomy
git clone --depth 1 https://github.com/KolbySisk/next-supabase-stripe-starter
git clone --depth 1 https://github.com/fastapi/full-stack-fastapi-template
git clone --depth 1 https://github.com/realworld-apps/golang-gin-realworld-example-app
```

## Expected-results checklist (taxonomy)

Use these as manual end-to-end assertions and in the demo rehearsal. Confirm the exact file paths after cloning.

- [ ] Routes are detected for the app router pages (`/`, `/login`, `/register`, `/dashboard`, `/dashboard/billing`, `/dashboard/settings`, `/editor/[postId]`, blog/docs pages) and for the API route handlers (posts, users, auth, Stripe webhook).
- [ ] `db:prisma:*` nodes exist for the models in `prisma/schema.prisma` (User, Account, Session, Post, …).
- [ ] `svc:stripe` and `pkg:npm:next-auth` are present, with `calls_service` edges from the billing/webhook code.
- [ ] `env_var` nodes exist for the Stripe, GitHub OAuth, database and Postmark/SMTP variables (from `env.mjs`/`.env.example`).
- [ ] Features discovered include at least: Authentication, Billing/Subscriptions, Posts/Editor, Dashboard, Marketing/Docs.
- [ ] Ask "Where are Stripe webhooks handled?" cites the webhook route handler.
- [ ] Ask "Is there password reset?" returns `found: false` with a "searched" list.
