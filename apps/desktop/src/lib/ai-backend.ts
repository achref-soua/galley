/**
 * The seam between the AI settings UI / chat and the provider gateway.
 *
 * In the packaged app, every call forwards to Rust commands that own the API
 * keys (stored in a restricted file, never exposed to the WebView), do the
 * HTTP, and enforce the local-only policy.  In a plain browser and in tests,
 * an in-memory backend returns deterministic stubs so the full AI settings
 * flow — configure, test, consent, complete — can be exercised without a
 * network or an API key.
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './project-backend';

// ── Domain types ──────────────────────────────────────────────────────────────

/** The provider kind string as stored in the config. */
export type ProviderKind = 'openai' | 'anthropic' | 'ollama' | 'openai_compatible';

/** A single configured provider instance. */
export interface ProviderConfig {
  id: string;
  name: string;
  provider: ProviderKind;
  api_base: string;
  model: string;
  local: boolean;
  /** Whether a key has been stored for this provider (never the key itself). */
  has_key: boolean;
}

/** The global AI gateway configuration. */
export interface AiConfig {
  local_only: boolean;
  active_provider: string | null;
  providers: ProviderConfig[];
}

/** A single chat message for a completion request. */
export interface AiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// ── Backend interface ─────────────────────────────────────────────────────────

/** All the AI operations the UI needs from the runtime. */
export interface AiBackend {
  /** Retrieve the current gateway config (provider list, active selection, policy). */
  getConfig(): Promise<AiConfig>;

  /** Persist the full gateway config (without touching stored keys). */
  setConfig(config: AiConfig): Promise<void>;

  /**
   * Store an API key for the given provider id.
   * Keys are written to a restricted file and never returned to the WebView.
   */
  storeKey(providerId: string, key: string): Promise<void>;

  /** Remove the stored key for the given provider id. */
  removeKey(providerId: string): Promise<void>;

  /**
   * Check whether the current project has opted in to cloud AI.
   * Returns `false` when no project root is given.
   */
  getConsent(projectRoot: string): Promise<boolean>;

  /** Update the per-project cloud-AI consent flag. */
  setConsent(projectRoot: string, enabled: boolean): Promise<void>;

  /**
   * Ping the given provider with a trivial request to verify it is reachable.
   * Returns `true` on success.
   */
  testProvider(providerId: string): Promise<boolean>;

  /**
   * Send a completion through the active provider.
   * Rejects when the project has not consented, no provider is configured,
   * or local-only mode is active.
   */
  complete(messages: AiMessage[], maxTokens: number, projectRoot: string): Promise<string>;
}

// ── Tauri implementation ──────────────────────────────────────────────────────

/** The backend backed by the Tauri command layer. */
export function tauriAiBackend(): AiBackend {
  return {
    getConfig() {
      return invoke<AiConfig>('get_ai_config');
    },
    setConfig(config) {
      return invoke<void>('set_ai_config', { config });
    },
    storeKey(providerId, key) {
      return invoke<void>('store_ai_key', { providerId, key });
    },
    removeKey(providerId) {
      return invoke<void>('remove_ai_key', { providerId });
    },
    getConsent(projectRoot) {
      return invoke<boolean>('get_project_consent', { projectRoot });
    },
    setConsent(projectRoot, enabled) {
      return invoke<void>('set_project_consent', { projectRoot, enabled });
    },
    testProvider(providerId) {
      return invoke<boolean>('test_ai_provider', { providerId });
    },
    complete(messages, maxTokens, projectRoot) {
      return invoke<string>('send_ai_completion', { messages, maxTokens, projectRoot });
    }
  };
}

// ── Browser / test implementation ─────────────────────────────────────────────

/** Default empty config returned when no config has been set. */
const DEFAULT_CONFIG: AiConfig = {
  local_only: false,
  active_provider: null,
  providers: []
};

/**
 * An in-memory backend for the browser and tests.
 *
 * Persists state within the instance so that set/get round-trips work.
 * `testProvider` always returns `true` (stubbing a successful ping).
 * `complete` returns a canned response acknowledging the last user message.
 */
export function browserAiBackend(): AiBackend {
  let config: AiConfig = { ...DEFAULT_CONFIG, providers: [] };
  const keys: Map<string, string> = new Map();
  const consents: Map<string, boolean> = new Map();

  return {
    async getConfig() {
      return { ...config, providers: config.providers.map((p) => ({ ...p })) };
    },
    async setConfig(next) {
      config = { ...next, providers: next.providers.map((p) => ({ ...p })) };
    },
    async storeKey(providerId, key) {
      keys.set(providerId, key);
      config = {
        ...config,
        providers: config.providers.map((p) => (p.id === providerId ? { ...p, has_key: true } : p))
      };
    },
    async removeKey(providerId) {
      keys.delete(providerId);
      config = {
        ...config,
        providers: config.providers.map((p) => (p.id === providerId ? { ...p, has_key: false } : p))
      };
    },
    async getConsent(projectRoot) {
      return consents.get(projectRoot) ?? false;
    },
    async setConsent(projectRoot, enabled) {
      consents.set(projectRoot, enabled);
    },
    async testProvider() {
      return true;
    },
    async complete(messages, _maxTokens, projectRoot) {
      const hasConsent = consents.get(projectRoot) ?? false;
      if (!hasConsent) throw new Error('AI not enabled for this project.');
      if (config.active_provider === null) throw new Error('No active AI provider configured.');
      const last = messages[messages.length - 1];
      return `[Demo response to: "${last?.content ?? ''}"]`;
    }
  };
}

/** Pick the right AI backend for the current runtime. */
export function selectAiBackend(win: Window = window): AiBackend {
  return isTauri(win) ? tauriAiBackend() : browserAiBackend();
}
