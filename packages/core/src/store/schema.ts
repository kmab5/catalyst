export const schema = `PRAGMA journal_mode = WAL;

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- keys: schema_version, project_root, last_index_at, ai_status, output_language, prompt_version, stack_json

CREATE TABLE files (
  path TEXT PRIMARY KEY,                 -- repo-relative POSIX
  hash TEXT NOT NULL,                    -- sha1 of content
  language TEXT NOT NULL,                -- typescript|tsx|javascript|jsx|python|go|... |unknown
  tier INTEGER NOT NULL,                 -- 1|2|3|0 (0 = not analysed: binary, asset)
  loc INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL,
  parsed_hash TEXT,                      -- hash at last successful parse (NULL = needs parse)
  parse_error TEXT
);

CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,                    -- see §1.1
  name TEXT NOT NULL,                    -- display name
  file_path TEXT,                        -- owning file (NULL for package/service/env/feature/db when global)
  start_line INTEGER, end_line INTEGER,
  symbol_kind TEXT,                      -- for kind=symbol
  exported INTEGER NOT NULL DEFAULT 0,
  signature TEXT,                        -- e.g. "getCurrentUser(): Promise<User | null>"
  provenance TEXT NOT NULL, confidence REAL NOT NULL DEFAULT 1.0,
  data TEXT                              -- JSON: kind-specific extras (route method/path, db orm, isTest, client: true for 'use client', etc.)
);
CREATE INDEX nodes_file ON nodes(file_path);
CREATE INDEX nodes_kind ON nodes(kind);

CREATE TABLE edges (
  src TEXT NOT NULL, dst TEXT NOT NULL, kind TEXT NOT NULL,
  provenance TEXT NOT NULL, confidence REAL NOT NULL DEFAULT 1.0,
  file_path TEXT,                        -- file where the edge was observed (for invalidation)
  line INTEGER,
  data TEXT,                             -- JSON (e.g. imported names, role for member_of)
  PRIMARY KEY (src, dst, kind)
);
CREATE INDEX edges_dst ON edges(dst, kind);
CREATE INDEX edges_file ON edges(file_path);

CREATE TABLE summaries (
  node_id TEXT NOT NULL,
  language TEXT NOT NULL,                -- output language: en|tr
  kind TEXT NOT NULL,                    -- file|module|symbol
  input_hash TEXT NOT NULL,              -- hash(content + neighbour context + prompt_version + model)
  model TEXT NOT NULL,
  json TEXT NOT NULL,                    -- FileSummary | ModuleSummary
  created_at INTEGER NOT NULL,
  PRIMARY KEY (node_id, language)
);

CREATE TABLE features (
  id TEXT NOT NULL, language TEXT NOT NULL,
  json TEXT NOT NULL,                    -- Feature (members/flows inline)
  input_hash TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY (id, language)
);
-- membership is ALSO materialised as edges(kind='member_of') for graph queries

CREATE TABLE overview (language TEXT PRIMARY KEY, json TEXT NOT NULL, input_hash TEXT NOT NULL, created_at INTEGER NOT NULL);

CREATE TABLE metrics (node_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL, PRIMARY KEY (node_id, metric));
-- metrics: loc, complexity, complexity_max, fan_in, fan_out, fan_out_pkg, instability, exports, symbols, depth,
--          community (Louvain id), coupling:<featureId> (feature nodes only: edge count to that feature). See 11 §1.

CREATE TABLE flags (
  id TEXT PRIMARY KEY,                   -- "<rule>:<nodeId>"
  rule TEXT NOT NULL,                    -- see 11-health-analysis.md
  severity TEXT NOT NULL,                -- info|warn|high
  node_id TEXT NOT NULL,
  title TEXT NOT NULL,                   -- deterministic template text (plain English)
  explanation TEXT,                      -- optional AI-polished "why it matters" (Stretch)
  evidence TEXT NOT NULL                 -- JSON: { metrics, nodeIds, cycle?: string[] }
);

CREATE TABLE llm_cache (
  key TEXT PRIMARY KEY,                  -- sha1(provider+model+prompt_version+input)
  response TEXT NOT NULL, tokens_in INTEGER, tokens_out INTEGER, created_at INTEGER NOT NULL
);

CREATE TABLE runs (
  id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, finished_at INTEGER,
  status TEXT NOT NULL,                  -- running|done|error|cancelled
  stats TEXT                             -- JSON: counts, tokens, cost estimate, duration per stage
);

CREATE TABLE asks (                      -- Stretch: Ask history
  id TEXT PRIMARY KEY, question TEXT NOT NULL, answer_json TEXT, created_at INTEGER NOT NULL
);

CREATE VIRTUAL TABLE search_fts USING fts5(
  node_id UNINDEXED, kind UNINDEXED,
  name, path, summary, tags, code,
  tokenize = 'porter unicode61'
);`;
