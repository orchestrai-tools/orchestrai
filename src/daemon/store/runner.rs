//! Backlog runner rows (ADR 0023): per-project settings, the queue, and one
//! `item_runs` row per attempt. The actor's mirror is authoritative; these are
//! loaded once at spawn and written through the persistence queue.

use anyhow::Result;
use rusqlite::{Connection, OptionalExtension, Row};

use warpforge_protocol as wire;

use super::Store;

pub(super) fn init(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS runner_settings (
            project       TEXT PRIMARY KEY,
            settings_json TEXT NOT NULL,
            updated_at    INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS runner_queue (
            item_id     TEXT PRIMARY KEY,
            project     TEXT NOT NULL,
            entry_json  TEXT NOT NULL,
            updated_at  INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS item_runs (
            id            TEXT PRIMARY KEY,
            project       TEXT NOT NULL,
            item_id       TEXT NOT NULL,
            item_number   INTEGER NOT NULL,
            item_title    TEXT NOT NULL,
            task_id       TEXT,
            workflow      TEXT NOT NULL,
            agent         TEXT NOT NULL,
            model         TEXT,
            enqueued_at   INTEGER NOT NULL,
            dispatched_at INTEGER NOT NULL,
            finished_at   INTEGER,
            pr_opened_at  INTEGER,
            merged_at     INTEGER,
            closed_at     INTEGER,
            rounds        INTEGER NOT NULL DEFAULT 0,
            fix_rounds    INTEGER NOT NULL DEFAULT 0,
            cost_usd      REAL,
            outcome       TEXT NOT NULL,
            detail        TEXT,
            pr_url        TEXT,
            pr_number     INTEGER
        );
        CREATE INDEX IF NOT EXISTS item_runs_project_idx ON item_runs(project, dispatched_at);
        "#,
    )?;
    Ok(())
}

fn outcome_str(outcome: wire::ItemRunOutcome) -> String {
    serde_json::to_value(outcome)
        .ok()
        .and_then(|v| v.as_str().map(str::to_string))
        .unwrap_or_default()
}

fn parse_outcome(s: &str) -> wire::ItemRunOutcome {
    serde_json::from_value(serde_json::Value::String(s.to_string()))
        .unwrap_or(wire::ItemRunOutcome::Failed)
}

const RUN_COLUMNS: &str = "id, project, item_id, item_number, item_title, task_id, workflow, \
     agent, model, enqueued_at, dispatched_at, finished_at, pr_opened_at, merged_at, closed_at, \
     rounds, fix_rounds, cost_usd, outcome, detail, pr_url, pr_number";

fn run_from_row(row: &Row<'_>) -> rusqlite::Result<wire::ItemRun> {
    Ok(wire::ItemRun {
        id: row.get(0)?,
        project: row.get(1)?,
        item_id: row.get(2)?,
        item_number: row.get::<_, i64>(3)? as u64,
        item_title: row.get(4)?,
        task_id: row.get(5)?,
        workflow: row.get(6)?,
        agent: row.get(7)?,
        model: row.get(8)?,
        enqueued_at: row.get(9)?,
        dispatched_at: row.get(10)?,
        finished_at: row.get(11)?,
        pr_opened_at: row.get(12)?,
        merged_at: row.get(13)?,
        closed_at: row.get(14)?,
        rounds: row.get::<_, i64>(15)? as u32,
        fix_rounds: row.get::<_, i64>(16)? as u32,
        cost_usd: row.get(17)?,
        outcome: parse_outcome(&row.get::<_, String>(18)?),
        detail: row.get(19)?,
        pr_url: row.get(20)?,
        pr_number: row.get::<_, Option<i64>>(21)?.map(|n| n as u64),
    })
}

impl Store {
    pub fn load_runner_settings(&self) -> Result<Vec<wire::RunnerSettings>> {
        let mut stmt = self
            .conn
            .prepare("SELECT settings_json FROM runner_settings")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        Ok(rows
            .filter_map(|r| r.ok())
            .filter_map(|json| serde_json::from_str(&json).ok())
            .collect())
    }

    pub fn save_runner_settings(&self, settings: &wire::RunnerSettings) -> Result<()> {
        self.conn.execute(
            "INSERT INTO runner_settings (project, settings_json, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(project) DO UPDATE SET settings_json=excluded.settings_json,
             updated_at=excluded.updated_at",
            rusqlite::params![
                settings.project,
                serde_json::to_string(settings)?,
                settings.updated_at
            ],
        )?;
        Ok(())
    }

    pub fn load_runner_queue(&self) -> Result<Vec<wire::RunnerEntry>> {
        let mut stmt = self.conn.prepare("SELECT entry_json FROM runner_queue")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        Ok(rows
            .filter_map(|r| r.ok())
            .filter_map(|json| serde_json::from_str(&json).ok())
            .collect())
    }

    pub fn upsert_runner_entry(&self, entry: &wire::RunnerEntry) -> Result<()> {
        self.conn.execute(
            "INSERT INTO runner_queue (item_id, project, entry_json, updated_at) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(item_id) DO UPDATE SET project=excluded.project,
             entry_json=excluded.entry_json, updated_at=excluded.updated_at",
            rusqlite::params![
                entry.item_id,
                entry.project,
                serde_json::to_string(entry)?,
                entry.updated_at
            ],
        )?;
        Ok(())
    }

    pub fn delete_runner_entry(&self, item_id: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM runner_queue WHERE item_id = ?1",
            rusqlite::params![item_id],
        )?;
        Ok(())
    }

    pub fn upsert_item_run(&self, run: &wire::ItemRun) -> Result<()> {
        self.conn.execute(
            &format!(
                "INSERT OR REPLACE INTO item_runs ({RUN_COLUMNS}) VALUES \
                 (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, \
                 ?18, ?19, ?20, ?21, ?22)"
            ),
            rusqlite::params![
                run.id,
                run.project,
                run.item_id,
                run.item_number as i64,
                run.item_title,
                run.task_id,
                run.workflow,
                run.agent,
                run.model,
                run.enqueued_at,
                run.dispatched_at,
                run.finished_at,
                run.pr_opened_at,
                run.merged_at,
                run.closed_at,
                run.rounds as i64,
                run.fix_rounds as i64,
                run.cost_usd,
                outcome_str(run.outcome),
                run.detail,
                run.pr_url,
                run.pr_number.map(|n| n as i64),
            ],
        )?;
        Ok(())
    }

    pub fn load_item_run(&self, id: &str) -> Result<Option<wire::ItemRun>> {
        Ok(self
            .conn
            .query_row(
                &format!("SELECT {RUN_COLUMNS} FROM item_runs WHERE id = ?1"),
                rusqlite::params![id],
                run_from_row,
            )
            .optional()?)
    }

    /// A project's attempts, newest dispatch first.
    pub fn load_item_runs(&self, project: &str, limit: u32) -> Result<Vec<wire::ItemRun>> {
        let mut stmt = self.conn.prepare(&format!(
            "SELECT {RUN_COLUMNS} FROM item_runs WHERE project = ?1 \
             ORDER BY dispatched_at DESC, rowid DESC LIMIT ?2"
        ))?;
        let rows = stmt.query_map(rusqlite::params![project, limit as i64], run_from_row)?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    /// `(project, dispatched_at)` of every attempt started at or after `since`.
    pub fn item_run_dispatches_since(&self, since: i64) -> Result<Vec<(String, i64)>> {
        let mut stmt = self
            .conn
            .prepare("SELECT project, dispatched_at FROM item_runs WHERE dispatched_at >= ?1")?;
        let rows = stmt.query_map(rusqlite::params![since], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> Store {
        Store::open_at(std::path::Path::new(":memory:")).unwrap()
    }

    fn run(id: &str, dispatched_at: i64, outcome: wire::ItemRunOutcome) -> wire::ItemRun {
        wire::ItemRun {
            id: id.into(),
            project: "demo".into(),
            item_id: "b_1".into(),
            item_number: 1,
            item_title: "One".into(),
            task_id: Some("t_1".into()),
            workflow: "review-loop".into(),
            agent: "claude".into(),
            model: None,
            enqueued_at: 1,
            dispatched_at,
            finished_at: None,
            pr_opened_at: None,
            merged_at: None,
            closed_at: None,
            rounds: 2,
            fix_rounds: 1,
            cost_usd: Some(0.5),
            outcome,
            detail: None,
            pr_url: Some("https://github.com/o/r/pull/3".into()),
            pr_number: Some(3),
        }
    }

    #[test]
    fn settings_queue_and_runs_round_trip() {
        let store = store();
        let mut settings = wire::RunnerSettings::defaults("demo");
        settings.running = true;
        store.save_runner_settings(&settings).unwrap();
        settings.max_concurrent = 2;
        store.save_runner_settings(&settings).unwrap();
        assert_eq!(store.load_runner_settings().unwrap(), vec![settings]);

        let entry = wire::RunnerEntry {
            item_id: "b_1".into(),
            project: "demo".into(),
            number: 1,
            title: "One".into(),
            priority: "high".into(),
            position: 0,
            enqueued_at: 1,
            state: wire::RunnerEntryState::Delivered,
            workflow: None,
            agent: None,
            model: None,
            task_id: Some("t_1".into()),
            run_id: Some("r1".into()),
            pr_url: None,
            pr_number: Some(3),
            waiting_reason: None,
            updated_at: 2,
        };
        store.upsert_runner_entry(&entry).unwrap();
        assert_eq!(store.load_runner_queue().unwrap(), vec![entry]);
        store.delete_runner_entry("b_1").unwrap();
        assert!(store.load_runner_queue().unwrap().is_empty());

        let first = run("r1", 100, wire::ItemRunOutcome::Merged);
        let second = run("r2", 200, wire::ItemRunOutcome::Delivered);
        store.upsert_item_run(&first).unwrap();
        store.upsert_item_run(&second).unwrap();
        assert_eq!(store.load_item_run("r1").unwrap(), Some(first.clone()));
        assert_eq!(
            store.load_item_runs("demo", 10).unwrap(),
            vec![second, first]
        );
        assert_eq!(
            store.item_run_dispatches_since(150).unwrap(),
            vec![("demo".to_string(), 200)]
        );
    }
}
