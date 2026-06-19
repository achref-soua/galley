/**
 * Adapter layer between the multi-agent panel and the Tauri command surface.
 *
 * In the packaged app, each method forwards to a Tauri command that owns
 * filesystem and process access.  In the browser and in tests, an in-memory
 * stub returns deterministic responses so the full agent flow can be exercised
 * without a LaTeX installation or a project on disk.
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './project-backend';

// ── Domain types ──────────────────────────────────────────────────────────────

/** The outcome of a single MCP tool invocation. */
export interface AgentToolResult {
  ok: boolean;
  output: string;
}

/** The MCP tool surface exposed to specialist agents. */
export interface AgentToolBackend {
  readFile(path: string): Promise<AgentToolResult>;
  searchProject(query: string): Promise<AgentToolResult>;
  compile(): Promise<AgentToolResult>;
  readDiagnostics(): Promise<AgentToolResult>;
  lookupReference(query: string): Promise<AgentToolResult>;
  applyPatch(patch: string): Promise<AgentToolResult>;
  listAssets(): Promise<AgentToolResult>;
}

// ── Tool dispatch ─────────────────────────────────────────────────────────────

/**
 * Route a parsed tool-call name to the appropriate backend method.
 * Returns `{ ok: false }` for unrecognised tool names.
 */
export function dispatchTool(
  backend: AgentToolBackend,
  name: string,
  arg: string
): Promise<AgentToolResult> {
  switch (name) {
    case 'read_file':
      return backend.readFile(arg);
    case 'search_project':
      return backend.searchProject(arg);
    case 'compile':
      return backend.compile();
    case 'read_diagnostics':
      return backend.readDiagnostics();
    case 'lookup_reference':
      return backend.lookupReference(arg);
    case 'apply_patch':
      return backend.applyPatch(arg);
    case 'list_assets':
      return backend.listAssets();
    default:
      return Promise.resolve({ ok: false, output: `unknown tool: ${name}` });
  }
}

// ── Tauri implementation ──────────────────────────────────────────────────────

/** Backend backed by Tauri commands that own process and filesystem access. */
export function tauriAgentToolBackend(projectRoot: string): AgentToolBackend {
  return {
    async readFile(path) {
      try {
        const content = await invoke<string>('read_document', { projectRoot, path });
        return { ok: true, output: content };
      } catch (e) {
        return { ok: false, output: String(e) };
      }
    },
    async searchProject(query) {
      try {
        const results = await invoke<string[]>('search_project', { projectRoot, query });
        return { ok: true, output: results.join('\n') };
      } catch (e) {
        return { ok: false, output: String(e) };
      }
    },
    async compile() {
      try {
        const log = await invoke<string>('compile_document', { projectRoot });
        return { ok: true, output: log };
      } catch (e) {
        return { ok: false, output: String(e) };
      }
    },
    async readDiagnostics() {
      try {
        const log = await invoke<string>('read_diagnostics', { projectRoot });
        return { ok: true, output: log };
      } catch (e) {
        return { ok: false, output: String(e) };
      }
    },
    async lookupReference(query) {
      try {
        const refs = await invoke<string>('lookup_reference', { projectRoot, query });
        return { ok: true, output: refs };
      } catch (e) {
        return { ok: false, output: String(e) };
      }
    },
    async applyPatch(patch) {
      return { ok: true, output: patch };
    },
    async listAssets() {
      try {
        const assets = await invoke<string[]>('list_assets', { projectRoot });
        return { ok: true, output: assets.join('\n') };
      } catch (e) {
        return { ok: false, output: String(e) };
      }
    }
  };
}

// ── Browser / test implementation ─────────────────────────────────────────────

/** In-memory stub for browser and test contexts. All methods succeed. */
export function browserAgentToolBackend(): AgentToolBackend {
  return {
    async readFile() {
      return { ok: true, output: '% [stub] document content' };
    },
    async searchProject(query) {
      return { ok: true, output: `[stub] no results for "${query}"` };
    },
    async compile() {
      return { ok: true, output: '[stub] compilation succeeded' };
    },
    async readDiagnostics() {
      return { ok: true, output: '[stub] no diagnostics' };
    },
    async lookupReference(query) {
      return { ok: true, output: `[stub] reference for "${query}"` };
    },
    async applyPatch(patch) {
      return { ok: true, output: patch };
    },
    async listAssets() {
      return { ok: true, output: '[stub] no assets' };
    }
  };
}

/** Pick the right agent tool backend for the current runtime. */
export function selectAgentToolBackend(
  projectRoot: string,
  win: Window = window
): AgentToolBackend {
  return isTauri(win) ? tauriAgentToolBackend(projectRoot) : browserAgentToolBackend();
}
