import { invoke } from '@tauri-apps/api/core';

export interface SandboxReport {
  shell_escape: string[];
  traversal_inputs: string[];
}

export interface ScanBackend {
  scanSource(source: string): Promise<SandboxReport>;
}

export function tauriScanBackend(): ScanBackend {
  return {
    scanSource: (source) => invoke<SandboxReport>('scan_document_source', { source })
  };
}

export function browserScanBackend(): ScanBackend {
  return {
    scanSource: async () => ({ shell_escape: [], traversal_inputs: [] })
  };
}

export function selectScanBackend(win: Window & typeof globalThis): ScanBackend {
  return '__TAURI_INTERNALS__' in win ? tauriScanBackend() : browserScanBackend();
}
