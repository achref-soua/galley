import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));

import {
  browserAiBackend,
  tauriAiBackend,
  selectAiBackend,
  type AiConfig,
  type AiMessage
} from '../src/lib/ai-backend';

beforeEach(() => {
  invoke.mockReset();
});

// ── tauriAiBackend ────────────────────────────────────────────────────────────

describe('tauriAiBackend', () => {
  it('getConfig calls get_ai_config', async () => {
    const cfg: AiConfig = { local_only: false, active_provider: null, providers: [] };
    invoke.mockResolvedValueOnce(cfg);
    const result = await tauriAiBackend().getConfig();
    expect(invoke).toHaveBeenCalledWith('get_ai_config');
    expect(result).toEqual(cfg);
  });

  it('setConfig calls set_ai_config with the config', async () => {
    const cfg: AiConfig = { local_only: true, active_provider: 'x', providers: [] };
    invoke.mockResolvedValueOnce(undefined);
    await tauriAiBackend().setConfig(cfg);
    expect(invoke).toHaveBeenCalledWith('set_ai_config', { config: cfg });
  });

  it('storeKey calls store_ai_key', async () => {
    invoke.mockResolvedValueOnce(undefined);
    await tauriAiBackend().storeKey('ant', 'sk-123');
    expect(invoke).toHaveBeenCalledWith('store_ai_key', { providerId: 'ant', key: 'sk-123' });
  });

  it('removeKey calls remove_ai_key', async () => {
    invoke.mockResolvedValueOnce(undefined);
    await tauriAiBackend().removeKey('ant');
    expect(invoke).toHaveBeenCalledWith('remove_ai_key', { providerId: 'ant' });
  });

  it('getConsent calls get_project_consent', async () => {
    invoke.mockResolvedValueOnce(true);
    const result = await tauriAiBackend().getConsent('/projects/p');
    expect(invoke).toHaveBeenCalledWith('get_project_consent', { projectRoot: '/projects/p' });
    expect(result).toBe(true);
  });

  it('setConsent calls set_project_consent', async () => {
    invoke.mockResolvedValueOnce(undefined);
    await tauriAiBackend().setConsent('/projects/p', false);
    expect(invoke).toHaveBeenCalledWith('set_project_consent', {
      projectRoot: '/projects/p',
      enabled: false
    });
  });

  it('testProvider calls test_ai_provider', async () => {
    invoke.mockResolvedValueOnce(true);
    const result = await tauriAiBackend().testProvider('oai');
    expect(invoke).toHaveBeenCalledWith('test_ai_provider', { providerId: 'oai' });
    expect(result).toBe(true);
  });

  it('complete calls send_ai_completion', async () => {
    invoke.mockResolvedValueOnce('Hello!');
    const msgs: AiMessage[] = [{ role: 'user', content: 'hi' }];
    const result = await tauriAiBackend().complete(msgs, 64, '/projects/p');
    expect(invoke).toHaveBeenCalledWith('send_ai_completion', {
      messages: msgs,
      maxTokens: 64,
      projectRoot: '/projects/p'
    });
    expect(result).toBe('Hello!');
  });
});

// ── browserAiBackend ──────────────────────────────────────────────────────────

describe('browserAiBackend — config', () => {
  it('returns an empty config by default', async () => {
    const b = browserAiBackend();
    const cfg = await b.getConfig();
    expect(cfg.providers).toHaveLength(0);
    expect(cfg.active_provider).toBeNull();
    expect(cfg.local_only).toBe(false);
  });

  it('persists a written config', async () => {
    const b = browserAiBackend();
    const next: AiConfig = {
      local_only: true,
      active_provider: 'x',
      providers: [
        {
          id: 'x',
          name: 'X',
          provider: 'openai',
          api_base: 'http://x',
          model: 'gpt-4',
          local: false,
          has_key: false
        }
      ]
    };
    await b.setConfig(next);
    const got = await b.getConfig();
    expect(got.local_only).toBe(true);
    expect(got.active_provider).toBe('x');
    expect(got.providers).toHaveLength(1);
    expect(got.providers[0].id).toBe('x');
  });

  it('getConfig returns a copy (not the same reference)', async () => {
    const b = browserAiBackend();
    const a = await b.getConfig();
    const bVal = await b.getConfig();
    expect(a).not.toBe(bVal);
    expect(a.providers).not.toBe(bVal.providers);
  });
});

describe('browserAiBackend — keys', () => {
  it('storeKey marks has_key true on the matching provider', async () => {
    const b = browserAiBackend();
    const cfg: AiConfig = {
      local_only: false,
      active_provider: null,
      providers: [
        {
          id: 'ant',
          name: 'Anthropic',
          provider: 'anthropic',
          api_base: 'https://api.anthropic.com/v1',
          model: 'claude-haiku-4-5',
          local: false,
          has_key: false
        }
      ]
    };
    await b.setConfig(cfg);
    await b.storeKey('ant', 'sk-ant-123');
    const got = await b.getConfig();
    expect(got.providers[0].has_key).toBe(true);
  });

  it('removeKey clears has_key', async () => {
    const b = browserAiBackend();
    const cfg: AiConfig = {
      local_only: false,
      active_provider: null,
      providers: [
        {
          id: 'oai',
          name: 'OpenAI',
          provider: 'openai',
          api_base: 'https://api.openai.com/v1',
          model: 'gpt-4',
          local: false,
          has_key: false
        }
      ]
    };
    await b.setConfig(cfg);
    await b.storeKey('oai', 'sk-oai-456');
    await b.removeKey('oai');
    const got = await b.getConfig();
    expect(got.providers[0].has_key).toBe(false);
  });

  it('storeKey for an unknown provider id does not throw', async () => {
    const b = browserAiBackend();
    await expect(b.storeKey('unknown', 'key')).resolves.toBeUndefined();
  });

  it('removeKey leaves other providers unchanged when there are two', async () => {
    const b = browserAiBackend();
    const cfg: AiConfig = {
      local_only: false,
      active_provider: null,
      providers: [
        {
          id: 'a',
          name: 'A',
          provider: 'openai',
          api_base: 'http://a',
          model: 'gpt-4',
          local: false,
          has_key: true
        },
        {
          id: 'b',
          name: 'B',
          provider: 'anthropic',
          api_base: 'http://b',
          model: 'claude-3',
          local: false,
          has_key: true
        }
      ]
    };
    await b.setConfig(cfg);
    await b.removeKey('a');
    const got = await b.getConfig();
    expect(got.providers[0].has_key).toBe(false);
    expect(got.providers[1].has_key).toBe(true);
  });
});

