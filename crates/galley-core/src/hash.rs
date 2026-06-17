//! Content hashing for incremental compilation.
//!
//! Galley recompiles only what changed, and the cheapest way to ask "did the
//! input change?" is to hash it. This module provides a small, dependency-free
//! 64-bit [FNV-1a] hash over a string. It is not cryptographic — it is a fast,
//! well-distributed fingerprint for cache keys (see `galley-compile`'s cache),
//! which is exactly what incremental builds need.
//!
//! [FNV-1a]: https://en.wikipedia.org/wiki/Fowler%E2%80%93Noll%E2%80%93Vo_hash_function

/// The 64-bit FNV-1a offset basis.
const OFFSET_BASIS: u64 = 0xcbf2_9ce4_8422_2325;
/// The 64-bit FNV-1a prime.
const PRIME: u64 = 0x0000_0100_0000_01b3;

/// Hash `source` to a 64-bit fingerprint with FNV-1a.
///
/// Equal inputs always hash equal; different inputs almost always differ. The
/// empty string hashes to the offset basis, so it is still a stable, usable key.
#[must_use]
pub fn content_hash(source: &str) -> u64 {
    let mut hash = OFFSET_BASIS;
    for byte in source.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(PRIME);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_input_hashes_to_the_offset_basis() {
        assert_eq!(content_hash(""), OFFSET_BASIS);
    }

    #[test]
    fn equal_inputs_hash_equal() {
        assert_eq!(
            content_hash("\\documentclass{article}"),
            content_hash("\\documentclass{article}")
        );
    }

    #[test]
    fn different_inputs_hash_differently() {
        assert_ne!(content_hash("a"), content_hash("b"));
        // A single-character change is detected (the whole point of the cache key).
        assert_ne!(
            content_hash("Hello from Galley."),
            content_hash("Hello from Galley!")
        );
        // Order matters: a transposition changes the hash.
        assert_ne!(content_hash("ab"), content_hash("ba"));
    }

    #[test]
    fn matches_the_known_fnv1a_vector() {
        // The canonical FNV-1a 64-bit hash of "a" is 0xaf63dc4c8601ec8c.
        assert_eq!(content_hash("a"), 0xaf63_dc4c_8601_ec8c);
    }
}
