import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';
import {
  GlobalConfig,
  ProviderConfig,
  type ProvidersDetectDTO,
  type SettingsDTO,
  type SettingsUpdate,
} from '@catalyst/shared';
import { readJson, writeJson } from '../project/local.js';
import { createProvider, DEFAULT_MODELS } from '../ai/index.js';

function claudePath(env: NodeJS.ProcessEnv) {
  for (const dir of (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean)) {
    const bin = join(dir, process.platform === 'win32' ? 'claude.exe' : 'claude');
    if (existsSync(bin)) return bin;
  }
}
export async function detectProviders(env: NodeJS.ProcessEnv): Promise<ProvidersDetectDTO> {
  const binary = claudePath(env);
  const [cli, ollama] = await Promise.all([
    binary
      ? promisify(execFile)(binary, ['--version'], { timeout: 2000, env, windowsHide: true }).then(
          (r) => ({ found: true, version: r.stdout.trim() }),
          () => ({ found: false }),
        )
      : Promise.resolve({ found: false }),
    fetch('http://127.0.0.1:11434/api/tags', {
      signal: AbortSignal.timeout(500),
      redirect: 'error',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = (await res.json()) as { models: Array<{ name: string }> };
        return { found: true, models: data.models.map((m) => m.name) };
      })
      .catch(() => ({ found: false, models: [] })),
  ]);
  return {
    claudeCli: cli,
    ollama,
    env: {
      ANTHROPIC_API_KEY: !!env.ANTHROPIC_API_KEY,
      OPENROUTER_API_KEY: !!env.OPENROUTER_API_KEY,
      OPENAI_API_KEY: !!env.OPENAI_API_KEY,
    },
  };
}
function fromEnv(env: NodeJS.ProcessEnv): ProviderConfig | null {
  const type =
    env.CATALYST_PROVIDER ??
    (env.ANTHROPIC_API_KEY
      ? 'anthropic'
      : env.OPENROUTER_API_KEY
        ? 'openrouter'
        : env.OPENAI_API_KEY
          ? 'openai-compatible'
          : claudePath(env)
            ? 'claude-code'
            : 'none');
  switch (type) {
    case 'claude-code':
      return { type, binary: claudePath(env) ?? 'claude' };
    case 'anthropic':
      return env.ANTHROPIC_API_KEY ? { type, apiKey: env.ANTHROPIC_API_KEY } : null;
    case 'openrouter':
      return env.OPENROUTER_API_KEY
        ? ProviderConfig.parse({ type, apiKey: env.OPENROUTER_API_KEY })
        : null;
    case 'openai-compatible':
      return ProviderConfig.parse({
        type,
        baseUrl: env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
        apiKey: env.OPENAI_API_KEY,
      });
    default:
      return null;
  }
}
export function maskKey(key: string) {
  return (
    (key.length > 8 ? key.slice(0, Math.min(6, key.length - 4)) : '') +
    '…' +
    (key.length > 4 ? key.slice(-4) : '')
  );
}
function defaults(p: ProviderConfig | null) {
  return { ...DEFAULT_MODELS[p?.type ?? 'anthropic'] };
}
type Saved = Partial<GlobalConfig>;
export class SettingsStore {
  private file: string;
  constructor(
    home: string,
    private env: NodeJS.ProcessEnv,
  ) {
    this.file = join(home, '.catalyst', 'config.json');
  }
  resolved() {
    const saved = readJson<Saved>(this.file, {});
    const configured = Object.hasOwn(saved, 'provider');
    const provider = configured ? (saved.provider ?? null) : fromEnv(this.env);
    const models = { ...defaults(provider), ...saved.models };
    models.fast = this.env.CATALYST_MODEL_FAST ?? models.fast;
    models.smart = this.env.CATALYST_MODEL_SMART ?? models.smart;
    const config = GlobalConfig.parse({
      ...saved,
      version: 1,
      provider,
      models,
      outputLanguage: this.env.CATALYST_LANG ?? saved.outputLanguage,
    });
    return { config, provider: config.provider, configured };
  }
  get(): SettingsDTO {
    const { config, provider: p, configured } = this.resolved();
    const key = p && 'apiKey' in p ? p.apiKey : null;
    return {
      ...config,
      provider: p
        ? {
            type: p.type,
            baseUrl: 'baseUrl' in p ? p.baseUrl : null,
            binary: 'binary' in p ? p.binary : null,
            apiKeyMasked: key ? maskKey(key) : null,
            apiKeySource: key ? (configured ? 'config' : 'env') : 'none',
            autoDetected: !configured,
          }
        : null,
    };
  }
  update(update: SettingsUpdate) {
    const saved = readJson<Saved>(this.file, {});
    const old = this.resolved();
    if (update.provider !== undefined) {
      const next = update.provider;
      if (next && 'apiKey' in next && next.apiKey === null) {
        saved.provider =
          next.type === 'openai-compatible'
            ? ProviderConfig.parse({
                ...(old.provider?.type === next.type ? old.provider : {}),
                ...next,
                apiKey: undefined,
              })
            : null;
      } else {
        saved.provider = next
          ? ProviderConfig.parse({
              ...(old.provider?.type === next.type ? old.provider : {}),
              ...next,
            })
          : null;
      }
      if (old.provider?.type !== next?.type) delete saved.models;
    }
    if (update.models)
      saved.models = {
        ...(saved.models ?? defaults(saved.provider ?? old.provider)),
        ...update.models,
      };
    if (update.concurrency !== undefined) saved.concurrency = update.concurrency;
    if (update.outputLanguage !== undefined) saved.outputLanguage = update.outputLanguage;
    if (update.budgetUsd !== undefined) saved.budgetUsd = update.budgetUsd;
    GlobalConfig.parse({
      ...saved,
      version: 1,
      provider: saved.provider ?? null,
      models: saved.models ?? defaults(saved.provider ?? null),
    });
    writeJson(this.file, { version: 1, ...saved, telemetry: false });
    return this.get();
  }
  async test(provider?: ProviderConfig) {
    const { config } = this.resolved();
    const p = provider ?? config.provider;
    if (!p) return { ok: false, model: '', latencyMs: 0, message: 'Choose a provider first.' };
    return createProvider(p, provider ? defaults(p) : config.models).test();
  }
  detect() {
    return detectProviders(this.env);
  }
}