describe('browserAiBackend — consent', () => {
  it('returns false by default for any project root', async () => {
    const b = browserAiBackend();
    expect(await b.getConsent('/projects/foo')).toBe(false);
    expect(await b.getConsent('/projects/bar')).toBe(false);
  });

  it('persists consent per project root', async () => {
    const b = browserAiBackend();
    await b.setConsent('/projects/a', true);
    expect(await b.getConsent('/projects/a')).toBe(true);
    expect(await b.getConsent('/projects/b')).toBe(false);
  });

  it('setConsent with false revokes consent', async () => {
    const b = browserAiBackend();
    await b.setConsent('/projects/x', true);
    await b.setConsent('/projects/x', false);
    expect(await b.getConsent('/projects/x')).toBe(false);
  });
});

describe('browserAiBackend — testProvider', () => {
  it('always returns true (simulates a successful ping)', async () => {
    const b = browserAiBackend();
    expect(await b.testProvider('any-id')).toBe(true);
    expect(await b.testProvider('')).toBe(true);
  });
});

describe('browserAiBackend — complete', () => {
  it('rejects when the project has not given consent', async () => {
    const b = browserAiBackend();
    const cfg: AiConfig = {
      local_only: false,
      active_provider: 'ant',
      providers: [
        {
          id: 'ant',
          name: 'Anthropic',
          provider: 'anthropic',
          api_base: 'https://api.anthropic.com/v1',
          model: 'claude-haiku-4-5',
          local: false,
          has_key: true
        }
      ]
    };
    await b.setConfig(cfg);
    const msgs: AiMessage[] = [{ role: 'user', content: 'hi' }];
    await expect(b.complete(msgs, 128, '/projects/no-consent')).rejects.toThrow();
  });

  it('rejects when no active provider is set', async () => {
    const b = browserAiBackend();
    await b.setConsent('/projects/p', true);
    const msgs: AiMessage[] = [{ role: 'user', content: 'hi' }];
    await expect(b.complete(msgs, 128, '/projects/p')).rejects.toThrow();
  });

  it('returns a canned response when consent is given and a provider is active', async () => {
    const b = browserAiBackend();
    const cfg: AiConfig = {
      local_only: false,
      active_provider: 'ant',
      providers: [
        {
          id: 'ant',
          name: 'Anthropic',
          provider: 'anthropic',
          api_base: 'https://api.anthropic.com/v1',
          model: 'claude-haiku-4-5',
          local: false,
          has_key: true
        }
      ]
    };
    await b.setConfig(cfg);
    await b.setConsent('/projects/p', true);
    const msgs: AiMessage[] = [{ role: 'user', content: 'Hello world' }];
    const result = await b.complete(msgs, 128, '/projects/p');
    expect(result).toContain('Hello world');
  });

  it('includes the last message content in the response', async () => {
    const b = browserAiBackend();
    const cfg: AiConfig = {
      local_only: false,
      active_provider: 'oai',
      providers: [
        {
          id: 'oai',
          name: 'OpenAI',
          provider: 'openai',
          api_base: 'https://api.openai.com/v1',
          model: 'gpt-4',
          local: false,
          has_key: true
        }
      ]
    };
    await b.setConfig(cfg);
    await b.setConsent('/projects/q', true);
    const msgs: AiMessage[] = [
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'Describe LaTeX in one word.' }
    ];
    const result = await b.complete(msgs, 32, '/projects/q');
    expect(result).toContain('Describe LaTeX in one word.');
  });

  it('handles an empty messages array gracefully', async () => {
    const b = browserAiBackend();
    const cfg: AiConfig = {
      local_only: false,
      active_provider: 'oai',
      providers: [
        {
          id: 'oai',
          name: 'OpenAI',
          provider: 'openai',
          api_base: 'https://api.openai.com/v1',
          model: 'gpt-4',
          local: false,
          has_key: true
        }
      ]
    };
    await b.setConfig(cfg);
    await b.setConsent('/projects/r', true);
    const result = await b.complete([], 32, '/projects/r');
    expect(result).toContain('""');
  });
});

// ── selectAiBackend ───────────────────────────────────────────────────────────

describe('selectAiBackend', () => {
  it('returns a browserAiBackend when __TAURI_INTERNALS__ is absent', () => {
    const win = {} as Window;
    const b = selectAiBackend(win);
    expect(b).toBeDefined();
    expect(typeof b.getConfig).toBe('function');
    expect(typeof b.testProvider).toBe('function');
  });

  it('returns a tauriAiBackend when __TAURI_INTERNALS__ is present', () => {
    const win = { __TAURI_INTERNALS__: {} } as unknown as Window;
    const b = selectAiBackend(win);
    expect(b).toBeDefined();
    expect(typeof b.getConfig).toBe('function');
  });
});
