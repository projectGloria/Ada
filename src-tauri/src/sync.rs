use crate::events::StoredEvent;
use crate::storage::Database;
use rusqlite::params;
use serde::{Deserialize, Serialize};

pub const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupPayload {
    pub schema_version: u32,
    pub exported_at: i64,
    pub events: Vec<StoredEvent>,
}

/// Exports all stored events as a validated versioned JSON backup.
pub fn export_backup(db: &Database) -> Result<String, String> {
    let events = db.get_all_events().map_err(|e| e.to_string())?;
    let payload = BackupPayload {
        schema_version: SCHEMA_VERSION,
        exported_at: chrono::Utc::now().timestamp_millis(),
        events,
    };
    serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())
}

/// Imports and merges an event log into the local database.
/// Performs an immutable union merge: events with existing IDs are skipped.
pub fn import_and_merge_backup(db: &Database, json_str: &str) -> Result<usize, String> {
    let backup: BackupPayload = serde_json::from_str(json_str)
        .map_err(|e| format!("Invalid backup schema format: {e}"))?;

    if backup.schema_version != SCHEMA_VERSION {
        return Err(format!(
            "Unsupported schema version: {}. Expected {SCHEMA_VERSION}",
            backup.schema_version
        ));
    }

    let merged_count = merge_events_list(db, &backup.events).map_err(|e| e.to_string())?;
    Ok(merged_count)
}

/// Merges a list of events into the local database using UUID deduplication.
pub fn merge_events_list(db: &Database, new_events: &[StoredEvent]) -> rusqlite::Result<usize> {
    let existing = db.get_all_events()?;
    let existing_ids: std::collections::HashSet<String> =
        existing.into_iter().map(|e| e.id).collect();

    let mut inserted = 0;
    for event in new_events {
        if !existing_ids.contains(&event.id) {
            // Append event preserving original UUID and timestamp
            let conn_guard = db.get_connection();
            let conn = conn_guard.lock().unwrap();
            conn.execute(
                "INSERT INTO events (id, event_type, timestamp, device_id, payload)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    event.id,
                    event.event_type,
                    event.timestamp,
                    event.device_id,
                    event.payload
                ],
            )?;
            inserted += 1;
        }
    }

    Ok(inserted)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_merge_logic_union_deduplication() {
        let db = Database::new_in_memory().unwrap();

        let event1 = StoredEvent {
            id: "uuid-1".to_string(),
            event_type: "SessionStarted".to_string(),
            timestamp: 1000,
            device_id: "dev-a".to_string(),
            payload: "{}".to_string(),
        };

        let event2 = StoredEvent {
            id: "uuid-2".to_string(),
            event_type: "SessionCompleted".to_string(),
            timestamp: 2000,
            device_id: "dev-a".to_string(),
            payload: "{}".to_string(),
        };

        // First merge: insert 2 events
        let inserted = merge_events_list(&db, &[event1.clone(), event2.clone()]).unwrap();
        assert_eq!(inserted, 2);

        // Second merge with duplicates + 1 new event
        let event3 = StoredEvent {
            id: "uuid-3".to_string(),
            event_type: "Purchase".to_string(),
            timestamp: 3000,
            device_id: "dev-b".to_string(),
            payload: "{}".to_string(),
        };

        let inserted_again = merge_events_list(&db, &[event1, event2, event3]).unwrap();
        // Only the 1 new event must be inserted
        assert_eq!(inserted_again, 1);

        let all = db.get_all_events().unwrap();
        assert_eq!(all.len(), 3);
    }
}
