//! A tiny, dependency-free timestamp formatter.
//!
//! The only place Galley needs to format a time is the manifest's `created`
//! field, so rather than pull a date crate into the core we convert a Unix
//! timestamp to an ISO-8601 UTC string with the well-known civil-from-days
//! algorithm. Galley only ever deals in dates at or after the Unix epoch, so the
//! conversion takes an unsigned timestamp and stays total.

/// Format a Unix timestamp (seconds since 1970-01-01 UTC) as
/// `YYYY-MM-DDTHH:MM:SSZ`.
#[must_use]
pub fn iso8601_utc(epoch_secs: u64) -> String {
    let days = epoch_secs / 86_400;
    let rem = epoch_secs % 86_400;
    let (year, month, day) = civil_from_days(days);
    let (hour, minute, second) = (rem / 3_600, (rem % 3_600) / 60, rem % 60);
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

/// Convert a count of days since the Unix epoch into a `(year, month, day)`
/// civil date. Adapted from Howard Hinnant's `civil_from_days`; valid for any
/// date at or after the epoch.
fn civil_from_days(days: u64) -> (u64, u64, u64) {
    let z = days + 719_468;
    let era = z / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { year + 1 } else { year };
    (year, month, day)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_the_epoch() {
        assert_eq!(iso8601_utc(0), "1970-01-01T00:00:00Z");
    }

    #[test]
    fn formats_known_timestamps() {
        // A March date: exercises `mp < 10` and `month > 2`.
        assert_eq!(iso8601_utc(1_710_500_645), "2024-03-15T11:04:05Z");
        // A January date: exercises `mp >= 10` and `month <= 2`.
        assert_eq!(iso8601_utc(1_704_067_200), "2024-01-01T00:00:00Z");
        // A February, end-of-day date: a second worked example for `month <= 2`.
        assert_eq!(iso8601_utc(1_582_934_399), "2020-02-28T23:59:59Z");
    }
}
