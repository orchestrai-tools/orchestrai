use rusqlite::{params, Connection};

use super::helpers::content_of;
use super::MemoryStore;
use crate::daemon::memory_types::MemoryError;

/// The database a memory lives in: the main one, or a project overlay opened
/// for the duration of one operation.
pub(super) enum Home<'a> {
    Main(&'a Connection),
    Overlay(Connection),
}

impl Home<'_> {
    pub(super) fn conn(&self) -> &Connection {
        match self {
            Home::Main(conn) => conn,
            Home::Overlay(conn) => conn,
        }
    }
}

impl MemoryStore {
    /// Find the database holding `id`: the main one first, then each project
    /// overlay. Overlays are skipped when project memory is disabled.
    pub(super) fn locate(&self, id: &str) -> Result<Home<'_>, MemoryError> {
        let main = self.guard()?;
        if content_of(main, id)?.is_some() {
            return Ok(Home::Main(main));
        }
        if self.config.project {
            for path in self.project_dbs() {
                let conn = Self::open_project_at(&path, self.config.embeddings_enabled())?;
                if content_of(&conn, id)?.is_some() {
                    return Ok(Home::Overlay(conn));
                }
            }
        }
        Err(MemoryError::Other(anyhow::anyhow!(
            "memory '{id}' not found"
        )))
    }

    /// Every database that can hold edges, main first.
    pub(super) fn all_homes(&self) -> Result<Vec<Home<'_>>, MemoryError> {
        let mut homes = vec![Home::Main(self.guard()?)];
        if self.config.project {
            for path in self.project_dbs() {
                let conn = Self::open_project_at(&path, self.config.embeddings_enabled())?;
                homes.push(Home::Overlay(conn));
            }
        }
        Ok(homes)
    }

    /// Remove every edge touching `id`, in whichever database stores it.
    pub(super) fn purge_edges(&self, id: &str) -> Result<(), MemoryError> {
        for home in self.all_homes()? {
            home.conn().execute(
                "DELETE FROM memory_edges WHERE src_id = ?1 OR dst_id = ?1",
                params![id],
            )?;
        }
        Ok(())
    }
}
