import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type Database from 'better-sqlite3';
import { asSchema, NoObjectGeneratedError } from 'ai';
import { ZodError } from 'zod';
import { parseOutput } from './json.js';
import { price } from './pricing.js';
import { redactSecrets } from './redact.js';
import { PROMPT_VERSION } from './defaults.js';
import type {
  LLMProvider,
  TextRequest,
  ObjectRequest,
  StreamRequest,
  StreamPart,
  LLMUsage,
  ModelTier,
} from './providers/types.js';
export const hash = (...pieces: unknown[]) =>
  createHash('sha1').update(JSON.stringify(pieces)).digest('hex');
export class LLMClient {
  private active = 0;
  private waiters = new Set<() => void>();
  private reserved = 0;
  private exceeded = false;
  private authFailed = false;
  private terminalError: string | null = null;
  private stopProvider = new AbortController();
  private slowUntil = 0;
  private unsupportedSchemas = new Set<string>();
  private stats = { tokensIn: 0, tokensOut: 0, calls: 0, cacheHits: 0, costUsd: null as number | null };
  readonly repairs: Record<string, number> = {};
  readonly concurrency: number;
  constructor(
    readonly provider: LLMProvider,
    private db: Database.Database,
    private options: {
      concurrency?: number;
      budgetUsd?: number | null;
      signal?: AbortSignal;
      promptVersion?: Record<string, number>;
    } = {},
  ) {
    this.concurrency = Math.max(
      1,
      Math.min(32, options.concurrency ?? (provider.id === 'claude-code' ? 3 : provider.local ? 2 : 6)),
    );
  }
  usage() {
    return { ...this.stats };
  }
  budgetExceeded() {
    return this.exceeded;
  }
  rejectedKey() {
    return this.authFailed;
  }
  failureReason() {
    return this.terminalError;
  }
  private async acquire(signal?: AbortSignal) {
    while (true) {
      signal?.throwIfAborted();
      this.options.signal?.throwIfAborted();
      if (this.terminalError) throw new Error(this.terminalError);
      if (
        this.active <
        (Date.now() < this.slowUntil ? Math.max(1, Math.floor(this.concurrency / 2)) : this.concurrency)
      )
        break;
      await new Promise<void>((resolve) => {
        const wake = () => {
          this.waiters.delete(wake);
          signal?.removeEventListener('abort', wake);
          resolve();
        };
        this.waiters.add(wake);
        signal?.addEventListener('abort', wake, { once: true });
      });
    }
    this.active++;
  }
  private release() {
    this.active--;
    for (const wake of [...this.waiters]) wake();
  }
  private reserve(tier: ModelTier, chars: number, out: number) {
    let cost = price(this.provider.modelFor(tier), Math.ceil(chars / 3.5), out);
    if (this.provider.local || this.provider.id === 'claude-code') cost = 0;
    if (
      this.options.budgetUsd != null &&
      (cost === null || (this.stats.costUsd ?? 0) + this.reserved + cost > this.options.budgetUsd)
    ) {
      this.exceeded = true;
      throw new Error('BUDGET_EXCEEDED');
    }
    this.reserved += cost ?? 0;
    return cost ?? 0;
  }
  private account(tier: ModelTier, u: LLMUsage) {
    this.stats.tokensIn += u.inputTokens;
    this.stats.tokensOut += u.outputTokens;
    if (this.provider.local || this.provider.id === 'claude-code') return;
    const cost = u.costUsd ?? price(this.provider.modelFor(tier), u.inputTokens, u.outputTokens);
    if (cost !== null) this.stats.costUsd = (this.stats.costUsd ?? 0) + cost;
  }
  private async call<T extends { usage: LLMUsage }>(
    r: TextRequest,
    fn: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const signals = [this.options.signal, r.signal, this.stopProvider.signal].filter(
      (s): s is AbortSignal => !!s,
    );
    const signal = AbortSignal.any(signals);
    await this.acquire(signal);
    let reserved = 0;
    try {
      reserved = this.reserve(r.tier, r.prompt.length + r.system.length, r.maxOutputTokens ?? 1500);
      for (let attempt = 0; ; attempt++) {
        signal.throwIfAborted();
        this.stats.calls++;
        try {
          const timeout = AbortSignal.timeout(
            this.provider.id === 'claude-code' || r.tier === 'smart' ? 120000 : 60000,
          );
          const result = await fn(AbortSignal.any([timeout, signal]));
          this.account(r.tier, result.usage);
          return result;
        } catch (err) {
          signal.throwIfAborted();
          const e = err as {
            statusCode?: number;
            status?: number;
            responseHeaders?: Record<string, string>;
            name?: string;
            code?: string;
          };
          const status = e.statusCode ?? e.status;
          if (status === 401 || status === 403 || status === 402) {
            this.authFailed = status !== 402;
            // Provider error bodies may contain submitted source or credentials. Preserve the
            // actionable billing diagnosis, and cancel queued work before another request is sent.
            this.terminalError =
              status === 402
                ? this.provider.label +
                  ' requires more credits for this request (HTTP 402). Add credit or select a funded provider in Settings.'
                : 'Provider rejected the key';
            const reason = new Error(this.terminalError);
            this.stopProvider.abort(reason);
            throw reason;
          }
          if (status === 429) this.slowUntil = Date.now() + 60000;
          const transient =
            status === 429 ||
            (status ?? 0) >= 500 ||
            err instanceof TypeError ||
            ['TimeoutError', 'AbortError'].includes(e.name ?? '') ||
            ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].includes(e.code ?? '');
          if (attempt >= 4 || !transient) throw err;
          const retry = e.responseHeaders?.['retry-after'];
          const ms = retry
            ? Number.isFinite(Number(retry))
              ? Number(retry) * 1000
              : Date.parse(retry) - Date.now()
            : Math.random() * Math.min(30000, 1000 * 2 ** attempt);
          await delay(Math.max(0, ms), undefined, { signal });
        }
      }
    } finally {
      this.reserved -= reserved;
      this.release();
    }
  }
  private async textResult(req: TextRequest) {
    const r = {
      ...req,
      maxOutputTokens: req.maxOutputTokens ?? 1500,
      prompt: redactSecrets(req.prompt),
      system: redactSecrets(req.system),
    };
    return this.call(r, (signal) => this.provider.generateText({ ...r, signal }));
  }
  async text(req: TextRequest) {
    return (await this.textResult(req)).text;
  }
  async object<T>(stage: string, request: ObjectRequest<T>): Promise<T> {
    this.options.signal?.throwIfAborted();
    request.signal?.throwIfAborted();
    const r = {
      ...request,
      maxOutputTokens: request.maxOutputTokens ?? (stage === 'features' ? 6000 : 1500),
      prompt: redactSecrets(request.prompt),
      system: redactSecrets(request.system),
    };
    const version =
      (this.options.promptVersion ?? (PROMPT_VERSION as Record<string, number>))[stage] ?? 1;
    const key = hash(
      this.provider.id,
      this.provider.modelFor(r.tier),
      stage,
      version,
      r.schemaName,
      r.system,
      r.prompt,
    );
    const cached = this.db.prepare('SELECT response FROM llm_cache WHERE key=?').get(key) as
      | { response: string }
      | undefined;
    if (cached) {
      const valid = r.schema.safeParse(JSON.parse(cached.response));
      if (valid.success) {
        this.stats.cacheHits++;
        return valid.data;
      }
    }
    let result: T | undefined;
    let invalid: unknown;
    const tokens = { inputTokens: 0, outputTokens: 0 };
    const record = (u: LLMUsage) => {
      tokens.inputTokens += u.inputTokens;
      tokens.outputTokens += u.outputTokens;
    };
    const fallbackText = async (req: TextRequest) => {
      const response = await this.textResult(req);
      record(response.usage);
      return response.text;
    };
    const schemaKey = this.provider.modelFor(r.tier) + '/' + r.schemaName;
    if (this.provider.supportsStructuredOutput && !this.unsupportedSchemas.has(schemaKey)) {
      try {
        const response = await this.call(r, (signal) => this.provider.generateObject({ ...r, signal }));
        record(response.usage);
        invalid = response.object;
        result = parseOutput(response.object, r.schema);
      } catch (error) {
        // Some compatible endpoints reject particular JSON Schema keywords. Retry using text
        // only for that protocol error. Invalid keys and other bad requests still fail immediately.
        const http = error as { statusCode?: number; message?: string; responseBody?: string };
        const unsupported =
          http.statusCode === 400 &&
          /response_format|json.schema|structured.outputs?/i.test(
            [http.message, http.responseBody].join(' '),
          );
        if (unsupported) this.unsupportedSchemas.add(schemaKey);
        if (
          !unsupported &&
          invalid === undefined &&
          !NoObjectGeneratedError.isInstance(error) &&
          !(error instanceof ZodError)
        )
          throw error;
        if (NoObjectGeneratedError.isInstance(error)) {
          invalid = error.text;
          if (error.usage) {
            const usage = {
              inputTokens: error.usage.inputTokens ?? 0,
              outputTokens: error.usage.outputTokens ?? 0,
            };
            record(usage);
            this.account(r.tier, usage);
          }
        }
      }
    }
    if (result === undefined) {
      const schema = JSON.stringify(await asSchema(r.schema).jsonSchema);
      if (invalid === undefined)
        invalid = await fallbackText({
          ...r,
          prompt: r.prompt + '\nReturn JSON matching this schema:\n' + schema,
        });
      try {
        result = parseOutput(invalid, r.schema);
      } catch (err) {
        this.repairs[stage] = (this.repairs[stage] ?? 0) + 1;
        const details =
          err instanceof ZodError
            ? err.issues.slice(0, 10).map((i) => [i.path, i.message])
            : 'Invalid JSON';
        const fixed = await fallbackText({
          ...r,
          tier: 'fast',
          prompt:
            'Fix this JSON to match the schema. Return only JSON.\n' +
            JSON.stringify({ schema, invalid, details }),
        });
        result = parseOutput(fixed, r.schema);
      }
    }
    this.db
      .prepare(
        'INSERT OR REPLACE INTO llm_cache(key,response,tokens_in,tokens_out,created_at) VALUES(?,?,?,?,?)',
      )
      .run(key, JSON.stringify(result), tokens.inputTokens, tokens.outputTokens, Date.now());
    return result;
  }
  async *stream(req: StreamRequest): AsyncIterable<StreamPart> {
    const signal = AbortSignal.any(
      [this.options.signal, req.signal, this.stopProvider.signal, AbortSignal.timeout(90000)].filter(
        (s): s is AbortSignal => !!s,
      ),
    );
    const messages = req.messages.map((m) => ({ ...m, content: redactSecrets(m.content) }));
    await this.acquire(signal);
    let reserved = 0;
    try {
      reserved = this.reserve(req.tier, JSON.stringify(messages).length + req.system.length, 4096);
      this.stats.calls++;
      for await (const part of this.provider.streamText({
        ...req,
        system: redactSecrets(req.system),
        messages,
        signal,
      })) {
        if (part.type === 'finish') this.account(req.tier, part.usage);
        yield part;
      }
    } finally {
      this.reserved -= reserved;
      this.release();
    }
  }
}
