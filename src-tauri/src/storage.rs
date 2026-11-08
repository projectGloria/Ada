use crate::events::{
    Pence, SessionCompletedPayload, SessionFailedPayload, SessionProjection,
    SessionStartedPayload, StoredEvent,
};
use chrono::Utc;
use rusqlite::{params, Connection, Result};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use uuid::Uuid;

pub struct Database {
    conn: Mutex<Connection>,
    pub device_id: String,
}

impl Database {
    /// Access the underlying connection mutex for transaction and batch imports
    pub fn get_connection(&self) -> &Mutex<Connection> {
        &self.conn
    }

    /// Resolves the canonical app data directory (`%APPDATA%/Ada` on Windows).
    pub fn resolve_app_dir() -> PathBuf {
        if let Ok(app_data) = std::env::var("APPDATA") {
            PathBuf::from(app_data).join("Ada")
        } else if let Some(dir) = dirs::data_dir() {
            dir.join("Ada")
        } else {
            PathBuf::from(".").join("Ada")
        }
    }

    /// Initializes a database connection at the specified path and runs migrations.
    pub fn new(db_path: &Path) -> Result<Self> {
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent).ok();
        }

        let mut conn = Connection::open(db_path)?;
        Self::run_migrations(&mut conn)?;
        let device_id = Self::get_or_create_device_id(&mut conn)?;

        let db = Self {
            conn: Mutex::new(conn),
            device_id,
        };

        // Enforce abandoned-session check immediately on startup
        db.recover_abandoned_sessions(Utc::now().timestamp_millis())?;

        Ok(db)
    }

    /// Creates an in-memory database for testing.
    pub fn new_in_memory() -> Result<Self> {
        let mut conn = Connection::open_in_memory()?;
        Self::run_migrations(&mut conn)?;
        let device_id = Self::get_or_create_device_id(&mut conn)?;

        Ok(Self {
            conn: Mutex::new(conn),
            device_id,
        })
    }

    /// Executes database migrations sequentially.
    fn run_migrations(conn: &mut Connection) -> Result<()> {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            );",
            [],
        )?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS device_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
            [],
        )?;

        let current_version: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if current_version < 1 {
            let tx = conn.transaction()?;
            tx.execute(
                "CREATE TABLE IF NOT EXISTS events (
                    id TEXT PRIMARY KEY,
                    event_type TEXT NOT NULL,
                    timestamp INTEGER NOT NULL,
                    device_id TEXT NOT NULL,
                    payload TEXT NOT NULL
                );",
                [],
            )?;

            tx.execute(
                "CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);",
                [],
            )?;
            tx.execute(
                "CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);",
                [],
            )?;

            tx.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?1);",
                params![Utc::now().to_rfc3339()],
            )?;

            tx.commit()?;
        }

        Ok(())
    }

    /// Retrieves or initializes a persistent unique machine/device identifier.
    fn get_or_create_device_id(conn: &mut Connection) -> Result<String> {
        let existing: Result<String> = conn.query_row(
            "SELECT value FROM device_meta WHERE key = 'device_id'",
            [],
            |row| row.get(0),
        );

        match existing {
            Ok(id) => Ok(id),
            Err(_) => {
                let new_id = Uuid::now_v7().to_string();
                conn.execute(
                    "INSERT INTO device_meta (key, value) VALUES ('device_id', ?1)",
                    params![new_id],
                )?;
                Ok(new_id)
            }
        }
    }

    /// Appends an immutable event to the log.
    pub fn append_event(&self, event_type: &str, payload_json: &str) -> Result<StoredEvent> {
        let conn = self.conn.lock().unwrap();
        let event_id = Uuid::now_v7().to_string();
        let timestamp = Utc::now().timestamp_millis();

        conn.execute(
            "INSERT INTO events (id, event_type, timestamp, device_id, payload)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![event_id, event_type, timestamp, self.device_id, payload_json],
        )?;

        Ok(StoredEvent {
            id: event_id,
            event_type: event_type.to_string(),
            timestamp,
            device_id: self.device_id.clone(),
            payload: payload_json.to_string(),
        })
    }

    /// Fetches all stored events in chronological order.
    pub fn get_all_events(&self) -> Result<Vec<StoredEvent>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, event_type, timestamp, device_id, payload FROM events ORDER BY timestamp ASC",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(StoredEvent {
                id: row.get(0)?,
                event_type: row.get(1)?,
                timestamp: row.get(2)?,
                device_id: row.get(3)?,
                payload: row.get(4)?,
            })
        })?;

        let mut events = Vec::new();
        for event in rows {
            events.push(event?);
        }
        Ok(events)
    }

    /// Reconstructs session projections from the immutable event log.
    pub fn project_sessions(&self) -> Result<Vec<SessionProjection>> {
        let events = self.get_all_events()?;
        let mut sessions: Vec<SessionProjection> = Vec::new();

        for event in events {
            match event.event_type.as_str() {
                "SessionStarted" => {
                    if let Ok(payload) = serde_json::from_str::<SessionStartedPayload>(&event.payload) {
                        sessions.push(SessionProjection {
                            session_id: payload.session_id,
                            status: "running".to_string(),
                            building_type: payload.target_building,
                            duration_minutes: payload.duration_minutes,
                            started_at: event.timestamp,
                            ended_at: None,
                            tag_id: payload.tag_id,
                            earned_pence: None,
                            failure_reason: None,
                        });
                    }
                }
                "SessionCompleted" => {
                    if let Ok(payload) = serde_json::from_str::<SessionCompletedPayload>(&event.payload) {
                        if let Some(session) = sessions.iter_mut().find(|s| s.session_id == payload.session_id) {
                            session.status = "completed".to_string();
                            session.ended_at = Some(event.timestamp);
                            session.earned_pence = Some(payload.earned_pence);
                        }
                    }
                }
                "SessionFailed" => {
                    if let Ok(payload) = serde_json::from_str::<SessionFailedPayload>(&event.payload) {
                        if let Some(session) = sessions.iter_mut().find(|s| s.session_id == payload.session_id) {
                            session.status = "failed".to_string();
                            session.ended_at = Some(event.timestamp);
                            session.failure_reason = Some(payload.reason);
                        }
                    }
                }
                _ => {}
            }
        }

        Ok(sessions)
    }

    /// Computes the derived pre-decimal balance strictly from earnings and purchase events.
    pub fn calculate_balance(&self) -> Result<Pence> {
        let events = self.get_all_events()?;
        let mut balance: Pence = 0;

        for event in events {
            match event.event_type.as_str() {
                "SessionCompleted" => {
                    if let Ok(payload) = serde_json::from_str::<SessionCompletedPayload>(&event.payload) {
                        balance += payload.earned_pence;
                    }
                }
                "Purchase" => {
                    if let Ok(payload) = serde_json::from_str::<crate::events::PurchasePayload>(&event.payload) {
                        balance -= payload.cost_pence;
                    }
                }
                _ => {}
            }
        }

        Ok(balance)
    }

    /// Closes the "just kill the process" loophole:
    /// Detects any session left in 'running' status where the target duration has elapsed,
    /// or where the app was abruptly killed, and marks it 'abandoned' (a ruin).
    pub fn recover_abandoned_sessions(&self, now_timestamp_ms: i64) -> Result<usize> {
        let sessions = self.project_sessions()?;
        let mut recovered_count = 0;

        for session in sessions {
            if session.status == "running" {
                let duration_ms = session.duration_minutes * 60 * 1000;
                let scheduled_end = session.started_at + duration_ms;

                // If scheduled completion time has passed while app was offline
                if now_timestamp_ms >= scheduled_end {
                    let fail_payload = SessionFailedPayload {
                        session_id: session.session_id.clone(),
                        reason: "abandoned".to_string(),
                        elapsed_seconds: (now_timestamp_ms - session.started_at) / 1000,
                        target_duration_minutes: session.duration_minutes,
                    };

                    let json = serde_json::to_string(&fail_payload).unwrap();
                    self.append_event("SessionFailed", &json)?;
                    recovered_count += 1;
                }
            }
        }

        Ok(recovered_count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::calculate_earnings;

    #[test]
    fn test_event_log_and_projection() {
        let db = Database::new_in_memory().unwrap();
        let session_id = "test-session-123";

        // 1. SessionStarted
        let start_payload = SessionStartedPayload {
            session_id: session_id.to_string(),
            duration_minutes: 25,
            target_building: "terrace".to_string(),
            strictness: "lenient".to_string(),
            tag_id: "work".to_string(),
        };
        db.append_event("SessionStarted", &serde_json::to_string(&start_payload).unwrap()).unwrap();

        let projections = db.project_sessions().unwrap();
        assert_eq!(projections.len(), 1);
        assert_eq!(projections[0].status, "running");
        assert_eq!(projections[0].building_type, "terrace");

        // 2. SessionCompleted
        let earnings = calculate_earnings(25);
        let complete_payload = SessionCompletedPayload {
            session_id: session_id.to_string(),
            earned_pence: earnings,
            duration_minutes: 25,
        };
        db.append_event("SessionCompleted", &serde_json::to_string(&complete_payload).unwrap()).unwrap();

        let projections_after = db.project_sessions().unwrap();
        assert_eq!(projections_after[0].status, "completed");
        assert_eq!(projections_after[0].earned_pence, Some(earnings));

        // 3. Balance verification
        let balance = db.calculate_balance().unwrap();
        assert_eq!(balance, earnings);
    }

    #[test]
    fn test_abandoned_session_recovery_integration() {
        let db = Database::new_in_memory().unwrap();
        let session_id = "abandoned-session-456";

        let start_time = 100_000;
        let duration_minutes = 25; // 25 mins = 1,500,000 ms

        let start_payload = SessionStartedPayload {
            session_id: session_id.to_string(),
            duration_minutes,
            target_building: "cottage".to_string(),
            strictness: "strict".to_string(),
            tag_id: "study".to_string(),
        };

        // Insert directly with custom start time to simulate past process kill
        {
            let conn = db.conn.lock().unwrap();
            let event_id = Uuid::now_v7().to_string();
            conn.execute(
                "INSERT INTO events (id, event_type, timestamp, device_id, payload)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    event_id,
                    "SessionStarted",
                    start_time,
                    db.device_id,
                    serde_json::to_string(&start_payload).unwrap()
                ],
            ).unwrap();
        }

        // Before recovery, session is still running
        let projections_before = db.project_sessions().unwrap();
        assert_eq!(projections_before[0].status, "running");

        // Simulate app restarted at time: start_time + 26 minutes (end time has passed)
        let simulated_now = start_time + (26 * 60 * 1000);
        let recovered = db.recover_abandoned_sessions(simulated_now).unwrap();
        assert_eq!(recovered, 1);

        // After recovery, session must be projected as failed with reason 'abandoned'
        let projections_after = db.project_sessions().unwrap();
        assert_eq!(projections_after[0].status, "failed");
        assert_eq!(projections_after[0].failure_reason, Some("abandoned".to_string()));
    }
}
