//! Incremental compilation: skip work when nothing changed.
//!
//! The fastest compile is the one you don't run. [`CachingCompiler`] wraps any
//! [`Compiler`] and remembers the most recent build keyed by a fingerprint of
//! its inputs ([`CacheKey`]); when the next request has the same key, it returns
//! the previous [`CompileResult`] without touching the engine at all. Combined
//! with the warm engine (which keeps the LaTeX format and bundle hot) and the
//! in-memory VFS (intermediate files never hit disk), this is what makes a
//! single-edit recompile feel instant.
//!
//! Everything here is pure and engine-agnostic — the cache decision logic is
//! tested to full coverage against a mock [`Compiler`], while the real Tectonic
//! engine stays behind the `real-compiler` seam.
//!
//! Scope note: v0.1.1 compiles a single canonical source string, so the key is
//! that source plus the request. When multi-file projects land (v0.2.1) the key
//! must fold in every input the build reads; that change lives entirely in
//! [`CacheKey::new`].

use galley_core::{content_hash, CompileRequest, CompileResult, Compiler, Engine};

/// A fingerprint of everything a build depends on.
///
/// Two requests with equal keys must produce the same output, so a match is safe
/// to serve from cache. The key folds in the source (by hash), the root document
/// path, and the engine.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CacheKey {
    /// FNV-1a hash of the canonical source.
    source_hash: u64,
    /// The root document path (different roots are different builds).
    root_document: String,
    /// The engine the build was driven with.
    engine: Engine,
}

impl CacheKey {
    /// Derive the key for compiling `source` under `request`.
    #[must_use]
    pub fn new(request: &CompileRequest, source: &str) -> Self {
        Self {
            source_hash: content_hash(source),
            root_document: request.root_document.clone(),
            engine: request.engine,
        }
    }
}

/// A single-entry cache holding the most recent build.
///
/// One entry is enough for the editing loop: you compile the document you are
/// looking at, edit it, and recompile the same document. The entry is replaced
/// on every miss, so memory stays bounded to one result.
#[derive(Debug, Default)]
pub struct CompileCache {
    entry: Option<(CacheKey, CompileResult)>,
}

impl CompileCache {
    /// An empty cache.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// The cached result for `key`, if the most recent build matches it.
    #[must_use]
    pub fn lookup(&self, key: &CacheKey) -> Option<&CompileResult> {
        match &self.entry {
            Some((stored, result)) if stored == key => Some(result),
            _ => None,
        }
    }

    /// Remember `result` as the build for `key`, replacing any prior entry.
    pub fn store(&mut self, key: CacheKey, result: CompileResult) {
        self.entry = Some((key, result));
    }
}

/// The outcome of a [`CachingCompiler`] build: the result, and whether it was
/// served from the cache (a hit) rather than freshly compiled (a miss).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CachedCompile {
    /// The compile result.
    pub result: CompileResult,
    /// `true` when the result came from the cache without running the engine.
    pub cached: bool,
}

/// Wraps a [`Compiler`] with a most-recent-build cache.
///
/// Held warm for the life of the process (one long-lived instance, no per-build
/// re-construction), it short-circuits unchanged recompiles to the cached result
/// and only drives the underlying engine on a genuine change.
pub struct CachingCompiler<C: Compiler> {
    inner: C,
    cache: CompileCache,
}

impl<C: Compiler> CachingCompiler<C> {
    /// Wrap `inner` with an empty cache.
    pub fn new(inner: C) -> Self {
        Self {
            inner,
            cache: CompileCache::new(),
        }
    }

