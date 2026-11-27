# 11 — Health Analysis

The health stage runs after `graph` ([06 §4.5](06-analysis-pipeline.md)). It is **fully deterministic**: it computes `metrics` and `flags` ([05 §4](05-data-model.md)). The only AI parts are the per-feature **changeability cards** (§4) and an optional "why it matters" polish on flags (Stretch). There is **no single health score** ([ADR-0007](decisions/0007-no-single-health-score.md)).

## 1. Metrics (`metrics` table)

| Metric | Level | Definition |
|---|---|---|
| `loc` | file, symbol | Non-blank, non-comment-only lines. For a symbol, `end_line - start_line + 1` minus blank lines |
| `complexity` | symbol (function/method/component/hook) | Cyclomatic complexity = 1 + the number of branch nodes in the symbol's subtree, **excluding nested function bodies** (each of those counts on its own). TS/JS branch nodes: `if_statement`, `for_statement`, `for_in_statement`, `while_statement`, `do_statement`, `switch_case` (non-default), `catch_clause`, `ternary_expression`, binary `&&`, `||`, `??`, optional-chain call `?.()` (not counted). Python: `if_statement`, `elif_clause`, `for_statement`, `while_statement`, `except_clause`, `conditional_expression`, `boolean_operator` (`and`/`or`), `case_clause`, comprehension `if` clauses |
| `complexity` | file | The sum of its symbols' complexity, also stored as `complexity_max` |
| `fan_in` | file | The number of **distinct repo files** with an `imports` edge to this file (type-only and test importers excluded) |
| `fan_out` | file | The number of distinct repo files this file imports (packages counted separately in `fan_out_pkg`) |
| `fan_in` / `fan_out` | symbol | Distinct inbound / outbound symbols over `calls`, `references`, `renders`, `extends`, `implements` (tests excluded) |
| `instability` | file, directory | `fan_out / (fan_in + fan_out)`, or 0 when both are 0. 0 = stable, depended upon; 1 = unstable, only depends on others |
| `exports` | file | Count of exported symbols |
| `symbols` | file | Count of symbols defined |
| `depth` | file | The longest import chain from any entry point (route/page) to this file (BFS over `handles`+`imports`, capped at 20); `-1` if unreachable from any entry point |
| `community` | file | The Louvain community index ([06 §4.5](06-analysis-pipeline.md)) |
| `feature_coupling` | feature | `{ [otherFeatureId]: edgeCount }`, stored as JSON in `features.json.changeability.couplings` and in the `metrics` rows `coupling:<otherId>` |

The directory-level metrics (`loc`, `fan_in`, `fan_out`, `instability`) aggregate over the files in that directory: an edge counts only if it crosses the directory boundary.

## 2. Flag rules

All flags are stored in `flags`, with `id = <rule>:<nodeId>`. `title` is a **deterministic plain-English template** rendered at analysis time. `evidence` JSON always includes the metrics and node IDs that triggered it.

