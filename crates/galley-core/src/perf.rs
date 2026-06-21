//! Performance budgets for the low-spec reference machine (master plan §8.2).
//!
//! Pure, I/O-free policy. This module states the numeric budgets Galley commits
//! to on a modest laptop, classifies a captured [`Measurement`] against them, and
//! scales the auto-compile debounce to document size so very large documents stay
//! responsive instead of recompiling on every keystroke.

/// Whether a single measured metric is within its budget.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BudgetStatus {
    /// The measurement is at or below the budget.
    Pass,
    /// The measurement exceeds the budget.
    Fail,
}

impl BudgetStatus {
    /// Classify `measured` against `budget` (lower is better; equal passes).
    #[must_use]
    pub const fn within(measured: u64, budget: u64) -> Self {
        if measured <= budget {
            Self::Pass
        } else {
            Self::Fail
        }
    }

    /// `true` when this status is [`BudgetStatus::Pass`].
    #[must_use]
    pub const fn is_pass(self) -> bool {
        matches!(self, Self::Pass)
    }
}

/// The performance budgets Galley commits to on the reference machine.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PerfBudget {
    /// Cold start to interactive, in milliseconds.
    pub cold_start_ms: u64,
    /// Idle resident memory including a warm engine, in mebibytes.
    pub idle_ram_mb: u64,
    /// Cached single-edit recompile of a medium document, in milliseconds.
    pub recompile_ms: u64,
    /// UI interaction frame budget, in milliseconds.
    pub frame_ms: u64,
    /// Shipped UI bundle size (gzipped JS + CSS), in kibibytes.
    pub bundle_kib: u64,
}

impl PerfBudget {
    /// The budgets from master plan §8.2.
    pub const REFERENCE: PerfBudget = PerfBudget {
        cold_start_ms: 2_500,
        idle_ram_mb: 150,
        recompile_ms: 1_000,
        frame_ms: 16,
        bundle_kib: 1_536,
    };

    /// Classify a [`Measurement`] against this budget, metric by metric.
    #[must_use]
    pub const fn evaluate(&self, m: &Measurement) -> BudgetReport {
        BudgetReport {
            cold_start: BudgetStatus::within(m.cold_start_ms, self.cold_start_ms),
            idle_ram: BudgetStatus::within(m.idle_ram_mb, self.idle_ram_mb),
            recompile: BudgetStatus::within(m.recompile_ms, self.recompile_ms),
            frame: BudgetStatus::within(m.frame_ms, self.frame_ms),
            bundle: BudgetStatus::within(m.bundle_kib, self.bundle_kib),
        }
    }
}

/// A captured set of performance measurements, in the same units as [`PerfBudget`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Measurement {
    /// Measured cold start to interactive, in milliseconds.
    pub cold_start_ms: u64,
    /// Measured idle resident memory, in mebibytes.
    pub idle_ram_mb: u64,
    /// Measured cached single-edit recompile, in milliseconds.
    pub recompile_ms: u64,
    /// Measured worst-case interaction frame time, in milliseconds.
    pub frame_ms: u64,
    /// Measured shipped UI bundle size, in kibibytes.
    pub bundle_kib: u64,
}

/// The per-metric outcome of evaluating a [`Measurement`] against a [`PerfBudget`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BudgetReport {
    /// Cold-start outcome.
    pub cold_start: BudgetStatus,
    /// Idle-RAM outcome.
    pub idle_ram: BudgetStatus,
    /// Recompile outcome.
    pub recompile: BudgetStatus,
    /// Frame-time outcome.
    pub frame: BudgetStatus,
    /// Bundle-size outcome.
    pub bundle: BudgetStatus,
}

impl BudgetReport {
    /// `true` only when every metric is within budget.
    #[must_use]
    pub const fn all_pass(&self) -> bool {
        self.cold_start.is_pass()
            && self.idle_ram.is_pass()
            && self.recompile.is_pass()
            && self.frame.is_pass()
            && self.bundle.is_pass()
    }
}

/// Smallest auto-compile debounce, in milliseconds, for a tiny document.
pub const MIN_DEBOUNCE_MS: u64 = 250;
/// Largest auto-compile debounce, in milliseconds, for a very large document.
pub const MAX_DEBOUNCE_MS: u64 = 1_500;
/// Document bytes that add one millisecond of debounce beyond the minimum.
pub const DEBOUNCE_BYTES_PER_MS: u64 = 512;

