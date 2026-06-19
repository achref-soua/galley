//! AI HTTP adapters, config persistence, and key storage for the Tauri shell.
//!
//! Everything in this file is excluded from the root workspace coverage gate
//! (the `src-tauri` crate is its own isolated workspace). Network I/O, file I/O,
//! and OS-keychain operations all live here so the covered `galley-*` crates
//! stay pure.

use galley_core::ai::{LlmError, LlmProvider, LlmRequest, LlmResponse};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

// ── Serialisable config (JSON on disk) ────────────────────────────────────────

/// One provider entry as stored in `ai.json`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProviderConfigFile {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub api_base: String,
    pub model: String,
    pub local: bool,
}

/// The top-level `ai.json` structure.
#[derive(Debug, Serialize, Deserialize, Default)]
pub struct AiConfigFile {
    pub local_only: bool,
    pub active_provider: Option<String>,
    pub providers: Vec<ProviderConfigFile>,
}

/// The `secrets.json` structure (permissions 0o600 on write).
#[derive(Debug, Serialize, Deserialize, Default)]
pub struct SecretsFile {
    pub keys: HashMap<String, String>,
}

// ── Persistence helpers ───────────────────────────────────────────────────────

pub fn load_ai_config(config_dir: &Path) -> AiConfigFile {
    let path = config_dir.join("ai.json");
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_ai_config(config_dir: &Path, cfg: &AiConfigFile) -> Result<(), String> {
    fs::create_dir_all(config_dir).map_err(|e| e.to_string())?;
    let path = config_dir.join("ai.json");
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

fn secrets_path(config_dir: &Path) -> std::path::PathBuf {
    config_dir.join("secrets.json")
}

fn load_secrets(config_dir: &Path) -> SecretsFile {
    let path = secrets_path(config_dir);
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_secrets(config_dir: &Path, secrets: &SecretsFile) -> Result<(), String> {
    fs::create_dir_all(config_dir).map_err(|e| e.to_string())?;
    let path = secrets_path(config_dir);
    let json = serde_json::to_string_pretty(secrets).map_err(|e| e.to_string())?;
    fs::write(&path, &json).map_err(|e| e.to_string())?;
    // Restrict to owner-read-write only on Unix.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = fs::Permissions::from_mode(0o600);
        let _ = fs::set_permissions(&path, perms);
    }
    Ok(())
}

pub fn store_api_key(config_dir: &Path, provider_id: &str, key: &str) -> Result<(), String> {
    let mut secrets = load_secrets(config_dir);
    secrets
        .keys
        .insert(provider_id.to_string(), key.to_string());
    save_secrets(config_dir, &secrets)
}

pub fn remove_api_key(config_dir: &Path, provider_id: &str) -> Result<(), String> {
    let mut secrets = load_secrets(config_dir);
    secrets.keys.remove(provider_id);
    save_secrets(config_dir, &secrets)
}

pub fn get_api_key(config_dir: &Path, provider_id: &str) -> Option<String> {
    load_secrets(config_dir).keys.remove(provider_id)
}

// ── Per-project consent ───────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct ConsentFile {
    pub cloud_ai_enabled: bool,
}

pub fn load_consent(project_root: &Path) -> ConsentFile {
    let path = project_root.join(".galley").join("ai-consent.json");
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_consent(project_root: &Path, consent: &ConsentFile) -> Result<(), String> {
    let dir = project_root.join(".galley");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("ai-consent.json");
    let json = serde_json::to_string_pretty(consent).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

// ── HTTP adapters ─────────────────────────────────────────────────────────────

/// Shared HTTP call helper used by adapters.
fn post_json(url: &str, body: &str, headers: &[(&str, &str)]) -> Result<String, String> {
    let mut req = ureq::post(url);
    for (k, v) in headers {
        req = req.set(k, v);
    }
    req.send_string(body)
        .map_err(|e| e.to_string())?
        .into_string()
        .map_err(|e| e.to_string())
}

/// An OpenAI ChatCompletions-compatible adapter (also covers Ollama's `/chat` endpoint).
pub struct OpenAiAdapter {
    pub id: String,
    pub api_key: Option<String>,
    pub api_base: String,
    pub model: String,
}

impl LlmProvider for OpenAiAdapter {
    fn complete(&self, req: &LlmRequest) -> Result<LlmResponse, LlmError> {
        let messages: Vec<serde_json::Value> = req
            .messages
            .iter()
            .map(|m| serde_json::json!({ "role": m.role, "content": m.content }))
            .collect();
        let body = serde_json::json!({
            "model": self.model,
            "messages": messages,
            "max_tokens": req.max_tokens,
        })
        .to_string();
        let url = format!("{}/chat/completions", self.api_base.trim_end_matches('/'));
        let mut hdrs = vec![("Content-Type", "application/json")];
        let auth;
        if let Some(key) = &self.api_key {
            auth = format!("Bearer {key}");
            hdrs.push(("Authorization", auth.as_str()));
        }
        let raw = post_json(&url, &body, &hdrs).map_err(LlmError::ProviderError)?;
        let v: serde_json::Value =
            serde_json::from_str(&raw).map_err(|e| LlmError::ProviderError(e.to_string()))?;
        let content = v["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();
        if content.is_empty() {
            let err = v["error"]["message"]
                .as_str()
                .unwrap_or("empty response")
                .to_string();
            return Err(LlmError::ProviderError(err));
        }
        Ok(LlmResponse {
            content,
            provider_id: self.id.clone(),
        })
    }
}

/// An Anthropic Messages API adapter.
pub struct AnthropicAdapter {
    pub id: String,
    pub api_key: String,
    pub api_base: String,
    pub model: String,
}

impl LlmProvider for AnthropicAdapter {
    fn complete(&self, req: &LlmRequest) -> Result<LlmResponse, LlmError> {
        let mut system_content = String::new();
        let mut messages: Vec<serde_json::Value> = Vec::new();
        for m in &req.messages {
            if m.role == "system" {
                system_content = m.content.clone();
            } else {
                messages.push(serde_json::json!({ "role": m.role, "content": m.content }));
            }
        }
        let mut payload = serde_json::json!({
            "model": self.model,
            "messages": messages,
            "max_tokens": req.max_tokens,
        });
        if !system_content.is_empty() {
            payload["system"] = serde_json::Value::String(system_content);
        }
        let url = format!("{}/messages", self.api_base.trim_end_matches('/'));
        let hdrs = [
            ("Content-Type", "application/json"),
            ("x-api-key", self.api_key.as_str()),
            ("anthropic-version", "2023-06-01"),
        ];
        let raw = post_json(&url, &payload.to_string(), &hdrs).map_err(LlmError::ProviderError)?;
        let v: serde_json::Value =
            serde_json::from_str(&raw).map_err(|e| LlmError::ProviderError(e.to_string()))?;
        let content = v["content"][0]["text"].as_str().unwrap_or("").to_string();
        if content.is_empty() {
            let err = v["error"]["message"]
                .as_str()
                .unwrap_or("empty response")
                .to_string();
            return Err(LlmError::ProviderError(err));
        }
        Ok(LlmResponse {
            content,
            provider_id: self.id.clone(),
        })
    }
}

// ── Adapter dispatch ──────────────────────────────────────────────────────────

/// Build the right adapter for the given provider config + API key.
pub enum AnyAdapter {
    OpenAi(OpenAiAdapter),
    Anthropic(AnthropicAdapter),
}

impl LlmProvider for AnyAdapter {
    fn complete(&self, req: &LlmRequest) -> Result<LlmResponse, LlmError> {
        match self {
            AnyAdapter::OpenAi(a) => a.complete(req),
            AnyAdapter::Anthropic(a) => a.complete(req),
        }
    }
}

pub fn build_adapter(cfg: &ProviderConfigFile, key: Option<String>) -> AnyAdapter {
    match cfg.provider.as_str() {
        "anthropic" => AnyAdapter::Anthropic(AnthropicAdapter {
            id: cfg.id.clone(),
            api_key: key.unwrap_or_default(),
            api_base: cfg.api_base.clone(),
            model: cfg.model.clone(),
        }),
        _ => AnyAdapter::OpenAi(OpenAiAdapter {
            id: cfg.id.clone(),
            api_key: key,
            api_base: cfg.api_base.clone(),
            model: cfg.model.clone(),
        }),
    }
}