    /// Compile `source` for `request`, serving the cached result when the inputs
    /// are unchanged since the last build.
    pub fn compile(&mut self, request: &CompileRequest, source: &str) -> CachedCompile {
        let key = CacheKey::new(request, source);
        if let Some(hit) = self.cache.lookup(&key) {
            return CachedCompile {
                result: hit.clone(),
                cached: true,
            };
        }
        let result = self.inner.compile(request, source);
        self.cache.store(key, result.clone());
        CachedCompile {
            result,
            cached: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use galley_core::CompileStatus;
    use std::cell::Cell;

    /// A mock compiler that counts how often it actually runs and returns a PDF
    /// whose single byte is the source length, so different sources yield
    /// distinguishable results. One type keeps `CachingCompiler` to a single
    /// monomorphization, so every match arm is exercised.
    struct CountingCompiler {
        runs: Cell<u32>,
    }
    impl CountingCompiler {
        fn new() -> Self {
            Self { runs: Cell::new(0) }
        }
    }
    impl Compiler for CountingCompiler {
        fn compile(&self, _request: &CompileRequest, source: &str) -> CompileResult {
            self.runs.set(self.runs.get() + 1);
            CompileResult::succeeded(vec![source.len() as u8], "ok")
        }
    }

    fn request() -> CompileRequest {
        CompileRequest::new("main.tex", Engine::Tectonic)
    }

    #[test]
    fn a_miss_runs_the_engine_and_a_repeat_is_served_from_cache() {
        let mut compiler = CachingCompiler::new(CountingCompiler::new());
        let req = request();

        let first = compiler.compile(&req, "hello");
        assert!(!first.cached);
        assert_eq!(first.result.report.status, CompileStatus::Succeeded);

        let second = compiler.compile(&req, "hello");
        assert!(second.cached);
        assert_eq!(second.result, first.result);
    }

    #[test]
    fn the_engine_runs_exactly_once_for_repeated_identical_input() {
        let inner = CountingCompiler::new();
        let mut compiler = CachingCompiler::new(inner);
        let req = request();
        compiler.compile(&req, "same");
        compiler.compile(&req, "same");
        compiler.compile(&req, "same");
        // Only the first build hit the engine; the rest were cache hits.
        assert_eq!(compiler.inner.runs.get(), 1);
    }

    #[test]
    fn a_changed_source_is_a_miss_and_recompiles() {
        let mut compiler = CachingCompiler::new(CountingCompiler::new());
        let req = request();
        let first = compiler.compile(&req, "a");
        let second = compiler.compile(&req, "abc");
        assert!(!first.cached);
        assert!(!second.cached);
        assert_ne!(first.result, second.result);
        assert_eq!(compiler.inner.runs.get(), 2);
    }

    #[test]
    fn lookup_misses_on_an_empty_cache_and_on_a_different_key() {
        let mut cache = CompileCache::new();
        let key_a = CacheKey::new(&request(), "a");
        assert!(cache.lookup(&key_a).is_none());

        cache.store(key_a.clone(), CompileResult::succeeded(vec![1], "a"));
        // A stored entry whose key differs is still a miss (exercises the guard).
        let key_b = CacheKey::new(&request(), "b");
        assert!(cache.lookup(&key_b).is_none());
        // The matching key is a hit.
        assert!(cache.lookup(&key_a).is_some());
    }

    #[test]
    fn cache_key_distinguishes_source_root_and_engine() {
        let base = CacheKey::new(&CompileRequest::new("main.tex", Engine::Tectonic), "x");
        let other_source = CacheKey::new(&CompileRequest::new("main.tex", Engine::Tectonic), "y");
        let other_root = CacheKey::new(&CompileRequest::new("paper.tex", Engine::Tectonic), "x");
        assert_ne!(base, other_source);
        assert_ne!(base, other_root);
        assert_eq!(base, base.clone());
    }

    #[test]
    fn types_support_their_derives() {
        let cache = CompileCache::new();
        assert!(format!("{cache:?}").contains("CompileCache"));

        let key = CacheKey::new(&request(), "x");
        assert!(format!("{key:?}").contains("CacheKey"));

        let cached = CachedCompile {
            result: CompileResult::succeeded(vec![1], "ok"),
            cached: true,
        };
        assert_eq!(cached.clone(), cached);
        assert!(format!("{cached:?}").contains("CachedCompile"));
        let miss = CachedCompile {
            result: CompileResult::succeeded(vec![1], "ok"),
            cached: false,
        };
        assert_ne!(cached, miss);
    }
}