/// Scale the auto-compile debounce to document size.
///
/// Small documents recompile almost immediately; large ones wait longer so a
/// burst of keystrokes coalesces into a single build. The result is clamped to
/// `[MIN_DEBOUNCE_MS, MAX_DEBOUNCE_MS]`.
#[must_use]
pub const fn adaptive_debounce_ms(doc_bytes: u64) -> u64 {
    let extra = doc_bytes / DEBOUNCE_BYTES_PER_MS;
    let target = MIN_DEBOUNCE_MS + extra;
    if target > MAX_DEBOUNCE_MS {
        MAX_DEBOUNCE_MS
    } else {
        target
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ok_measurement() -> Measurement {
        Measurement {
            cold_start_ms: 1_800,
            idle_ram_mb: 120,
            recompile_ms: 700,
            frame_ms: 12,
            bundle_kib: 900,
        }
    }

    #[test]
    fn within_passes_at_or_below_budget() {
        assert_eq!(BudgetStatus::within(99, 100), BudgetStatus::Pass);
        assert_eq!(BudgetStatus::within(100, 100), BudgetStatus::Pass);
    }

    #[test]
    fn within_fails_above_budget() {
        assert_eq!(BudgetStatus::within(101, 100), BudgetStatus::Fail);
    }

    #[test]
    fn is_pass_reflects_the_variant() {
        assert!(BudgetStatus::Pass.is_pass());
        assert!(!BudgetStatus::Fail.is_pass());
    }

    #[test]
    fn reference_budget_matches_the_plan() {
        let b = PerfBudget::REFERENCE;
        assert_eq!(b.cold_start_ms, 2_500);
        assert_eq!(b.idle_ram_mb, 150);
        assert_eq!(b.recompile_ms, 1_000);
        assert_eq!(b.frame_ms, 16);
        assert_eq!(b.bundle_kib, 1_536);
    }

    #[test]
    fn a_measurement_within_every_budget_passes() {
        let report = PerfBudget::REFERENCE.evaluate(&ok_measurement());
        assert_eq!(report.cold_start, BudgetStatus::Pass);
        assert_eq!(report.idle_ram, BudgetStatus::Pass);
        assert_eq!(report.recompile, BudgetStatus::Pass);
        assert_eq!(report.frame, BudgetStatus::Pass);
        assert_eq!(report.bundle, BudgetStatus::Pass);
        assert!(report.all_pass());
    }

    #[test]
    fn a_single_overage_fails_the_report() {
        let mut m = ok_measurement();
        m.cold_start_ms = 9_000;
        let report = PerfBudget::REFERENCE.evaluate(&m);
        assert_eq!(report.cold_start, BudgetStatus::Fail);
        assert!(!report.all_pass());
    }

    #[test]
    fn debounce_floor_for_tiny_documents() {
        assert_eq!(adaptive_debounce_ms(0), MIN_DEBOUNCE_MS);
        assert_eq!(adaptive_debounce_ms(511), MIN_DEBOUNCE_MS);
    }

    #[test]
    fn debounce_scales_with_size() {
        // 512 bytes adds exactly one millisecond.
        assert_eq!(adaptive_debounce_ms(512), MIN_DEBOUNCE_MS + 1);
        assert_eq!(adaptive_debounce_ms(512 * 100), MIN_DEBOUNCE_MS + 100);
    }

    #[test]
    fn debounce_is_clamped_at_the_ceiling() {
        assert_eq!(adaptive_debounce_ms(u64::MAX), MAX_DEBOUNCE_MS);
    }

    #[test]
    fn derived_traits_are_exercised() {
        // Debug + Clone/Copy + PartialEq across the public types.
        let status = BudgetStatus::Pass;
        assert_eq!(format!("{status:?}"), "Pass");
        assert_eq!(status, status.clone());

        let budget = PerfBudget::REFERENCE;
        assert_eq!(budget, budget);
        assert!(format!("{budget:?}").contains("PerfBudget"));

        let m = ok_measurement();
        assert_eq!(m, m);
        assert!(format!("{m:?}").contains("Measurement"));

        let report = budget.evaluate(&m);
        assert_eq!(report, report);
        assert!(format!("{report:?}").contains("BudgetReport"));
    }
}
