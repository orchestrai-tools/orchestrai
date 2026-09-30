//! The Factory's pure logic (ADR 0023): queue order, the waits that hold a
//! task back, and the text it hands to agents and GitHub. Side effects
//! live in `actor/runner/`.

mod brief;
mod gate;
mod lead;
mod location;
mod order;
#[cfg(test)]
mod tests;

pub(crate) use brief::{
    brief_body, commit_message, pr_body, pr_title, strip_preamble, with_preamble, PrFacts,
};
pub(crate) use gate::{headroom_refusal, pipeline_agents, slot_refusal, Slots, DAY_SECS};
pub(crate) use lead::resolve_lead;
pub(crate) use location::resolve_location;
pub(crate) use order::{dispatch_order, next_position};

/// Tag on every Factory task the daemon schedules.
pub(crate) const RUNNER_TAG: &str = "runner";

/// The last line of a runner pipeline's summary until its delivery reports;
/// then replaced by what the delivery did.
pub(crate) const DELIVERING_NOTE: &str =
    "The Factory is committing this change and opening a draft pull request.";
