//! Pure AI domain types: provider configuration, request/response shapes,
//! and the `LlmProvider` port.
//!
//! Nothing here touches the network, filesystem, or OS — every type is
//! testable in isolation and exercised to 100% coverage by the unit tests
//! at the bottom of this file.

/// The class of AI provider.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    /// OpenAI ChatCompletions-compatible API.
    OpenAi,
    /// Anthropic Messages API.
    Anthropic,
    /// Ollama local inference server (OpenAI-compatible chat endpoint).
    Ollama,
    /// Any other OpenAI-compatible endpoint (LM Studio, llama.cpp, etc.).
    OpenAiCompatible,
}

impl Provider {
    /// Parse a lowercase string key into a `Provider`.
    ///
    /// Returns `None` for unrecognised strings, allowing callers to handle
    /// unknown variants gracefully (e.g. when reading a config file written
    /// by a newer version of Galley).
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "openai" => Some(Self::OpenAi),
            "anthropic" => Some(Self::Anthropic),
            "ollama" => Some(Self::Ollama),
            "openai_compatible" => Some(Self::OpenAiCompatible),
            _ => None,
        }
    }

    /// The canonical string key for this provider (round-trips through `parse`).
    pub fn as_str(self) -> &'static str {
        match self {
            Self::OpenAi => "openai",
            Self::Anthropic => "anthropic",
            Self::Ollama => "ollama",
            Self::OpenAiCompatible => "openai_compatible",
        }
    }

    /// Whether the provider communicates with a local endpoint by default.
    ///
    /// Ollama is always local. Cloud providers (`OpenAi`, `Anthropic`,
    /// `OpenAiCompatible`) are remote by default — but an operator can point an
    /// `OpenAiCompatible` entry at `localhost` and mark it `local: true`.
    pub fn is_local_by_default(self) -> bool {
        matches!(self, Self::Ollama)
    }
}

/// Configuration for a single AI provider instance.
///
/// Multiple instances of the same `Provider` kind are allowed (e.g. two
/// different Ollama models), distinguished by their unique `id`.
#[derive(Debug, Clone, PartialEq)]
pub struct ProviderConfig {
    /// Unique identifier chosen by the user (slug-style, e.g. `"anthropic"`).
    pub id: String,
    /// Human-readable display name shown in the settings panel.
    pub name: String,
    /// The provider kind, used to select the HTTP adapter.
    pub provider: Provider,
    /// Base URL for API calls (e.g. `"https://api.openai.com/v1"`).
    pub api_base: String,
    /// Model name passed in every request.
    pub model: String,
    /// Whether this endpoint is local (never blocked by `local_only` policy).
    pub local: bool,
}

impl ProviderConfig {
    /// Construct with all required fields.
    pub fn new(
        id: impl Into<String>,
        name: impl Into<String>,
        provider: Provider,
        api_base: impl Into<String>,
        model: impl Into<String>,
        local: bool,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            provider,
            api_base: api_base.into(),
            model: model.into(),
            local,
        }
    }
}

/// Global AI gateway configuration (stored outside any single project).
#[derive(Debug, Clone)]
pub struct GatewayConfig {
    /// All configured provider instances.
    pub providers: Vec<ProviderConfig>,
    /// The `id` of the currently selected provider, if any.
    pub active_provider: Option<String>,
    /// When `true`, any provider with `local == false` is always blocked.
    pub local_only: bool,
}

impl GatewayConfig {
    /// An empty configuration — no providers, cloud AI allowed.
    pub fn new() -> Self {
        Self {
            providers: Vec::new(),
            active_provider: None,
            local_only: false,
        }
    }

    /// Resolve the currently active provider configuration, if present.
    pub fn active(&self) -> Option<&ProviderConfig> {
        let id = self.active_provider.as_deref()?;
        self.providers.iter().find(|p| p.id == id)
    }

    /// Whether the given provider config is permitted under the current policy.
    ///
    /// When `local_only` is set, only providers with `local == true` pass.
    pub fn allows(&self, cfg: &ProviderConfig) -> bool {
        if self.local_only {
            cfg.local
        } else {
            true
        }
    }
}

impl Default for GatewayConfig {
    fn default() -> Self {
        Self::new()
    }
}

/// A single message in a conversation.
#[derive(Debug, Clone, PartialEq)]
pub struct LlmMessage {
    /// `"user"`, `"assistant"`, or `"system"`.
    pub role: String,
    /// The message text.
    pub content: String,
}

impl LlmMessage {
    /// Construct a user-role message.
    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: "user".into(),
            content: content.into(),
        }
    }

    /// Construct a system-role message.
    pub fn system(content: impl Into<String>) -> Self {
        Self {
            role: "system".into(),
            content: content.into(),
        }
    }
}

/// A request to the AI gateway.
#[derive(Debug, Clone)]
pub struct LlmRequest {
    /// The conversation messages, in order.
    pub messages: Vec<LlmMessage>,
    /// Maximum tokens to generate in the response.
    pub max_tokens: u32,
}

