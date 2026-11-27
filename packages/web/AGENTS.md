# @catalyst/web

- **Owner:** Agent B ("Experience")
- **May import:** `@catalyst/shared` (types, `ids`, Zod schemas) and standard frontend packages.
- **Must NEVER import:** `@catalyst/core`, `@catalyst/server`, Node built-ins (`fs`, `path`, etc.) in `src/`.
- **Implements:** `plan/docs/10-web-ui.md` and `plan/dev/02-agent-b-experience.md` (B0–B11, Stretch B15–B19).
- **Rules:**
  - All UI strings go through `t()` in `src/i18n/t.ts`.
  - All node IDs in URLs/queries use `encodeURIComponent`.
  - No 0–100 health scores, no gradient hero, no stat-tile grid, no emoji icons.
  - Plain English first; technical details one click down.
