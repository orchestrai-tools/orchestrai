//! The backlog runner's pure logic (ADR 0023): queue order, the verdicts that
//! hold an item back, and the text it hands to agents and GitHub. Side effects
//! live in `actor/runner/`.

mod brief;
mod gate;
mod location;
mod order;
#[cfg(test)]
mod tests;

pub(crate) use brief::{brief, commit_message, pr_body, pr_title, PrFacts};
pub(crate) use gate::{headroom_refusal, pipeline_agents, slot_refusal, Slots, DAY_SECS};
pub(crate) use location::resolve_location;
pub(crate) use order::{dispatch_order, next_position};

/// Tag on every pipeline task the runner starts.
pub(crate) const RUNNER_TAG: &str = "runner";

/// The last line of a runner pipeline's summary until its delivery reports;
/// then replaced by what the delivery did.
pub(crate) const DELIVERING_NOTE: &str =
    "The Factory is committing this change and opening a draft pull request.";
