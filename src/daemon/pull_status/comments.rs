//! The review remarks on a task's pull request that nobody has settled yet,
//! read so the task's own agent can be told about them.

use anyhow::Result;
use warpforge_protocol as wire;

/// The pull request's conversation, narrowed to [`open_comments`].
#[cfg_attr(test, allow(dead_code))]
pub(super) async fn fetch(worktree: String, number: u64) -> Result<Vec<wire::PullComment>> {
    let thread = crate::daemon::tracker::github_pr_conversation(&worktree, number).await?;
    Ok(open_comments(thread))
}

/// Unresolved inline threads, and each reviewer's latest verdict when it
/// asked for changes. Conversation comments are left out: bots fill them with
/// previews and coverage reports, and none of it is addressed to the code.
pub(super) fn open_comments(thread: wire::PullThread) -> Vec<wire::PullComment> {
    let latest_review: std::collections::HashMap<String, String> = thread
        .comments
        .iter()
        .filter(|comment| comment.kind == "review" && comment.state != "COMMENTED")
        .map(|review| (reviewer(review), review.id.clone()))
        .collect();
    thread
        .comments
        .into_iter()
        .filter(|comment| !comment.body.trim().is_empty())
        .filter(|comment| match comment.kind.as_str() {
            "review_comment" => !comment.resolved,
            "review" => {
                comment.state == "CHANGES_REQUESTED"
                    && latest_review.get(&reviewer(comment)) == Some(&comment.id)
            }
            _ => false,
        })
        .collect()
}

fn reviewer(comment: &wire::PullComment) -> String {
    comment
        .author
        .as_ref()
        .map(|author| author.login.clone())
        .unwrap_or_default()
}
