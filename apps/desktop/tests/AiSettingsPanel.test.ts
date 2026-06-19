import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import AiSettingsPanel from '../src/lib/AiSettingsPanel.svelte';
import { browserAiBackend, type AiConfig } from '../src/lib/ai-backend';

function configuredBackend() {
  const backend = browserAiBackend();
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
      },
      {
        id: 'ollama',
        name: 'Ollama',
        provider: 'ollama',
        api_base: 'http://localhost:11434/v1',
        model: 'llama3',
        local: true,
        has_key: false
      }
    ]
  };
  void backend.setConfig(cfg);
  return backend;
}

describe('AiSettingsPanel — empty config', () => {
  it('shows loading then empty providers message', async () => {
    const backend = browserAiBackend();
    render(AiSettingsPanel, { props: { backend } });
    await waitFor(() => {
      expect(screen.queryByText('Loading AI configuration…')).toBeNull();
    });
    expect(screen.getByText(/No providers configured/)).toBeTruthy();
  });

  it('shows the AI policy section', async () => {
    const backend = browserAiBackend();
    render(AiSettingsPanel, { props: { backend } });
    await waitFor(() => {
      expect(screen.queryByText('Loading AI configuration…')).toBeNull();
    });
    expect(screen.getByText('AI policy')).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Local-only mode' })).toBeTruthy();
  });

  it('shows an error message when the backend fails to load', async () => {
    const backend = browserAiBackend();
    backend.getConfig = () => Promise.reject(new Error('disk error'));
    render(AiSettingsPanel, { props: { backend } });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(screen.getByText('disk error')).toBeTruthy();
  });

  it('stringifies non-Error rejections in the error message', async () => {
    const backend = browserAiBackend();
    backend.getConfig = () => Promise.reject('connection refused');
    render(AiSettingsPanel, { props: { backend } });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(screen.getByText('connection refused')).toBeTruthy();
  });
});

describe('AiSettingsPanel — with providers', () => {
  it('renders each provider by name', async () => {
    const backend = configuredBackend();
    render(AiSettingsPanel, { props: { backend } });
    await waitFor(() => {
      expect(screen.getByLabelText('Provider Anthropic')).toBeTruthy();
    });
    expect(screen.getByLabelText('Provider Ollama')).toBeTruthy();
  });

  it('shows the local badge for local providers', async () => {
    const backend = configuredBackend();
    render(AiSettingsPanel, { props: { backend } });
    await waitFor(() => {
      expect(screen.getAllByText('local').length).toBeGreaterThan(0);
    });
  });

  it('shows a key input for providers without a key', async () => {
    const backend = configuredBackend();
    render(AiSettingsPanel, { props: { backend } });
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Paste API key…').length).toBeGreaterThan(0);
    });
  });
});

describe('AiSettingsPanel — local-only toggle', () => {
  it('toggles local-only mode via the backend', async () => {
    const backend = configuredBackend();
    render(AiSettingsPanel, { props: { backend } });
    await waitFor(() => {
      expect(screen.queryByText('Loading AI configuration…')).toBeNull();
    });
    const toggle = screen.getByRole('switch', { name: 'Local-only mode' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await fireEvent.click(toggle);
    const cfg = await backend.getConfig();
    expect(cfg.local_only).toBe(true);
  });
});

describe('AiSettingsPanel — per-project consent', () => {
  it('shows the consent toggle when a projectRoot is given', async () => {
    const backend = browserAiBackend();
    render(AiSettingsPanel, { props: { backend, projectRoot: '/projects/test' } });
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Allow cloud AI for this project' })).toBeTruthy();
    });
  });

  it('does not show the consent toggle without a projectRoot', async () => {
    const backend = browserAiBackend();
    render(AiSettingsPanel, { props: { backend } });
    await waitFor(() => {
      expect(screen.queryByText('Loading AI configuration…')).toBeNull();
    });
    expect(screen.queryByRole('switch', { name: 'Allow cloud AI for this project' })).toBeNull();
  });

  it('persists consent when the toggle is clicked', async () => {
    const backend = browserAiBackend();
    const projectRoot = '/projects/consent-test';
    render(AiSettingsPanel, { props: { backend, projectRoot } });
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: 'Allow cloud AI for this project' })).toBeTruthy();
    });
    const toggle = screen.getByRole('switch', { name: 'Allow cloud AI for this project' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await fireEvent.click(toggle);
    expect(await backend.getConsent(projectRoot)).toBe(true);
  });
});

