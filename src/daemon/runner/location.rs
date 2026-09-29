use warpforge_protocol as wire;

use crate::workflow_config::WorkflowSpec;

/// Where an item runs: its own choice, else the project's, with `auto`
/// taking the project checkout for a workflow that verifies the running app.
/// @param project the project's run location setting
/// @param entry the item's own choice
/// @param spec the workflow the item runs through
/// @returns `worktree` or `checkout`, never `auto`
pub(crate) fn resolve_location(
    project: wire::RunLocation,
    entry: wire::EntryRunLocation,
    spec: &WorkflowSpec,
) -> wire::RunLocation {
    match (entry, project) {
        (wire::EntryRunLocation::Worktree, _) => wire::RunLocation::Worktree,
        (wire::EntryRunLocation::Checkout, _) => wire::RunLocation::Checkout,
        (wire::EntryRunLocation::Default, wire::RunLocation::Auto) if spec.verify.is_some() => {
            wire::RunLocation::Checkout
        }
        (wire::EntryRunLocation::Default, wire::RunLocation::Auto) => wire::RunLocation::Worktree,
        (wire::EntryRunLocation::Default, location) => location,
    }
}
