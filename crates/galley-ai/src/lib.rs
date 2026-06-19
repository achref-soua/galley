//! Galley AI gateway — provider-agnostic routing with policy enforcement.
//!
//! This crate owns the pure orchestration layer that sits between the Tauri
//! shell (which holds the HTTP adapters and secrets) and the rest of the
//! application. No I/O lives here: the `ProviderGateway` is parameterised over
//! `P: LlmProvider` so it can be driven to 100% coverage with a single
//! configurable mock type.

use galley_core::ai::{GatewayConfig, LlmError, LlmProvider, LlmRequest, LlmResponse};

/// A provider-agnostic AI gateway.
///
/// Routes completion requests to the active configured provider, enforcing:
/// - **Consent gate:** a per-project flag must be `true` before any call is
///   forwarded; protects against silent document egress.
/// - **Local-only policy:** when `GatewayConfig::local_only` is set, only
///   providers marked `local == true` are allowed.
/// - **Active provider selection:** the `active_provider` id must resolve to
///   a registered adapter in the `providers` list.
pub struct ProviderGateway<P: LlmProvider> {
    config: GatewayConfig,
    providers: Vec<(String, P)>,
}

impl<P: LlmProvider> ProviderGateway<P> {
    /// Build a gateway from a configuration and a list of `(id, adapter)` pairs.
    pub fn new(config: GatewayConfig, providers: Vec<(String, P)>) -> Self {
        Self { config, providers }
    }

    /// Send a completion request through the active provider.
    ///
    /// # Errors
    ///
    /// - [`LlmError::NotConfigured`] — no project consent, no active provider,
    ///   or the active provider id has no registered adapter.
    /// - [`LlmError::LocalOnlyViolation`] — the active provider is a cloud one
    ///   but `local_only` mode is active.
    /// - [`LlmError::ProviderError`] — the adapter returned an HTTP/protocol error.
    pub fn complete(
        &self,
        req: &LlmRequest,
        project_consent: bool,
    ) -> Result<LlmResponse, LlmError> {
        if !project_consent {
            return Err(LlmError::NotConfigured);
        }
        let provider_cfg = self.config.active().ok_or(LlmError::NotConfigured)?;
        if !self.config.allows(provider_cfg) {
            return Err(LlmError::LocalOnlyViolation);
        }
        let target_id = provider_cfg.id.clone();
        let (_, adapter) = self
            .providers
            .iter()
            .find(|(id, _)| *id == target_id)
            .ok_or(LlmError::NotConfigured)?;
        adapter.complete(req)
    }

    /// Whether the gateway is currently in local-only mode.
    pub fn is_local_only(&self) -> bool {
        self.config.local_only
    }

    /// The `id` of the currently active provider, if any.
    pub fn active_provider_id(&self) -> Option<&str> {
        self.config.active_provider.as_deref()
    }

