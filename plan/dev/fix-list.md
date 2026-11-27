# Integration findings

| Priority | Finding | Resolution and verification |
|---|---|---|
| P0 | FastAPI endpoints lost the application prefix, and indirect SQLModel subclasses disappeared from the graph. | Followed mounted routers and their settings-defined prefix and resolved inherited table models. The real backend now has 23 mounted routes and both named tables. The golden-pattern tests exercise these cases. |
| P0 | The Taxonomy auth factory, validated environment access, and several TypeScript expression references were missing. | Fixed extraction and import resolution. Compared all 43 connections on five X-Ray panels with source. |
| P0 | An unavailable provider could keep receiving paid requests after an HTTP 402 response. | Queued work now stops after the rejection. The index retains completed results and reports the billing failure. Tests also cover invalid credentials and transient rate limits. |
| P0 | An absence answer could count a failed search, and a single-shot answer could cite a node outside its retrieved evidence. | Ask now counts successful tool calls and checks single-shot citations against retrieved IDs. Found and absent answers run through the actual HTTP streaming endpoint in the integration suite. |
| P1 | Summaries for unrelated files waited for one another. | Independent components now run concurrently, while importers wait for dependency summaries. The scheduler test measures overlap and verifies the dependency ordering. |
| P1 | Concurrent CLI launches could lose entries from the recent-projects file. | A short SQLite transaction serializes updates to the JSON file across processes. Readers still see atomically replaced JSON. |
| P1 | A second process could show a stale graph or miss run events. | The query cache tracks external database changes, and bounded event history supports replay across connections. A two-engine regression verifies status, replay, and shutdown. |

**External acceptance dependency.** The configured OpenRouter account returned HTTP 402 during the live Taxonomy run. A funded provider is needed to complete live semantic acceptance and capture the two real Ask answers. See the [acceptance record](e2e-results.md).
