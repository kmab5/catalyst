# 06 — Analysis Pipeline

The pipeline turns a folder into the graph and summaries described in [05](05-data-model.md). Stages run in this order (each one maps to a `ProgressEvent.stage`):

```
scan → parse → resolve → detect → graph → health → summarize → rollup → features → overview → changeability → fts → done
```

**Stage contract.** Every stage:
- is **idempotent**: re-running it on unchanged input writes nothing new;
- is **cache-aware**: it skips work whose `parsed_hash` / `input_hash` is unchanged (§6);
- emits `ProgressEvent { runId, stage, done, total, message? }` at least every 250 ms or every 25 items, whichever comes first;
- **never fails the run because one item failed.** Per-item errors are recorded (`files.parse_error`, a `runs.stats.errors[]` entry) and the stage moves on. Only infrastructure failures (DB unwritable, root missing) set the run to `error`.

The AI stages (`summarize` → `changeability`) are skipped when no provider is configured ([07 §1](07-llm-providers.md)). `fts` always runs, indexing whatever summaries exist.

---

## 1. Scanner (`core/scan`) — MVP

### 1.1 Walk & ignore
- The walk starts from `Source.listFiles()`. For `LocalPathSource` this is a recursive `fs.readdir` that **does not follow symlinks** outside the root.
- Ignore rules, applied in this order (later rules can un-ignore with `!`):
  1. **Built-ins:** `node_modules/`, `.git/`, `.catalyst/`, `dist/`, `build/`, `out/`, `.next/`, `.nuxt/`, `.svelte-kit/`, `.turbo/`, `.vercel/`, `coverage/`, `.cache/`, `venv/`, `.venv/`, `env/` (when it contains `pyvenv.cfg`), `__pycache__/`, `.mypy_cache/`, `.pytest_cache/`, `.tox/`, `target/` (Rust), `vendor/` (Go/PHP), `*.min.js`, `*.min.css`, `*.map`, lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`, `poetry.lock`, `Pipfile.lock`, `uv.lock`, `Cargo.lock`, `go.sum`), and generated files (`*.d.ts` under `node_modules` only; `next-env.d.ts`).
  2. The root `.gitignore`, plus nested `.gitignore` files (via the `ignore` npm package).
  3. `.catalystignore` (gitignore syntax), at the root.
  4. `ignore`/`include` arrays in `catalyst.config.json` ([12](12-config-and-privacy.md)).
- **Binary detection:** a NUL byte in the first 8 KB means binary → `tier 0`, no node.
- **Size cap:** files over **1 MB** become `tier 0` with `parse_error = 'too_large'`. They still get a `file` node, so they appear in the tree.
- **Minified heuristic:** an average line length over 300 chars, or any line over 5,000 chars → `tier 0`.

### 1.2 Language & tier

| Extensions | `language` | Tier |
|---|---|---|
| `.ts` `.mts` `.cts` | typescript | 1 |
| `.tsx` | tsx | 1 |
| `.js` `.mjs` `.cjs` | javascript | 1 |
| `.jsx` | jsx | 1 |
| `.py` `.pyi` | python | 1 |
| `.go` | go | 2 (Stretch) |
| `.rs` `.java` `.rb` `.cs` `.php` `.kt` `.swift` `.c` `.h` `.cpp` `.hpp` | rust, java, ruby, csharp, php, kotlin, swift, c, cpp | 2 (Later; falls back to Tier 3 when Tier 3 is enabled, otherwise tier 0) |
| `.prisma` | prisma | 1 (detector-only; §4.2) |
| `.sql` `.yaml` `.yml` `.toml` `.json` `.graphql` `.vue` `.svelte`, `Dockerfile` | sql, yaml, … | 3 (Stretch) / 0 |
| `.md` `.mdx` `.css` `.scss` images, fonts | markdown, css, asset | 0 (node only, no analysis) |

Special handling: `package.json`, `tsconfig*.json`, `jsconfig.json`, `pyproject.toml`, `setup.cfg`, `requirements*.txt` and `.env.example` are **read by resolvers and detectors** (§3, §4.3) even though they are tier 0 for parsing.

### 1.3 Output
- One `files` row per path: `hash` = sha1 of the content, `loc` = non-blank lines, plus `size_bytes`.
- One `file` node per file and one `directory` node per folder, with `contains` edges (`provenance: 'ast'`).
- Files whose `hash != parsed_hash` are queued for `parse`. Files deleted since the last run are removed (§6.3).

---

## 2. Parsing (`core/parse`) — MVP

### 2.0 Grammar loading
- `web-tree-sitter` is initialised once with `Parser.init()`. Grammar `.wasm` files ship inside the published package under `cli/dist/grammars/` (sourced from the `tree-sitter-wasms` npm package or built with `tree-sitter build --wasm`). Bundled: `tree-sitter-typescript.wasm`, `tree-sitter-tsx.wasm`, `tree-sitter-javascript.wasm` and `tree-sitter-python.wasm`; plus `tree-sitter-go.wasm` (Stretch).
- Each language is loaded lazily the first time a file in that language is seen, then cached. Queries are compiled once per language.
- Each language has an adapter that implements:

```ts
interface LanguageAdapter {
  languages: string[];                         // ['typescript','tsx','javascript','jsx']
  parse(file: FileInput): ParsedFile;          // pure: no FS access, no cross-file knowledge
}
interface ParsedFile {
  path: string;
  symbols: RawSymbol[];      // name, symbolKind, startLine, endLine, exported, signature, parentName?, isDefault?
  imports: RawImport[];      // specifier, names: {imported, local}[], isNamespace, isDefault, isTypeOnly, isDynamic, line
  exports: RawExport[];      // local name → exported name, re-exports (`export * from`, `export {a} from`)
  calls: RawCall[];          // callerSymbol (enclosing), calleeText ("foo" | "obj.method" | "a.b.c"), line, argsCount
  jsx: RawJsx[];             // enclosing component, element name ("Button" | "UI.Card"), line
  refs: RawRef[];            // identifier uses that are not calls (best-effort: passed as values, extends/implements)
  decorators: RawDecorator[];// Python/TS decorators: target symbol, decorator text, args (raw)
  complexity: Record<string, number>; // per symbol, see 11 §1
  strings?: RawStringCall[]; // call sites with literal-string args, for detectors (e.g. supabase.from('x'))
}
```

Parsing is **file-local and pure**. Everything that crosses files happens in `resolve`. This is what makes the parse cache per-file and safe.

### 2.1 TS/JS adapter (`typescript`, `tsx`, `javascript`, `jsx`)

The `tsx` grammar is used for `.tsx` and `.jsx`, and the `typescript` grammar for `.ts`/`.js`/`.mjs`/`.cjs`. The TS grammar parses plain JS correctly enough.

The queries are sketches; the exact query files live in `core/parse/queries/ts/*.scm`.

| Capture | Tree-sitter shape (simplified) | Produces |
|---|---|---|
| Function decl | `(function_declaration name: (identifier) @name)` | symbol `function` (or `component` if PascalCase and the body contains JSX, or `hook` if the name matches `^use[A-Z]`) |
| Arrow/const fn | `(lexical_declaration (variable_declarator name: (identifier) @name value: [(arrow_function) (function_expression)]))` | symbol `function`/`component`/`hook` |
| Other const | `(variable_declarator name: (identifier) @name)` at module scope | symbol `variable` (only if exported, or referenced ≥1 time) |
| Class | `(class_declaration name: (type_identifier) @name)` + `(class_heritage)` | symbol `class`; raw `extends`/`implements` refs |
| Method | `(method_definition name: (property_identifier) @name)` inside a class | symbol `method`, ID `#Class.method`, `contains` class→method |
| Interface / type / enum | `interface_declaration`, `type_alias_declaration`, `enum_declaration` | `interface` / `type` / `enum` |
| Export | `(export_statement declaration: …)`, `(export_statement (export_clause))`, `export default …`, `export * from 's'`, `export { a as b } from 's'` | `exported = 1`, RawExport, re-exports |
| CommonJS | `module.exports = …`, `exports.x = …`, `require('s')` | RawExport / RawImport (`isDefault` for `module.exports =`) |
| Import | `(import_statement source: (string) @src (import_clause …))`, `import type`, `import('s')` | RawImport (`isTypeOnly`, `isDynamic`) |
| Call | `(call_expression function: [(identifier) (member_expression)] @callee)`, `(new_expression constructor: …)` | RawCall with `callerSymbol` = the nearest enclosing function/method/class, or the `<module>` pseudo-caller (attributed to the file) |
| JSX | `(jsx_opening_element name: @n)`, `(jsx_self_closing_element name: @n)` where the name starts uppercase | RawJsx |
| String-arg calls | a call whose first argument is a string literal | RawStringCall (`callee`, `literal`) |

**Signatures:** the source text from the start of the declaration to the opening brace of the body, whitespace-collapsed, capped at 160 chars.

**Next.js-specific parse facts**, recorded as raw facts for the detectors: the `'use client'`/`'use server'` directive at the top of the file, and exported names such as `GET`, `POST`, `generateMetadata`, `default`.

### 2.2 Python adapter (`python`)

| Capture | Shape | Produces |
|---|---|---|
| Function | `(function_definition name: (identifier) @name)` at module level | symbol `function` |
| Class | `(class_definition name: @name superclasses: (argument_list)?)` | symbol `class`; superclasses become raw `extends` refs |
| Method | a `function_definition` inside a class body | symbol `method` `#Class.method` |
| Module variable | `(expression_statement (assignment left: (identifier) @name))` at module level, UPPER_CASE or referenced | symbol `variable` |
| Decorator | `(decorated_definition (decorator) @dec definition: …)` | RawDecorator (text such as `app.get("/items/{id}")`, `router.post`, `login_required`) |
| Import | `import_statement`, `import_from_statement` (incl. `relative_import` dots), `from x import *` | RawImport |
| Call | `(call function: [(identifier) (attribute)] @callee)` | RawCall |
| Exports | Python has no export keyword. A name is "exported" if it has no leading underscore and is at module level, **or** it is listed in `__all__` (which takes precedence) | `exported` flag |

### 2.3 Tier 2 — tags queries (Go: Stretch; others Later)
- Use each grammar's standard `queries/tags.scm` (`@definition.function`, `@definition.class`, `@definition.method`, `@reference.call`, `@reference.class`), shipped alongside the `.wasm` files.
- Definitions become symbols (`provenance: 'ast'`). References are matched **by name** across the repo: if exactly one definition has that name, emit the edge with `provenance: 'heuristic'` and `confidence: 0.6`; if 2–3 match, prefer the same directory (`confidence: 0.4`); if there are more, drop the reference.
- Go imports: `import_spec path` → resolve against the module path in `go.mod` to a directory → `imports` edges from the file to each `.go` file in that directory (`resolved`), or to a `pkg:go:<path>` node.

### 2.4 Errors
- A tree-sitter `ERROR` node does **not** fail the file. Extraction proceeds from the valid subtrees, and `parse_error = 'partial'` is recorded if more than 20% of the top-level nodes are errors.
- An exception in an adapter means the file keeps only its `file` node, `parse_error = <message>` is recorded, and the run continues.

---

## 3. Resolution (`core/resolve`) — MVP

Inputs are all `ParsedFile`s plus the project config files. Outputs are `imports`, `calls`, `references`, `renders`, `extends` and `implements` edges.

### 3.1 TS/JS module resolution

`resolveTs(fromFile, specifier) → { kind: 'file', path } | { kind: 'package', name } | { kind: 'unresolved' }`

1. **Relative** (`./`, `../`): join with `dirname(fromFile)`, then **probe**:
   - the exact path (if it has an extension);
   - each of `.ts .tsx .mts .cts .js .jsx .mjs .cjs .d.ts`, also mapping `.js → .ts/.tsx` (the TS ESM convention);
   - `/index` + each extension;
   - `/package.json` `main`/`module`/`types` (local folder packages).
2. **tsconfig/jsconfig `paths` + `baseUrl`**: find the **nearest** `tsconfig.json` or `jsconfig.json` walking up from `fromFile` (so monorepo packages each use their own). Follow `extends` chains, including package extends such as `@tsconfig/next`; if the target is not on disk, ignore it. Match patterns in `compilerOptions.paths` (`"@/*": ["./src/*"]`), trying each target in order with probing. If only `baseUrl` is set, also try `baseUrl/specifier`.
3. **Workspace packages**: read the root `package.json` `workspaces` and/or `pnpm-workspace.yaml`, then map each workspace package's `name` to its directory. `@acme/ui` and `@acme/ui/button` resolve via `exports`, then `main`, then `src/index.*` probing.
4. **Bare specifier** → `package` node `pkg:npm:<name>`, where the name is the scope plus the first segment (`@radix-ui/react-dialog`, or `lodash` from `lodash/debounce`). Node built-ins (`fs`, `node:fs`, …) become `pkg:npm:node:<mod>` and are hidden from the graph by default.
5. Otherwise the result is `unresolved`. It is recorded in `runs.stats.unresolved[]` for debugging, and no edge is made.

Edge: `imports` file→file (`provenance: 'resolved'`), or file→pkg. `data` = `{ names: string[], typeOnly: boolean, dynamic: boolean }`. Type-only imports *are* recorded, but impact BFS skips them by default (§4.5).

**Re-export following:** to resolve the binding `import { a } from './index'`, follow `export { a } from './a'` and `export * from './a'` chains (max depth 5, cycle-guarded) to the file that defines `a`. The `imports` edge still points to the specifier's file, while the **symbol binding** points to the defining symbol.

### 3.2 Python module resolution

1. **Package roots**: the project root; `src/` if it exists; every directory listed in `pyproject.toml` (`[tool.setuptools] package-dir`, `[tool.poetry] packages`, `[tool.hatch…] packages`); and any directory containing `pyproject.toml`/`setup.py` (monorepos). Also try the **directory containing the importing file's top-level package**, e.g. for `backend/app/main.py`, `backend/` is a root because `app/__init__.py` exists, or because `app/` is imported as `app.x`.
2. **Absolute** `import a.b.c` / `from a.b import c`: for each root, try `a/b/c.py`, `a/b/c/__init__.py`, then (for `from a.b import c`) `a/b.py` containing the symbol `c`, or `a/b/__init__.py`.
3. **Relative** `from .x import y` / `from ..x import y`: count the dots from the importing file's package directory, then probe as above.
4. **Not found under any root** → `pkg:pypi:<top-level>`. A small alias map handles mismatched names (`yaml`→`pyyaml`, `jwt`→`pyjwt`, `sklearn`→`scikit-learn`, `PIL`→`pillow`, `jose`→`python-jose`). The stdlib list is hidden by default (`pkg:pypi:stdlib:<mod>`).
5. `__init__.py` re-exports (`from .models import User`) are followed the same way as TS re-exports.

### 3.3 Call / reference / render resolution

For each `RawCall` (and each `RawJsx`/`RawRef`), resolve `calleeText` in this order. **The first match wins:**

| # | Rule | Provenance | Confidence |
|---|---|---|---|
| 1 | **Local scope**: an identifier defined in the same file (a function, class, or module const holding a function) | `ast` | 1.0 |
| 2 | **Import binding**: the identifier is an imported local name → follow the binding (§3.1 re-exports) to the defining symbol; `default` imports go to `#default`, or to the named default export's symbol | `resolved` | 1.0 |
| 3 | **Namespace/member import**: `ns.fn()` where `ns` is `import * as ns` / `import ns` (Python `import a.b as ns`) → the symbol `fn` in the target module | `resolved` | 1.0 |
| 4 | **Self/this method**: `this.m()` / `self.m()` inside class `C` → `#C.m` (including inherited methods if `extends` resolves) | `ast` | 0.9 |
| 5 | **Constructor**: `new C()` / `C()` (Python), where `C` resolves by rules 1–3 → the class symbol | as above | 1.0 |
| 6 | **Member call on an unknown object** (`obj.method()`): if exactly **one** class method named `method` exists in the repo *and* the file imports that class's file → the method | `heuristic` | 0.6 |
| 7 | **Unique-name heuristic**: a bare identifier with no binding (globals, framework injection) and exactly one exported symbol of that name in the repo | `heuristic` | 0.5 |
| 8 | Otherwise, if the identifier is bound to a package import → emit **no symbol edge** (the file→pkg `imports` edge already captures it), and the detectors (§4) may still use it | — | — |

- A call with the `<module>` pseudo-caller attaches to the `file` node: the edge is `file → symbol`, kind `calls`.
- JSX elements resolve like identifiers, giving a `renders` edge. `<UI.Card>` uses rule 3.
- Class `extends`/`implements` refs resolve the same way, giving `extends`/`implements` edges.
- Duplicate edges with the same (src, dst, kind) are merged. `data.count` holds the occurrence count, and `line` keeps the first occurrence.

---

## 4. Detectors (`core/detect`) — MVP core set

Detectors run after resolution. They read `ParsedFile`s, resolved bindings and config files, and they create `route`, `db_model`, `env_var`, `service` and `package` nodes along with their edges. Each one is a small module:

```ts
interface Detector {
  id: string;                                  // 'next-app-router', 'prisma', ...
  appliesTo(ctx: ProjectCtx): boolean;         // cheap gate: dependency present in package.json/pyproject, or file patterns
  run(ctx: ProjectCtx, emit: Emitter): void;   // emit nodes/edges with provenance 'ast' or 'resolved'
}
```

Each detector also contributes `stack` entries to `meta.stack_json` (`{ name, category, evidence: [nodeId...] }`), which becomes the deterministic part of `AppOverview.stack`.

### 4.1 Routes

| Detector | Gate | Rule | Node / edge |
|---|---|---|---|
| **Next.js App Router** | `next` dependency + an `app/` or `src/app/` dir | `app/**/page.(tsx|jsx|ts|js)` → `route:PAGE /<segments>`; `app/**/route.(ts|js)` exporting `GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS` → one `route:<METHOD> /<segments>` per exported method; `layout.*` → `route:LAYOUT /<segments>` (kind `route`, `data.type='layout'`). Segment rules: drop route groups `(group)`; keep `[id]` and `[...slug]` as-is; drop `@parallel` slots; ignore `_private` folders | `handles`: route → the `default` symbol (page) or the exported method symbol |
| **Next.js Pages Router** | a `pages/` or `src/pages/` dir | `pages/api/**` → `route:ANY /api/...` (`data.methodsGuess` from `req.method ===` string compares); other `pages/**` (except `_app`, `_document`, `_error`) → `route:PAGE /...` | `handles` → `#default` |
| **Next.js middleware / server actions** | `middleware.(ts|js)` at the root or in `src/`; files or functions with `'use server'` | middleware → `route:MIDDLEWARE *` (`data.matcher` from `config.matcher` if it's a literal); exported functions of `'use server'` files → `data.serverAction = true` on the symbol (role hint) | `handles` |
| **Express / Hono / Fastify / Koa-router** | the dependency is present | a RawCall whose `calleeText` matches `<x>.(get|post|put|patch|delete|all|use|route)` with a string-literal first argument; `<x>` is bound to `express()`, `Router()`, `new Hono()`, `fastify()`, or is named `app`/`router`/`api`. The handler is the last function argument: an identifier gets resolved, and an inline arrow gets a synthetic symbol `#<METHOD> <path>@line`. `app.use('/prefix', router)` → prefix-join the routes of that router when it resolves to an imported router variable (best-effort, max depth 3) | `route:<METHOD> <path>`; `handles` |
| **FastAPI** | the `fastapi` dependency | RawDecorator `@<x>.(get|post|put|patch|delete|api_route|websocket)("<path>")` on a function; `<x>` = a `FastAPI()` or `APIRouter(prefix=...)` var. `app.include_router(r, prefix="/x")` → prefix-join (literal prefixes only) | `route:<METHOD> <path>`; `handles` |
| **Flask** | the `flask` dependency | `@<x>.route("<path>", methods=[...])`, `@<x>.(get|post|…)`; Blueprint `url_prefix` literal | same |

### 4.2 Databases

| Detector | Rule | Output |
|---|---|---|
| **Prisma schema** | Parse `prisma/schema.prisma` (or any `*.prisma`) with a small line-based parser: `model X {` … `}` → fields and relations (`@relation`) | `db:prisma:X` nodes, `data = { fields: [{name,type,isRelation}], table: @@map || X }` |
| **Prisma client usage** | A RawCall `calleeText` of `<client>.<model>.<op>` where `<client>` is an identifier bound to an import from `@prisma/client` or from a local file exporting a `PrismaClient` instance (commonly `db`, `prisma`). `<model>` lowerCamel → match model `X` case-insensitively. Ops: read = `findUnique findUniqueOrThrow findFirst findFirstOrThrow findMany count aggregate groupBy`; write = `create createMany update updateMany upsert delete deleteMany`. `$transaction`/`$queryRaw` → `reads`+`writes` on `db:prisma:*raw` (unknown) | `reads`/`writes` edges from the enclosing symbol (or file) → `db:prisma:X`, `provenance: 'resolved'` |
| **Supabase** | RawStringCall `<x>.from('<table>')` where the file imports `@supabase/*`, or `<x>` is a known client var; the chained op (`.select` = read; `.insert .update .upsert .delete` = write) is found by walking the parent call chain in the tree. `supabase.auth.*` → `calls_service` `svc:supabase-auth`; `supabase.storage.from()` → `svc:supabase-storage` | `db:supabase:<table>` nodes (created on first sight); `reads`/`writes` |
| **SQLAlchemy / SQLModel** | A class extending `Base`/`DeclarativeBase`/`db.Model`, or `SQLModel` with `table=True` in the class keywords → model; table = the `__tablename__` literal or a snake-case name. Session ops: `session.add/add_all/delete/merge/commit` = write (model inferred from the argument's constructor or annotation if resolvable, else the `*unknown` model); `session.query(X)`, `select(X)`, `session.get(X, …)`, `session.exec(select(X))` = read on X | `db:sqlalchemy:X`; `reads`/`writes` |
| **Drizzle / Mongoose / Django ORM** | Stretch: `pgTable('t', …)` / `mongoose.model('X', …)` / `class X(models.Model)` | `db:drizzle:t`, `db:mongoose:X`, `db:django:X` |

### 4.3 Environment variables
- TS/JS: `process.env.X`, `process.env['X']`, `import.meta.env.X`, and destructuring `const { X } = process.env`.
- Python: `os.environ['X']`, `os.environ.get('X')`, `os.getenv('X')`, and pydantic `BaseSettings` fields (the field name upper-cased becomes the env name, `provenance: 'heuristic'`).
- `.env.example`, `.env.sample` and `env.mjs`/`env.ts` (t3-env `createEnv`) contribute declared names, with `data.declaredIn` set. **The real `.env*` files are never read** ([12](12-config-and-privacy.md)).
- Each variable becomes an `env:X` node, with `uses_env` edges from the enclosing symbol/file. Name heuristics fill `data.category`: `*SECRET*|*KEY*|*TOKEN*|*PASSWORD*` → `secret`, `*URL*|*HOST*` → `endpoint`, `NEXT_PUBLIC_*` → `public`.

### 4.4 Services, packages, components

**Package → service map** (`core/detect/services.ts`, easily extended):

| Package(s) | Service node | Category |
|---|---|---|
| `stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js` | `svc:stripe` | payments |
| `@lemonsqueezy/*`, `@paddle/*` | `svc:lemonsqueezy`, `svc:paddle` | payments |
| `next-auth`, `@auth/*`, `@next-auth/prisma-adapter` | `svc:nextauth` | auth |
| `@clerk/*` | `svc:clerk` | auth |
| `@supabase/supabase-js`, `@supabase/ssr`, `@supabase/auth-helpers-*` | `svc:supabase` (+ `svc:supabase-auth`, `svc:supabase-storage` via usage) | data/auth |
| `firebase`, `firebase-admin` | `svc:firebase` | data/auth |
| `lucia`, `better-auth`, `passport*`, `jsonwebtoken`, `jose`; py: `pyjwt`, `python-jose`, `passlib`, `pwdlib`, `authlib` | `svc:lucia`, `svc:better-auth`, `svc:passport`, `svc:jwt` | auth |
| `resend`, `nodemailer`, `postmark`, `@sendgrid/mail`, `react-email`/`@react-email/*`; py: `emails`, `sendgrid` | `svc:resend`, `svc:smtp`, `svc:postmark`, `svc:sendgrid` | email |
| `openai`, `@anthropic-ai/sdk`, `ai`, `@ai-sdk/*`, `langchain`; py: `openai`, `anthropic` | `svc:openai`, `svc:anthropic`, `svc:ai-sdk` | ai |
| `@aws-sdk/*`, `aws-sdk`; py: `boto3` | `svc:aws-<client>` (e.g. `@aws-sdk/client-s3` → `svc:aws-s3`) | infra |
| `@vercel/*` (`blob`, `kv`, `postgres`), `@upstash/*`, `redis`, `ioredis`; py: `redis` | `svc:vercel-blob`, `svc:upstash`, `svc:redis` | infra |
| `@sentry/*`, `posthog-*`, `@vercel/analytics`; py: `sentry-sdk` | `svc:sentry`, `svc:posthog`, `svc:vercel-analytics` | analytics |
| `uploadthing`, `cloudinary` | `svc:uploadthing`, `svc:cloudinary` | storage |
| `@prisma/client` / `prisma`; `drizzle-orm`; `sqlalchemy`, `sqlmodel`; `mongoose` | `svc:postgres`, `svc:mysql` or `svc:sqlite` (from the Prisma `datasource provider` / the engine URL scheme when it's literal), else `svc:database` | data |

- `depends_on` edges go from `pkg:*` → `svc:*`. A symbol whose body calls something bound to that package's import gets a `calls_service` edge (symbol → svc, `resolved`). Files that import the package but have no resolvable call site get file → svc (`heuristic`, 0.7).
- **`fetch`/`axios`/`httpx`/`requests` host matching:** a literal URL argument (or a template literal with a literal host) gets its host matched against a table (`api.stripe.com`→`svc:stripe`, `api.github.com`→`svc:github`, `api.openai.com`→`svc:openai`, `hooks.slack.com`→`svc:slack`, …). Unknown hosts become `svc:http:<host>` (`heuristic`).
- **Components/hooks:** these were classified at parse time (§2.1). A file whose default export is a component and whose path is a route file gets the role hint `page`. `'use client'` sets `data.client = true`.
- **Tests:** `*.test.*`, `*.spec.*`, `__tests__/**`, `tests/**`, `test_*.py`, `*_test.py` → `file.data.isTest = true`. Edges from tests are kept, but excluded from impact counts by default.

### 4.5 Graph algorithms (`core/graph`) — MVP

The graph is loaded into a `graphology` `MultiDirectedGraph` from `nodes` + `edges` after `detect`, and rebuilt on every run (it's cheap: under 1 s for 10k edges).

| Algorithm | Graph used | Output |
|---|---|---|
| **SCC / cycles** | file-level `imports` (excluding type-only and packages) | `graphology-components` `stronglyConnectedComponents`; each SCC of size > 1 becomes a `cycle` flag ([11](11-health-analysis.md)), with the cycle path found by DFS within the SCC (shortest cycle through the largest-fan-in member) |
| **Communities** | an undirected weighted file graph: `imports` (w=1) + aggregated symbol `calls`/`renders` between files (w = count, capped at 5); packages, tests and config excluded | `graphology-communities-louvain` (resolution 1.0, seeded RNG for stability) → `metrics(node_id=file, metric='community', value=n)`; fed to feature discovery as hints |
| **Fan-in / fan-out** | file: distinct files importing it / it imports; symbol: distinct inbound/outbound `calls`+`references`+`renders`+`extends`+`implements` | `metrics` rows (`fan_in`, `fan_out`, `instability`) |
| **Blast radius (impact)** | see below | `ImpactDTO` |

**Blast-radius BFS** (`query.impact(nodeId, { direction, depth = 3, maxNodes = 300, includeTests = false, includeTypeOnly = false })`):
- **Upstream ("what breaks if this changes")** traverses *inbound* edges of the kinds `calls`, `references`, `renders`, `extends`, `implements`, `imports` (file level), `handles` (to reach routes) and `contains` (only *up* from symbol to file, so file importers are found). For `db_model` roots it traverses inbound `reads`/`writes`; for `env_var` it traverses `uses_env`; for `service` it traverses `calls_service`.
- **Downstream ("what this relies on")** traverses *outbound* edges of the same kinds, plus `reads`, `writes`, `uses_env` and `calls_service` (these are leaves).
- A symbol root also seeds its file's importers that import that symbol's name (`edges.data.names` includes it, or there is a namespace import).
- Each node is visited once, at its minimum distance. The traversal stops at `depth`, or when `maxNodes` is reached (the result then has `truncated: true` in `data`).
- Post-processing: `byFeature` (count of reached nodes per `member_of` feature), `routes` (reached `route` nodes), and edge provenance kept so the UI can dim heuristic paths.

---

## 5. LLM stages (`core/ai/stages`) — MVP

### 5.1 Plan

| Stage | Tier ([07 §4](07-llm-providers.md)) | Unit of work | Calls (≈) | Output |
|---|---|---|---|---|
| `summarize` | `fast` | 1 file (Tier 1/2; Tier 3 if enabled) | #files analysed | `FileSummary` |
| `rollup` | `fast` | 1 directory (bottom-up) | #dirs with ≥2 analysed descendants | `ModuleSummary` |
| `features` | `smart` | whole repo (batched if large) | 1–4 | `Feature[]` (+ flows) |
| `overview` | `smart` | whole repo | 1 | `AppOverview` |
| `changeability` | `smart` | 1 feature | #features | `Changeability` |
| Tier 3 `extract` (Stretch) | `fast` | 1 file | #tier-3 files | symbols/edges |

**Skipped from summarize:** tier 0 files, tests (they get a deterministic summary such as "Tests for `x`" plus an AI tag, unless `ai.summarizeTests: true`), and files under 3 LOC (deterministic one-liners). Barrel `index.ts` files containing only re-exports get the deterministic summary "Re-exports from …".

**Order:** summarize processes files in **reverse topological order of `imports`** (leaves first; SCCs as a batch), so a file's dependencies usually already have summaries to use as context. Concurrency is bounded by the provider pool ([07 §5](07-llm-providers.md)).

### 5.2 File summaries

**Context assembly** (`core/ai/context.ts`). Each part has a token budget; tokens are estimated as `chars / 3.5`:

| Part | Budget | Content |
|---|---|---|
| Header | — | path, language, role hints from detectors (`page`, `api_handler`, `server action`, `client component`, `test`), LOC |
| Source | 6,000 tok (`fast`) | The full file if it fits. Otherwise: imports + signatures of all symbols + the bodies of exported symbols in order until the budget runs out, with `// … N lines omitted` markers |
| Detector facts | 600 tok | Bullet list: routes handled, DB reads/writes (`writes db:prisma:Subscription`), env vars, services, rendered components |
| Downstream (1 hop) | 1,200 tok | For each imported repo file: `id — purpose` (from its existing summary) or `id — exports: a, b, c` if not yet summarised |
| Upstream (1–2 hop) | 800 tok | Up to 10 importers / callers: `id — purpose` (prefer routes and pages; 2-hop only for routes reaching this file) |
| Allowed IDs | — | The **exact list of node IDs** the model may cite: this file's symbols + every neighbour + detector targets |

**Prompt skeleton (`summarize.v1`):**

```
SYSTEM: <shared rules from 07 §7>
You explain one source file of an app to a non-expert. Be concrete. Use the facts given; do not guess connections.
Return JSON matching the schema. Write all prose in {{outputLanguage}}.

USER:
FILE {{path}} ({{language}}, {{loc}} lines) — hints: {{roleHints}}
FACTS (from static analysis — treat as true):
{{detectorFacts}}
THIS FILE USES:
{{downstream}}
USED BY:
{{upstream}}
ALLOWED IDS (cite only these, exactly):
{{allowedIds}}
SOURCE:
```{{lang}}
{{source}}
```
Fill: purpose (≤2 plain sentences), details (≤6 sentences), role (enum), positionInApp (where this runs / who triggers it,
using USED BY and FACTS), sideEffects (from FACTS first, then code), tags (≤12 lowercase search words incl. synonyms a
non-expert would type, e.g. "login","sign in"), symbols (key exported symbols only, by ID), featureHints (≤5 short
nouns), confidence.
```

**Post-processing:** Zod validation ([07 §8](07-llm-providers.md)); drop `symbols[].nodeId` and `sideEffects[].target` values that aren't in the allowed list; merge in the deterministic side effects that the model omitted (reads/writes/env/service edges always appear); store in `summaries` with its `input_hash`.

### 5.3 Module roll-ups
- Walk directories **bottom-up**, by depth descending. Input: the directory path, the children's `purpose` + `role` + `tags` (files and subdirectory ModuleSummaries, capped at 60 children, ranked by fan-in), and the directory's aggregate facts (services, DB models, routes under it).
- Skip directories with fewer than 2 analysed descendants. They inherit their single child's summary by reference.
- Prompt skeleton (`rollup.v1`): *"Here are the parts of folder `{{path}}`. In plain language, what is this folder responsible for in the app? Return `ModuleSummary` (purpose, details, keyFiles (IDs from the list), tags)."*

### 5.4 Feature discovery

**Inputs**, assembled deterministically and budgeted at about 24k tokens:
1. **Module map:** each directory's ID + purpose (depth ≤ 4), plus top-level files with their purposes.
2. **Routes list:** every `route` node with its handler file and that file's `purpose`.
3. **Anchors** from the detectors: services by category (auth: `svc:nextauth` used by files […]; payments: `svc:stripe` used by […]), DB models with their reader/writer files, and env vars grouped by service prefix.
4. **Communities:** the Louvain clusters, each with its top 8 files by fan-in and a merged tag list.
5. **File index:** for every analysed file, `id | role | 6 tags | featureHints`. This is a compact line, so ~400 files fit in about 12k tokens.

**Prompt skeleton (`features.v1`, smart tier):**

```
SYSTEM: <shared rules>
You are mapping an application's FEATURES: user-facing or system capabilities (e.g. "Authentication", "Billing",
"Blog editor", "Email notifications", "Admin"). A feature groups the files that implement it end to end:
entry points (pages/routes), logic, data access, UI. 4–15 features for a typical app. Every analysed file should belong to
at least one feature, or to "Shared infrastructure" / "UI kit" style features if it is generic.
For each feature also describe 1–3 FLOWS: ordered steps from a trigger (a route/page) through the files/symbols involved
to data or external services. Use only IDs from the lists. Write prose in {{outputLanguage}}.

USER: MODULES … ROUTES … ANCHORS … COMMUNITIES … FILE INDEX …
Return { features: Feature[] } (schema attached). Leave dependsOn, services, dataModels empty — they are computed.
```

**Engine post-processing (deterministic):**
1. **Validate IDs.** Drop unknown IDs (see [05 §3](05-data-model.md)). Feature IDs are slugified from the name and deduped (`feature:billing`, `feature:billing-2`).
2. **Coverage pass.** Files with no feature are assigned by majority vote of their 1-hop neighbours' features (with `role: 'support'`, `provenance: 'inferred'`, `confidence: 0.5`). Files still unassigned go to a synthetic `feature:shared` ("Shared code").
3. **Flow verification.** For each consecutive pair of steps (a, b), check for a directed path a → b in the graph (outbound `handles`/`calls`/`renders`/`imports`/`reads`/`writes`/`calls_service`/`contains`, max length 4, treating file↔symbol containment as free). Set `edgeVerified`. A flow with under 50% verified steps is kept but marked low-confidence (`confidence *= 0.5`). The UI shows unverified hops as dashed.
4. **Derive** `services` and `dataModels` (the `svc:*`/`db:*` nodes reachable in 1 hop from members), and `dependsOn` (feature B where ≥ 2 edges go from A's members to B's members and B is not `feature:shared`).
5. **Materialise** `member_of` edges (`provenance: 'inferred'`, `data.role`), and store the `features` rows.

**Large repos** (file index over 400 files or input over 24k tokens):
- **Map:** run `features.v1` per top-level module group (Louvain communities merged until each batch is ≤ 24k tokens) to get candidate features.
- **Reduce:** one `features.merge.v1` call that receives all the candidates (name, summary, entry points, member counts) and returns the merged feature list, with `mergeOf: candidateId[]`. The engine unions the members.

### 5.5 App overview
- Input: the root ModuleSummary, the features (name, summary, entry points, services, dependsOn), the deterministic `stack` from the detectors, the route counts, and the signals for `gaps`. Those signals are deterministic checks: no test files; no auth service while mutating routes exist; no error-tracking service; no `.env.example`; plus health flag counts.
- Prompt skeleton (`overview.v1`, smart): *"Write the front page of this app's explainer for its own developer who may not know how it is built. Explain what it is, who uses it, and how the features fit together, and mention gaps only if the signals support them. Return `AppOverview`."*
- `stack` entries from the model are kept **only if** they match a deterministic stack entry (the model may rename or regroup them, but evidence comes from the detectors).

### 5.6 Tier 3 extraction (Stretch)
- Applies to tier-3 files when `ai.tier3: true`, and to tier-2 files when their grammar is unavailable. Input is the source, truncated to 6k tokens, plus the list of existing repo symbol names (top 500 by fan-in) for linking.
- Output schema: `{ symbols: [{ name, symbolKind, startLine, endLine, exported }], edges: [{ fromSymbol, toName, kind: 'calls'|'imports'|'references'|'reads'|'writes', toPathHint? }], summary: FileSummary }`.
- Edges are linked by name ([§2.3](#23-tier-2--tags-queries-go-stretch-others-later) rules) with `provenance: 'inferred'` and `confidence = min(model, 0.9)`. SQL files: `CREATE TABLE x` → a `db:sql:x` node (this part is deterministic, by regex, `ast`).

### 5.7 Stage error handling

| Failure | Behaviour |
|---|---|
| A single LLM call fails after retries ([07 §5](07-llm-providers.md)) | The item is recorded in `runs.stats.errors`, and the node simply has no summary (the UI shows "Not summarised — retry"); the stage continues |
| Schema validation fails after repair ([07 §8](07-llm-providers.md)) | Same as above |
| Over 30% of the calls in a stage fail | The stage is marked `degraded`; later stages still run with the data that exists; the UI shows a banner |
| `features` fails completely | Fall back to **deterministic features**: one feature per Louvain community, named after the most common tags and the top directory; `confidence: 0.3` |
| Budget exceeded ([07 §5](07-llm-providers.md)) | The current stage stops cleanly; remaining stages run on the summaries that exist; `aiStatus = 'partial'` |
| Run cancelled | In-flight calls are aborted; completed results stay; `runs.status = 'cancelled'` |

---

## 6. Incremental indexing & caching — MVP (on re-run), watch mode Later

### 6.1 Hash recipes (`input_hash`)

| Artifact | `input_hash = sha1(...)` |
|---|---|
| Parse | `files.hash` + adapter version (stored as `parsed_hash`) |
| File summary | file `hash` ‖ sorted `(neighbourId, neighbourSummaryPurposeHash)` for downstream ‖ sorted upstream IDs (not their summaries) ‖ detector-facts JSON ‖ `PROMPT_VERSION.summarize` ‖ model ID ‖ outputLanguage |
| Module summary | sorted child `(id, input_hash)` ‖ `PROMPT_VERSION.rollup` ‖ model ‖ language |
| Features | sorted `(fileId, summary input_hash)` of all files ‖ routes ‖ anchors ‖ `PROMPT_VERSION.features` ‖ model ‖ language |
| Overview | features `input_hash` ‖ stack ‖ gap signals ‖ version ‖ model ‖ language |
| Changeability | feature JSON hash ‖ the feature's metrics/flags snapshot ‖ version ‖ model ‖ language |
| LLM cache (`llm_cache.key`) | provider ‖ model ‖ prompt version ‖ the full rendered prompt. This gives a second cache layer: identical prompts never re-bill, even after the DB rows are invalidated |

Using *downstream summary purposes* (but only *upstream IDs*) as inputs limits the cascades: when a leaf changes, its importers' summaries regenerate only if the leaf's **purpose** text changed.

### 6.2 Invalidation cascade
1. A file's `hash` changed → delete its nodes, its edges (`file_path = f`) and its FTS rows → re-parse it.
2. Re-run `resolve` for **changed files + files that import changed files** (bindings may have moved). MVP simplification: re-run resolve for all files. It's pure CPU, under 2 s for 1k files.
3. Re-run detectors and the graph and health stages (all cheap; always full).
4. Summaries: recompute `input_hash` for every file. Only the mismatches are re-summarised.
5. Roll-ups, features, overview and changeability are recomputed when their input hashes change. Because the MVP treats any summary change as a features change, features re-run (1–4 calls) if any file summary changed.

### 6.3 Deletes and renames
- A path that exists in `files` but not on disk → delete its rows (nodes, edges, summaries, metrics, flags, FTS).
- A rename shows up as delete + add. The file summary is re-used if a new file has an identical `hash` and identical neighbour context, because the LLM cache hits on the identical prompt (only the path differs, so the cache key does change). MVP: accept the re-summarise.

### 6.4 Watch mode (Later)
`chokidar` on the root with the same ignore rules, 500 ms debounce → an `IndexRun` with `mode: 'incremental'`, `changedPaths` given (scan skipped), and AI stages limited to `summarize` for the changed files plus their 1-hop importers. Features are re-run only when the user clicks "Refresh features". The UI gets `ProgressEvent`s on the project-level SSE channel.

---

## 7. Ask agent (`core/ai/ask`) — MVP

### 7.1 Tools
These are thin wrappers over the query layer ([08 §3](08-api.md)). Results are compact JSON, capped at 2k tokens per call (truncated with a `truncated: true` field).

| Tool | Args | Returns |
|---|---|---|
| `find` | `{ query, kinds?, limit=10 }` | fuzzy name/path matches: `NodeRef[]` |
| `search` | `{ query, limit=10 }` | FTS5 matches over name/path/summary/tags/code: `{ node: NodeRef, snippet, score }[]` |
| `get_node` | `{ id }` | node + summary (purpose, role, sideEffects, tags) + features + flag titles |
| `get_neighbors` | `{ id, direction: 'in'|'out'|'both', kinds?, limit=25 }` | `{ edge kind, provenance, node: NodeRef + purpose }[]` |
| `get_impact` | `{ id, direction='up', depth=3 }` | the `ImpactDTO` summary: counts, byFeature, routes, top 20 nodes |
| `list_features` | `{}` | `{ id, name, summary, entryPoints }[]` |
| `get_feature` | `{ id }` | the full Feature (members truncated to 40, by role) |
| `list_routes` | `{ method?, pathContains? }` | `{ id, handler, handlerPurpose, writes[], reads[], services[] }[]`, which is what makes relational questions ("routes that write without auth") answerable |
| `list_db_models` | `{}` | `{ id, readers[], writers[] }[]` |
| `read_source` | `{ id | path, startLine?, endLine? }` | source text (max 200 lines per call; the ignore rules respected) |

### 7.2 Loop (tool-capable providers)
- Model: the `smart` tier. Streamed with the AI SDK `streamText({ tools, maxSteps: 8 })`.
- System prompt (`ask.v1`): the shared rules, plus:
  - answer the user's question about *this* codebase using the tools;
  - prefer `list_features`/`search` first, then drill in;
  - cite every claim as `[[nodeId]]`;
  - if the thing asked for might not exist, follow the **not-found protocol**;
  - end with the final JSON block `{"found": bool, "searched": [...]}` on its own line.
- **Not-found protocol:** before answering `found: false`, the agent must have made **at least 3 distinct searches**, using at least 2 phrasings or synonyms and checking at least one structural list (`list_routes`, `list_features` or `list_db_models`). The engine *enforces* this: if the model concludes "not found" with fewer than 3 distinct `search`/`find` queries, the engine injects one corrective message ("Search more: try synonyms such as …") and continues, within `maxSteps`.
- **Streaming → AskEvent:**
  - tool calls → `{type:'tool', name, args, resultSummary}`, where `resultSummary` is e.g. "5 matches";
  - the model's text → `token` events;
  - the engine emits `thinking` events between steps ("Searching for 'password reset'…");
  - at the end the engine parses the trailing JSON, validates the citations (drops `[[ids]]` that don't exist and rewrites them as plain text), builds `AskAnswer { markdown, found, citations, searched }` and emits `done`.
- `searched` always lists the distinct search/find queries and the lists that were checked, even when `found: true`.

### 7.3 Single-shot retrieval fallback (Claude Code CLI, or any provider with `supportsTools = false`)
1. **Query expansion** (one `fast` call): question → `{ keywords: string[] (≤8, incl. synonyms), kinds?: NodeKind[], wantsStructure: boolean, mightNotExist: boolean }`.
2. **Deterministic retrieval:** for each keyword run `find` + `search` (top 8 each) and merge them by score into the top 20 nodes. Add their features. If `wantsStructure`, add the `list_routes` or `list_db_models` output. Add the 1-hop neighbours (purposes only) of the top 5.
3. **One `smart` call** with the retrieved context (budget 20k tokens), the allowed-ID list and the same answer format. `searched` = the keywords plus the lists added.
4. Output and citation validation are the same as in §7.2. The token stream comes from the provider's streaming where supported; for the CLI adapter the result is emitted as a single `token` event, then `done`.

### 7.4 Limits & errors
- Timeout: 90 s per Ask. Tool errors are returned to the model as `{ error }` and do not abort the Ask.
- If the provider fails, emit `{type:'error', message}`. The UI offers "Retry", and also offers "Search instead", which runs the FTS search with the question text.
- Ask history (`asks` table) is Stretch.