    /// Read-only access to the underlying configuration.
    pub fn config(&self) -> &GatewayConfig {
        &self.config
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use galley_core::ai::{LlmMessage, Provider, ProviderConfig};
    use std::cell::Cell;

    struct MockProvider {
        call_count: Cell<u32>,
        result: Result<LlmResponse, LlmError>,
    }

    impl MockProvider {
        fn ok(content: &str, provider_id: &str) -> Self {
            Self {
                call_count: Cell::new(0),
                result: Ok(LlmResponse {
                    content: content.into(),
                    provider_id: provider_id.into(),
                }),
            }
        }

        fn err(e: LlmError) -> Self {
            Self {
                call_count: Cell::new(0),
                result: Err(e),
            }
        }

        fn calls(&self) -> u32 {
            self.call_count.get()
        }
    }

    impl LlmProvider for MockProvider {
        fn complete(&self, _req: &LlmRequest) -> Result<LlmResponse, LlmError> {
            self.call_count.set(self.call_count.get() + 1);
            self.result.clone()
        }
    }

    fn cloud_cfg(id: &str) -> ProviderConfig {
        ProviderConfig::new(
            id,
            id,
            Provider::Anthropic,
            "https://api.anthropic.com/v1",
            "claude-haiku-4-5",
            false,
        )
    }

    fn local_cfg(id: &str) -> ProviderConfig {
        ProviderConfig::new(
            id,
            id,
            Provider::Ollama,
            "http://localhost:11434",
            "llama3",
            true,
        )
    }

    fn req() -> LlmRequest {
        LlmRequest::new(vec![LlmMessage::user("ping")], 1)
    }

    #[test]
    fn no_consent_returns_not_configured() {
        let mut cfg = GatewayConfig::new();
        cfg.providers.push(cloud_cfg("a"));
        cfg.active_provider = Some("a".into());
        let gw: ProviderGateway<MockProvider> = ProviderGateway::new(cfg, vec![]);
        assert_eq!(gw.complete(&req(), false), Err(LlmError::NotConfigured));
    }

    #[test]
    fn no_active_provider_returns_not_configured() {
        let gw: ProviderGateway<MockProvider> = ProviderGateway::new(GatewayConfig::new(), vec![]);
        assert_eq!(gw.complete(&req(), true), Err(LlmError::NotConfigured));
    }

    #[test]
    fn active_id_not_in_providers_list_returns_not_configured() {
        let mut cfg = GatewayConfig::new();
        cfg.providers.push(cloud_cfg("x"));
        cfg.active_provider = Some("x".into());
        let gw: ProviderGateway<MockProvider> = ProviderGateway::new(cfg, vec![]);
        assert_eq!(gw.complete(&req(), true), Err(LlmError::NotConfigured));
    }

    #[test]
    fn local_only_blocks_cloud_provider() {
        let mut cfg = GatewayConfig::new();
        cfg.local_only = true;
        cfg.providers.push(cloud_cfg("a"));
        cfg.active_provider = Some("a".into());
        let mock = MockProvider::ok("hi", "a");
        let gw = ProviderGateway::new(cfg, vec![("a".into(), mock)]);
        assert_eq!(gw.complete(&req(), true), Err(LlmError::LocalOnlyViolation));
    }

    #[test]
    fn local_only_allows_local_provider() {
        let mut cfg = GatewayConfig::new();
        cfg.local_only = true;
        cfg.providers.push(local_cfg("l"));
        cfg.active_provider = Some("l".into());
        let mock = MockProvider::ok("pong", "l");
        let gw = ProviderGateway::new(cfg, vec![("l".into(), mock)]);
        let resp = gw.complete(&req(), true).unwrap();
        assert_eq!(resp.content, "pong");
        assert_eq!(resp.provider_id, "l");
    }

    #[test]
    fn successful_completion_routes_to_active_adapter() {
        let mut cfg = GatewayConfig::new();
        cfg.providers.push(cloud_cfg("a"));
        cfg.active_provider = Some("a".into());
        let mock = MockProvider::ok("answer", "a");
        let gw = ProviderGateway::new(cfg, vec![("a".into(), mock)]);
        let resp = gw.complete(&req(), true).unwrap();
        assert_eq!(resp.content, "answer");
        assert_eq!(resp.provider_id, "a");
    }

    #[test]
    fn adapter_error_propagates() {
        let mut cfg = GatewayConfig::new();
        cfg.providers.push(cloud_cfg("a"));
        cfg.active_provider = Some("a".into());
        let mock = MockProvider::err(LlmError::ProviderError("timeout".into()));
        let gw = ProviderGateway::new(cfg, vec![("a".into(), mock)]);
        assert_eq!(
            gw.complete(&req(), true),
            Err(LlmError::ProviderError("timeout".into()))
        );
    }

    #[test]
    fn is_local_only_reflects_config() {
        let mut cfg = GatewayConfig::new();
        cfg.local_only = true;
        let gw: ProviderGateway<MockProvider> = ProviderGateway::new(cfg, vec![]);
        assert!(gw.is_local_only());
        let gw2: ProviderGateway<MockProvider> = ProviderGateway::new(GatewayConfig::new(), vec![]);
        assert!(!gw2.is_local_only());
    }

    #[test]
    fn active_provider_id_reflects_config() {
        let mut cfg = GatewayConfig::new();
        cfg.active_provider = Some("x".into());
        let gw: ProviderGateway<MockProvider> = ProviderGateway::new(cfg, vec![]);
        assert_eq!(gw.active_provider_id(), Some("x"));

        let gw2: ProviderGateway<MockProvider> = ProviderGateway::new(GatewayConfig::new(), vec![]);
        assert_eq!(gw2.active_provider_id(), None);
    }

    #[test]
    fn config_accessor_returns_reference() {
        let gw: ProviderGateway<MockProvider> = ProviderGateway::new(GatewayConfig::new(), vec![]);
        assert!(gw.config().providers.is_empty());
    }

    #[test]
    fn mock_provider_counts_calls_and_err_variant() {
        let mock = MockProvider::ok("hi", "p");
        let r = req();
        let _ = mock.complete(&r);
        let _ = mock.complete(&r);
        assert_eq!(mock.calls(), 2);

        let mock_err = MockProvider::err(LlmError::NotConfigured);
        assert_eq!(mock_err.complete(&req()), Err(LlmError::NotConfigured));
    }
}