describe('AiSettingsPanel — set active provider', () => {
  it('marks a provider as active when its Set active button is clicked', async () => {
    const backend = configuredBackend();
    render(AiSettingsPanel, { props: { backend } });
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Set active/ }).length).toBeGreaterThan(0);
    });
    const buttons = screen.getAllByRole('button', { name: /Set active/ });
    await fireEvent.click(buttons[0]);
    const cfg = await backend.getConfig();
    expect(cfg.active_provider).toBe('ant');
  });

  it('deactivates a provider when its Active button is clicked again', async () => {
    const backend = configuredBackend();
    void backend.setConfig({
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
          has_key: false
        }
      ]
    });
    render(AiSettingsPanel, { props: { backend } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Active' })).toBeTruthy();
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Active' }));
    const cfg = await backend.getConfig();
    expect(cfg.active_provider).toBeNull();
  });
});

describe('AiSettingsPanel — connectivity test', () => {
  it('shows OK after a successful test', async () => {
    const backend = configuredBackend();
    render(AiSettingsPanel, { props: { backend } });
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Test/ }).length).toBeGreaterThan(0);
    });
    const testBtn = screen.getAllByRole('button', { name: /Test/ })[0];
    await fireEvent.click(testBtn);
    await waitFor(() => {
      expect(screen.getAllByText(/✓ OK/).length).toBeGreaterThan(0);
    });
  });

  it('shows Failed when the test throws', async () => {
    const backend = configuredBackend();
    backend.testProvider = () => Promise.reject(new Error('connection refused'));
    render(AiSettingsPanel, { props: { backend } });
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Test/ }).length).toBeGreaterThan(0);
    });
    await fireEvent.click(screen.getAllByRole('button', { name: /Test/ })[0]);
    await waitFor(() => {
      expect(screen.getAllByText(/✗ Failed/).length).toBeGreaterThan(0);
    });
  });

  it('shows Failed when testProvider returns false', async () => {
    const backend = configuredBackend();
    backend.testProvider = () => Promise.resolve(false);
    render(AiSettingsPanel, { props: { backend } });
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Test/ }).length).toBeGreaterThan(0);
    });
    await fireEvent.click(screen.getAllByRole('button', { name: /Test/ })[0]);
    await waitFor(() => {
      expect(screen.getAllByText(/✗ Failed/).length).toBeGreaterThan(0);
    });
  });
});

describe('AiSettingsPanel — key management', () => {
  it('shows "API key stored" and a Remove key button after storing a key', async () => {
    const backend = configuredBackend();
    render(AiSettingsPanel, { props: { backend } });
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('Paste API key…').length).toBeGreaterThan(0);
    });
    const inputs = screen.getAllByPlaceholderText('Paste API key…');
    await fireEvent.input(inputs[0], { target: { value: 'sk-test-key' } });
    const saveBtn = screen.getAllByRole('button', { name: /Save key for Anthropic/ })[0];
    await fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(screen.getByText('API key stored')).toBeTruthy();
    });
  });

  it('shows "API key stored" immediately for providers with has_key: true', async () => {
    const backend = browserAiBackend();
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
          has_key: true
        }
      ]
    };
    await backend.setConfig(cfg);
    render(AiSettingsPanel, { props: { backend } });
    await waitFor(() => {
      expect(screen.getByText('API key stored')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: 'Remove key' })).toBeTruthy();
  });

  it('removes a key and shows the key input again', async () => {
    const backend = browserAiBackend();
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
          has_key: true
        }
      ]
    };
    await backend.setConfig(cfg);
    render(AiSettingsPanel, { props: { backend } });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remove key' })).toBeTruthy();
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Remove key' }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Paste API key…')).toBeTruthy();
    });
  });

  it('removes a key from one provider while leaving the other unchanged', async () => {
    const backend = browserAiBackend();
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
          has_key: true
        },
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
    await backend.setConfig(cfg);
    render(AiSettingsPanel, { props: { backend } });
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Remove key' }).length).toBe(2);
    });
    await fireEvent.click(screen.getAllByRole('button', { name: 'Remove key' })[0]);
    await waitFor(() => {
      const got = screen.getAllByRole('button', { name: 'Remove key' });
      expect(got).toHaveLength(1);
    });
    const remaining = await backend.getConfig();
    expect(remaining.providers[0].has_key).toBe(false);
    expect(remaining.providers[1].has_key).toBe(true);
  });
});