impl LlmRequest {
    /// Construct with the given messages and token limit.
    pub fn new(messages: Vec<LlmMessage>, max_tokens: u32) -> Self {
        Self {
            messages,
            max_tokens,
        }
    }
}

/// A successful response from an AI provider.
#[derive(Debug, Clone, PartialEq)]
pub struct LlmResponse {
    /// The generated text content.
    pub content: String,
    /// The `id` of the provider that handled the request.
    pub provider_id: String,
}

/// Why an AI request failed.
#[derive(Debug, Clone, PartialEq)]
pub enum LlmError {
    /// No active provider is configured, or no project consent was given.
    NotConfigured,
    /// `local_only` mode prevents using this cloud provider.
    LocalOnlyViolation,
    /// The provider returned an HTTP or protocol error.
    ProviderError(String),
}

impl std::fmt::Display for LlmError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotConfigured => f.write_str("no AI provider configured"),
            Self::LocalOnlyViolation => {
                f.write_str("local-only mode: cloud providers are disabled")
            }
            Self::ProviderError(msg) => write!(f, "provider error: {msg}"),
        }
    }
}

impl std::error::Error for LlmError {}

/// The provider port — implement this to plug in an HTTP adapter.
pub trait LlmProvider {
    /// Send a completion request and return the response or an error.
    fn complete(&self, req: &LlmRequest) -> Result<LlmResponse, LlmError>;
}

/// Per-project AI consent record (stored in `.galley/ai-consent.json`).
///
/// Cloud AI calls are gated behind explicit per-project opt-in so documents
/// are never sent to a cloud provider without the author's knowledge.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ProjectAiConsent {
    /// Whether the author has allowed cloud-AI calls for this project.
    pub cloud_ai_enabled: bool,
}

impl ProjectAiConsent {
    /// Default state: cloud AI not yet enabled (safe default).
    pub fn default_denied() -> Self {
        Self {
            cloud_ai_enabled: false,
        }
    }

