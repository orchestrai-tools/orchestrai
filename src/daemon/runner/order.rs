use warpforge_protocol as wire;

use crate::daemon::backlog::priority_rank;

/// Queued entries of `project` in the order they should start: backlog
/// priority, then manual position, then enqueue time.
/// @param entries every entry the runner holds
/// @param project the project to order
/// @returns the queued entries, first to start first
pub(crate) fn dispatch_order<'a>(
    entries: impl IntoIterator<Item = &'a wire::RunnerEntry>,
    project: &str,
) -> Vec<&'a wire::RunnerEntry> {
    let mut queued: Vec<&wire::RunnerEntry> = entries
        .into_iter()
        .filter(|e| e.project == project && e.state == wire::RunnerEntryState::Queued)
        .collect();
    queued.sort_by(|a, b| {
        priority_rank(&b.priority)
            .cmp(&priority_rank(&a.priority))
            .then(a.position.cmp(&b.position))
            .then(a.enqueued_at.cmp(&b.enqueued_at))
            .then(a.item_id.cmp(&b.item_id))
    });
    queued
}

/// The position after every entry of `project`, for a newly queued item.
/// @param entries every entry the runner holds
/// @param project the project the item is queued in
/// @returns one past the highest position in use
pub(crate) fn next_position<'a>(
    entries: impl IntoIterator<Item = &'a wire::RunnerEntry>,
    project: &str,
) -> u64 {
    entries
        .into_iter()
        .filter(|e| e.project == project)
        .map(|e| e.position + 1)
        .max()
        .unwrap_or(0)
}