| Rule ID | Detects | Computation | Default threshold | Severity | Title template | Priority |
|---|---|---|---|---|---|---|
| `cycle` | Circular imports | SCC with size > 1 on the file `imports` graph (no type-only, no tests). One flag per SCC, anchored at the member with the highest fan-in; `evidence.cycle` = the ordered path | any | `high` if size ≥ 4 or any member is a route/page handler, else `warn` | "{{n}} files import each other in a loop: {{a}} → {{b}} → … → {{a}}. Changing any of them can have surprising effects on the others." | MVP |
| `god-file` | A file doing too much | `loc ≥ T.loc` **and** (`exports ≥ T.exports` **or** `complexity ≥ T.complexity` **or** the AI summary `sideEffects` span ≥ 3 distinct kinds) | `loc 400`, `exports 12`, `complexity 60` | `high` if loc ≥ 800, else `warn` | "{{path}} is very large ({{loc}} lines, {{exports}} exports) and mixes several jobs. Splitting it would make changes safer." | MVP |
| `god-function` | An overly complex function | `complexity ≥ T.cc` **or** `loc ≥ T.loc` | `cc 15`, `loc 80` | `high` if cc ≥ 25, else `warn` | "{{name}} has {{cc}} decision points across {{loc}} lines, which makes it hard to follow and easy to break." | MVP |
| `hub` | A file many things depend on (risky to change) | `fan_in ≥ max(T.minFanIn, P95 of file fan_in)` | `minFanIn 10` | `info` (a hub is not bad; it's "handle with care") | "{{n}} files depend on {{path}}. Treat changes here as high-impact." | MVP |
| `unused-export` | Dead code candidates | An exported symbol with zero inbound `calls`/`references`/`renders`/`imports`-by-name from non-test files. **Exclusions:** the symbol is a route handler or page (`handles` target); the file is a Next.js special file (`page`, `layout`, `route`, `loading`, `error`, `not-found`, `template`, `default`, `middleware`, `instrumentation`, `*.config.*`) or exports a Next.js convention name (`metadata`, `generateMetadata`, `generateStaticParams`, `revalidate`, `dynamic`, `config`, `runtime`); the file is a test, a story or a script; `index.*` / `__init__.py` re-exports; the file is a package entry (`main`/`exports` in package.json); the symbol is referenced by a decorator registry (FastAPI/Flask handlers, pytest fixtures `conftest.py`, Django `models`/`admin`); a CLI entry (`if __name__ == "__main__"` file) | — | `info` (`warn` if the symbol's loc ≥ 30) | "{{name}} is exported but nothing in the project uses it. It may be dead code." | MVP |
| `single-impl-interface` | An abstraction with only one implementation | A TS `interface`/`abstract class` or Python `ABC`/`Protocol` with exactly **1** `implements`/`extends` inbound edge, **and** not exported from a package entry | 1 impl | `info` | "{{name}} is an interface with only one implementation ({{impl}}). The extra layer may not be needed yet." | Stretch |
| `pass-through-wrapper` | Needless indirection | A function whose body is a single `return <call>(...)` (or an arrow expression body) where the call's arguments are exactly its own parameters in order, with no other statements; the callee resolves (provenance `ast`/`resolved`) | — | `info` | "{{name}} only forwards its arguments to {{callee}}. Calling {{callee}} directly would be simpler." | Stretch |
| `cross-feature-coupling` | Features that are tangled together | For each feature pair (A, B) excluding `feature:shared`, count the edges from A's members to B's members. Flag the pair if `count ≥ T.edges` **and** `count / edgesOut(A) ≥ T.ratio`; anchored on `feature:A` | `edges 8`, `ratio 0.25` | `warn` | "{{A}} is tightly connected to {{B}} ({{count}} links). Changing one will often mean changing the other." | Stretch (MVP: numbers shown in the changeability card) |
| `deep-relative-import` | Brittle paths | An import specifier with ≥ `T.depth` `../` segments | `depth 4` | `info` | "{{path}} reaches {{n}} folders up to import {{target}}. A path alias would be less fragile." | Stretch |
| `unguarded-external-call` | Missing error handling | Inside a route handler or server action (or ≤1 call hop from one), a `calls_service` edge or `fetch`/`axios` call site that is not lexically inside a `try` block (or `.catch(` chain), and the handler has no try at its top level | — | `warn` | "{{name}} calls {{service}} without handling failures. If {{service}} is down, this request will crash." | Stretch |
| `hardcoded-config` | Secrets/config in code | A string literal matching key patterns (`sk_live_`, `sk_test_`, `AKIA[0-9A-Z]{16}`, `ghp_`, `xox[bp]-`, JWT-shaped strings, `-----BEGIN`), **or** an `http(s)://` literal with a non-localhost host in a non-config, non-test file (`info`). The secret value is **never stored**: `evidence` holds the line number and pattern name only | — | `high` for key patterns, `info` for URLs | "{{path}}:{{line}} appears to contain a hardcoded {{kind}}. Move it to an environment variable." | Stretch |
| `missing-auth-on-mutating-route` | Possibly unprotected writes | For each `route` with method ∈ {POST, PUT, PATCH, DELETE, ANY} (or a server action) whose downstream BFS (depth 4) reaches a `writes` edge, check whether the same BFS reaches any auth signal: a `calls_service` to an auth-category service, a call to a symbol tagged `auth` in its summary, or a symbol whose name matches `/(get|require|check|verify|ensure)(User|Session|Auth|Admin)|auth|current_user|Depends\(.*user/i`; or Next.js `middleware` with a matcher covering the path. Flag if none is found | — | `high` | "{{route}} changes data in {{models}} but no login/permission check was found on its path. Confirm it is meant to be public." | Stretch |

**Rules for flag text.** Titles are templates filled from evidence: no LLM is needed, and the text is stable across runs. The optional `explanation` (Stretch) is one `fast` call per flag batch that adds a "why this matters here" sentence using the file's summary. It is labelled `AI-inferred` in the UI.

**Severity semantics:** `high` = likely to cause bugs or block changes; `warn` = makes changes harder; `info` = worth knowing.

## 3. Thresholds (`catalyst.config.json`)

```jsonc
{
  "health": {
    "disabled": ["deep-relative-import"],          // rule IDs to skip
    "thresholds": {
      "god-file":      { "loc": 400, "exports": 12, "complexity": 60 },
      "god-function":  { "cc": 15, "loc": 80 },
      "hub":           { "minFanIn": 10 },
      "cross-feature-coupling": { "edges": 8, "ratio": 0.25 },
      "deep-relative-import":   { "depth": 4 }
    },
    "ignore": ["src/generated/**", "**/*.stories.tsx"]   // files excluded from all health rules
  }
}
```

The loader merges this config with the defaults in `core/analyze/thresholds.ts`. Unknown keys are a warning, not an error. Changing a threshold re-runs only the `health` stage (cheap, with no AI).

## 4. Changeability cards (per feature) — MVP

### 4.1 Schema (`shared/schemas/changeability.ts`)

```ts
const Ease = z.enum(['easy', 'moderate', 'hard']);

const Changeability = z.object({
  addEase:    z.object({ level: Ease, reason: z.string() }),   // adding a new capability to this feature (e.g. a new plan tier)
  changeEase: z.object({ level: Ease, reason: z.string() }),   // modifying existing behaviour
  removeEase: z.object({ level: Ease, reason: z.string() }),   // deleting the feature entirely
  touchpoints: z.array(z.string()),       // node IDs you would most likely touch for a typical change (≤ 12)
  risks: z.array(z.object({ text: z.string(), nodeIds: z.array(z.string()) })),   // ≤ 5 concrete risks
  couplings: z.array(z.object({ featureId: z.string(), edgeCount: z.number(), note: z.string() })),
  citesMetrics: z.array(z.object({ name: z.string(), value: z.union([z.number(), z.string()]), nodeId: z.string().optional() })),
  summary: z.string(),                    // 1–2 plain sentences: "Billing is fairly self-contained, but removing it touches the dashboard layout and the User model."
});
```

### 4.2 Deterministic inputs (computed by the engine; passed as FACTS)

| Input | How |
|---|---|
| Member counts by role | from `member_of` edges |
| Entry points | `feature.entryPoints` with methods/paths |
| **Inbound coupling** | edges from other features' members → this feature's members, by feature (what depends on this feature; drives `removeEase`) |
| **Outbound coupling** | edges from this feature → others (what it depends on) |
| Shared data | the `db_model`s this feature writes that other features read or write |
| Cycles inside | `cycle` flags whose members intersect this feature (and whether they cross feature boundaries) |
| Hubs inside | `hub` flags on members, with fan-in |
| Complexity hot spots | the top 3 members by `complexity_max`, plus any god-file/god-function flags |
| Spread | the number of distinct top-level directories its members live in (a scattered feature is harder to remove) |
| Removal blast radius | the union of upstream impact (depth 3) from all members, restricted to nodes **outside** the feature: count, plus the top 10 by fan-in |

**Deterministic pre-grading.** The engine computes a *suggested* level for each ease value, and the model may move it by at most one step, but must give a reason when it does.
- `removeEase`: `easy` if the outside blast radius is ≤ 5 nodes and there is no shared written model; `hard` if it is ≥ 25, or there is a cross-feature cycle, or a shared written model is read by ≥ 2 other features; otherwise `moderate`.
- `changeEase`: `hard` if a hub with fan-in ≥ 20 or a god-function/god-file is among the members, or a cycle is inside; `easy` if members ≤ 6 and max complexity < 10; otherwise `moderate`.
- `addEase`: `easy` if the feature has a clear entry-point → service → data layering (flows ≥ 50% `edgeVerified` and spread ≤ 2 dirs); `hard` if spread ≥ 4 or a god-file is a core member; otherwise `moderate`.

### 4.3 Stage
- One `smart` call per feature (`changeability.v1`), with the feature JSON, the FACTS above, the suggested levels and the allowed IDs (members + the outside-impact nodes).
- Prompt skeleton:

```
SYSTEM: <shared rules>
Assess how easy it is to ADD to, CHANGE, and REMOVE this feature, for a developer who did not write it.
Start from SUGGESTED levels (computed from the dependency graph); you may move a level by one step only, and must say why.
Reasons must reference concrete files/metrics from FACTS (cite [[id]]). Risks must be specific and actionable.
USER: FEATURE … FACTS … SUGGESTED { add, change, remove } … ALLOWED IDS …
```

- **Validation:**
  - drop unknown IDs;
  - if a level moved more than one step from the suggestion, clamp it to the suggestion ±1 and append "(adjusted)" to its reason;
  - `couplings` is **overwritten** with the deterministic edge counts (the model supplies only the `note`);
  - `citesMetrics` entries must match the FACTS values, and mismatches are dropped.
- **Fallback** without AI, or on failure: the card is built from the suggested levels and template reasons ("Removing Billing would affect 14 files outside it, including [[file:app/(dashboard)/layout.tsx]]."). It is labelled `Heuristic`.

## 5. Presentation guidance (consumed by [10-web-ui.md](10-web-ui.md))

- **No single score** ([ADR-0007](decisions/0007-no-single-health-score.md)). The Health page shows **counts by severity** and **by rule**, grouped by feature, and never shows a 0–100 grade.
- Every flag shows:
  1. the plain-English title;
  2. **"Why this matters"**: a static one-liner per rule, written once in `core/analyze/rules/*.ts`, e.g. for `cycle`, "Files in a loop can't be understood or tested on their own, and a change can ripple around the loop" (plus the AI-polished explanation when it's available);
  3. the evidence (metrics + clickable node chips);
  4. "Show in graph", which highlights the nodes and the cycle path.
- Language is deliberately non-judgmental: say "worth a look" or "handle with care", never "bad code". A `hub` is shown as information, not a problem.
- The X-Ray panel shows the node's own flags inline. The feature detail page shows the changeability card at the top with three ease pills (`easy` / `moderate` / `hard`) and their reasons. Developer-level metrics (fan-in, instability, complexity) sit in a collapsible "Numbers" section.