    /// Return a copy with `cloud_ai_enabled` set to `enabled`.
    pub fn with_cloud_enabled(self, enabled: bool) -> Self {
        Self {
            cloud_ai_enabled: enabled,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Provider ─────────────────────────────────────────────────────────────

    #[test]
    fn provider_parse_known_kinds() {
        assert_eq!(Provider::parse("openai"), Some(Provider::OpenAi));
        assert_eq!(Provider::parse("anthropic"), Some(Provider::Anthropic));
        assert_eq!(Provider::parse("ollama"), Some(Provider::Ollama));
        assert_eq!(
            Provider::parse("openai_compatible"),
            Some(Provider::OpenAiCompatible)
        );
    }

    #[test]
    fn provider_parse_unknown_returns_none() {
        assert_eq!(Provider::parse("gemini"), None);
        assert_eq!(Provider::parse(""), None);
        assert_eq!(Provider::parse("OpenAI"), None);
    }

    #[test]
    fn provider_as_str_round_trips() {
        for kind in [
            Provider::OpenAi,
            Provider::Anthropic,
            Provider::Ollama,
            Provider::OpenAiCompatible,
        ] {
            assert_eq!(Provider::parse(kind.as_str()), Some(kind));
        }
    }

    #[test]
    fn provider_is_local_by_default() {
        assert!(Provider::Ollama.is_local_by_default());
        assert!(!Provider::OpenAi.is_local_by_default());
        assert!(!Provider::Anthropic.is_local_by_default());
        assert!(!Provider::OpenAiCompatible.is_local_by_default());
    }

    #[test]
    fn provider_debug_and_eq() {
        let a = Provider::Anthropic;
        let b = Provider::Anthropic;
        assert_eq!(a, b);
        assert_ne!(a, Provider::OpenAi);
        assert!(format!("{a:?}").contains("Anthropic"));
        // Copy
        let c = a;
        assert_eq!(c, a);
    }

    // ── ProviderConfig ────────────────────────────────────────────────────────

    #[test]
    fn provider_config_new_stores_all_fields() {
        let cfg = ProviderConfig::new(
            "ant",
            "Anthropic",
            Provider::Anthropic,
            "https://api.anthropic.com/v1",
            "claude-haiku-4-5",
            false,
        );
        assert_eq!(cfg.id, "ant");
        assert_eq!(cfg.name, "Anthropic");
        assert_eq!(cfg.provider, Provider::Anthropic);
        assert_eq!(cfg.api_base, "https://api.anthropic.com/v1");
        assert_eq!(cfg.model, "claude-haiku-4-5");
        assert!(!cfg.local);
    }

    #[test]
    fn provider_config_debug_and_eq() {
        let a = ProviderConfig::new("x", "X", Provider::OpenAi, "http://x", "gpt-4", false);
        let b = a.clone();
        assert_eq!(a, b);
        assert!(format!("{a:?}").contains("ProviderConfig"));
    }

    // ── GatewayConfig ─────────────────────────────────────────────────────────

    #[test]
    fn gateway_config_new_and_default_are_empty() {
        let a = GatewayConfig::new();
        let b = GatewayConfig::default();
        assert!(a.providers.is_empty());
        assert!(a.active_provider.is_none());
        assert!(!a.local_only);
        assert!(b.providers.is_empty());
    }

    #[test]
    fn gateway_config_active_returns_none_when_not_set() {
        let cfg = GatewayConfig::new();
        assert!(cfg.active().is_none());
    }

    #[test]
    fn gateway_config_active_returns_none_when_id_missing() {
        let mut cfg = GatewayConfig::new();
        cfg.active_provider = Some("missing".into());
        assert!(cfg.active().is_none());
    }

    #[test]
    fn gateway_config_active_returns_the_matching_provider() {
        let mut cfg = GatewayConfig::new();
        let p = ProviderConfig::new("a", "A", Provider::OpenAi, "http://a", "gpt-4o", false);
        cfg.providers.push(p.clone());
        cfg.active_provider = Some("a".into());
        assert_eq!(cfg.active(), Some(&p));
    }

    #[test]
    fn gateway_config_allows_cloud_when_not_local_only() {
        let cfg = GatewayConfig::new();
        let cloud = ProviderConfig::new("c", "C", Provider::Anthropic, "http://c", "m", false);
        assert!(cfg.allows(&cloud));
    }

    #[test]
    fn gateway_config_blocks_cloud_when_local_only() {
        let mut cfg = GatewayConfig::new();
        cfg.local_only = true;
        let cloud = ProviderConfig::new("c", "C", Provider::Anthropic, "http://c", "m", false);
        let local = ProviderConfig::new("l", "L", Provider::Ollama, "http://localhost", "m", true);
        assert!(!cfg.allows(&cloud));
        assert!(cfg.allows(&local));
    }

    #[test]
    fn gateway_config_debug() {
        assert!(format!("{:?}", GatewayConfig::new()).contains("GatewayConfig"));
    }

    // ── LlmMessage ───────────────────────────────────────────────────────────

    #[test]
    fn llm_message_user_and_system_constructors() {
        let u = LlmMessage::user("hello");
        assert_eq!(u.role, "user");
        assert_eq!(u.content, "hello");

        let s = LlmMessage::system("be helpful");
        assert_eq!(s.role, "system");
        assert_eq!(s.content, "be helpful");
    }

    #[test]
    fn llm_message_eq_and_debug() {
        let a = LlmMessage::user("hi");
        let b = a.clone();
        assert_eq!(a, b);
        assert_ne!(a, LlmMessage::system("hi"));
        assert!(format!("{a:?}").contains("LlmMessage"));
    }

    // ── LlmRequest ───────────────────────────────────────────────────────────

    #[test]
    fn llm_request_new_stores_fields() {
        let req = LlmRequest::new(vec![LlmMessage::user("test")], 128);
        assert_eq!(req.messages.len(), 1);
        assert_eq!(req.max_tokens, 128);
        assert!(format!("{req:?}").contains("LlmRequest"));
        // Clone
        let _ = req.clone();
    }

    // ── LlmError ─────────────────────────────────────────────────────────────

    #[test]
    fn llm_error_display() {
        assert_eq!(
            LlmError::NotConfigured.to_string(),
            "no AI provider configured"
        );
        assert_eq!(
            LlmError::LocalOnlyViolation.to_string(),
            "local-only mode: cloud providers are disabled"
        );
        assert_eq!(
            LlmError::ProviderError("timeout".into()).to_string(),
            "provider error: timeout"
        );
    }

    #[test]
    fn llm_error_eq_and_debug() {
        let a = LlmError::NotConfigured;
        let b = LlmError::NotConfigured;
        assert_eq!(a, b);
        assert_ne!(a, LlmError::LocalOnlyViolation);
        assert!(format!("{a:?}").contains("NotConfigured"));
        // Clone
        let c = LlmError::ProviderError("x".into());
        let d = c.clone();
        assert_eq!(c, d);
    }

    #[test]
    fn llm_error_is_std_error() {
        use std::error::Error;
        let err = LlmError::ProviderError("boom".into());
        assert!(err.source().is_none());
    }

    // ── LlmResponse ──────────────────────────────────────────────────────────

    #[test]
    fn llm_response_eq_and_debug() {
        let a = LlmResponse {
            content: "hello".into(),
            provider_id: "ant".into(),
        };
        let b = a.clone();
        assert_eq!(a, b);
        assert!(format!("{a:?}").contains("LlmResponse"));
    }

    // ── ProjectAiConsent ─────────────────────────────────────────────────────

    #[test]
    fn project_ai_consent_default_denied() {
        let c = ProjectAiConsent::default_denied();
        assert!(!c.cloud_ai_enabled);
    }

    #[test]
    fn project_ai_consent_with_cloud_enabled() {
        let a = ProjectAiConsent::default_denied().with_cloud_enabled(true);
        assert!(a.cloud_ai_enabled);
        let b = a.with_cloud_enabled(false);
        assert!(!b.cloud_ai_enabled);
    }

    #[test]
    fn project_ai_consent_eq_copy_debug() {
        let a = ProjectAiConsent::default_denied();
        let b = a;
        assert_eq!(a, b);
        assert_ne!(a, a.with_cloud_enabled(true));
        assert!(format!("{a:?}").contains("ProjectAiConsent"));
    }
}
