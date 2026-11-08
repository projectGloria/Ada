use serde::{Deserialize, Serialize};

/// Pre-decimal British currency represented entirely as integer pence.
/// 12d = 1s (shilling)
/// 20s = £1 (pound) -> 240d = £1
pub type Pence = i64;

/// Formats integer pence into authentic pre-decimal £sd notation.
/// E.g., 294 pence -> £1 4s 6d
/// 18 pence -> 1s 6d
/// 6 pence -> 6d
pub fn format_lsd(pence: Pence) -> String {
    let is_negative = pence < 0;
    let abs_pence = pence.abs();

    let pounds = abs_pence / 240;
    let remainder = abs_pence % 240;
    let shillings = remainder / 12;
    let pence_left = remainder % 12;

    let sign = if is_negative { "-" } else { "" };

    if pounds > 0 {
        format!("{sign}£{pounds} {shillings}s {pence_left}d")
    } else if shillings > 0 {
        format!("{sign}{shillings}s {pence_left}d")
    } else {
        format!("{sign}{pence_left}d")
    }
}

/// Computes pre-decimal earnings:
/// 1 shilling (12d) per 5 focused minutes, plus 1 shilling completion bonus.
pub fn calculate_earnings(duration_minutes: i64) -> Pence {
    let base = (duration_minutes / 5) * 12;
    let completion_bonus = 12; // 1s
    base + completion_bonus
}

/// The core immutable event stored in the append-only SQLite log.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StoredEvent {
    pub id: String,          // UUIDv7
    pub event_type: String,  // Discriminator
    pub timestamp: i64,      // Monotonic epoch timestamp (ms)
    pub device_id: String,  // Machine identifier
    pub payload: String,     // JSON string
}

/// Payload for `SessionStarted`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionStartedPayload {
    pub session_id: String,
    pub duration_minutes: i64,
    pub target_building: String,
    pub strictness: String,
    pub tag_id: String,
}

/// Payload for `SessionCompleted`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionCompletedPayload {
    pub session_id: String,
    pub earned_pence: Pence,
    pub duration_minutes: i64,
}

/// Failure reasons for a focus session
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionFailReason {
    AppSwitch,
    Abandoned,
    ManualGiveUp,
}

impl ToString for SessionFailReason {
    fn to_string(&self) -> String {
        match self {
            SessionFailReason::AppSwitch => "app_switch".to_string(),
            SessionFailReason::Abandoned => "abandoned".to_string(),
            SessionFailReason::ManualGiveUp => "manual_give_up".to_string(),
        }
    }
}

/// Payload for `SessionFailed`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionFailedPayload {
    pub session_id: String,
    pub reason: String,
    pub elapsed_seconds: i64,
    pub target_duration_minutes: i64,
}

/// Payload for `Purchase`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PurchasePayload {
    pub item_id: String,
    pub cost_pence: Pence,
}

/// Payload for `TagCreated` / `TagUpdated`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagPayload {
    pub tag_id: String,
    pub name: String,
    pub color: String,
}

/// Payload for `SettingChanged`
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SettingChangedPayload {
    pub key: String,
    pub value: String,
}

/// Projected summary of a session computed from the immutable event stream.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionProjection {
    pub session_id: String,
    pub status: String, // "running" | "completed" | "failed"
    pub building_type: String,
    pub duration_minutes: i64,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub tag_id: String,
    pub earned_pence: Option<Pence>,
    pub failure_reason: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_lsd_exact_values() {
        assert_eq!(format_lsd(0), "0d");
        assert_eq!(format_lsd(6), "6d");
        assert_eq!(format_lsd(12), "1s 0d");
        assert_eq!(format_lsd(18), "1s 6d");
        assert_eq!(format_lsd(240), "£1 0s 0d");
        assert_eq!(format_lsd(294), "£1 4s 6d");
        assert_eq!(format_lsd(485), "£2 0s 5d");
    }

    #[test]
    fn test_format_lsd_negative_values() {
        assert_eq!(format_lsd(-12), "-1s 0d");
        assert_eq!(format_lsd(-294), "-£1 4s 6d");
    }

    #[test]
    fn test_calculate_earnings() {
        // 25 minutes -> 5 blocks of 5 mins -> 5 * 12d = 60d (5s) + 12d bonus = 72d (6s)
        assert_eq!(calculate_earnings(25), 72);
        // 10 minutes -> 2 * 12 + 12 = 36d (3s)
        assert_eq!(calculate_earnings(10), 36);
        // 60 minutes -> 12 * 12 + 12 = 156d (13s)
        assert_eq!(calculate_earnings(60), 156);
    }
}
