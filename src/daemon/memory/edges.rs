use anyhow::Result;
use rusqlite::params;

use super::helpers::clamp_relation;
use super::MemoryStore;
use crate::daemon::memory_types::MemoryError;
use crate::daemon::task::now_secs;

impl MemoryStore {
    // ── v2: graph ──
    /// Link two memories. The edge is stored in the source memory's database,
    /// so a link from a project overlay memory to a global one lives in the
    /// overlay; `list_edges` reads every database, so it is found either way.
    pub fn add_edge(
        &self,
        src_id: &str,
        dst_id: &str,
        relation: &str,
    ) -> Result<crate::daemon::memory_types::Edge, MemoryError> {
        let relation = clamp_relation(relation);
        let home = self.locate(src_id)?;
        self.locate(dst_id)?;
        let now = now_secs() as i64;
        home.conn().execute(
            "INSERT OR IGNORE INTO memory_edges (src_id,dst_id,relation,created_at) VALUES (?1,?2,?3,?4)",
            params![src_id, dst_id, relation, now],
        )?;
        Ok(crate::daemon::memory_types::Edge {
            src_id: src_id.into(),
            dst_id: dst_id.into(),
            relation,
            created_at: now,
        })
    }
    /// Edges touching `id` in either direction, from every database.
    pub fn list_edges(
        &self,
        id: &str,
    ) -> Result<Vec<crate::daemon::memory_types::Edge>, MemoryError> {
        self.locate(id)?;
        let mut edges: Vec<crate::daemon::memory_types::Edge> = Vec::new();
        for home in self.all_homes()? {
            let mut stmt = home.conn().prepare("SELECT src_id,dst_id,relation,created_at FROM memory_edges WHERE src_id=?1 OR dst_id=?1")?;
            let rows = stmt.query_map(params![id], |r| {
                Ok(crate::daemon::memory_types::Edge {
                    src_id: r.get(0)?,
                    dst_id: r.get(1)?,
                    relation: r.get(2)?,
                    created_at: r.get(3)?,
                })
            })?;
            for edge in rows {
                let edge = edge?;
                if !edges.iter().any(|e| {
                    e.src_id == edge.src_id
                        && e.dst_id == edge.dst_id
                        && e.relation == edge.relation
                }) {
                    edges.push(edge);
                }
            }
        }
        Ok(edges)
    }
}
