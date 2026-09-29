//! Whether new agent work may start on an account, judged from the last quota
//! snapshot. Only a known-exhausted account is refused: a throttled poll, a
//! missing snapshot or a window that has already reset all allow the run.

use warpforge_protocol::{AgentAccountLimits, AgentLimitWindow};

use crate::daemon::accounts::SpawnAccount;

/// Windows that cap one model family, not the account: a run on another model
/// still works while one of these is full.
pub(crate) const MODEL_SCOPED_WINDOWS: &[&str] = &["seven_day_opus", "seven_day_sonnet"];

/// Why a new run of `agent_id` on `account` must not start, or `None` when it may.
///
/// @param limits the daemon's current quota snapshot, one row per account
/// @param agent_id registry id of the agent about to run
/// @param account which account the run would start on
/// @param now current unix time in seconds
/// @returns a user-facing refusal reason, or `None` to allow the run
pub fn refusal(
    limits: &[AgentAccountLimits],
    agent_id: &str,
    account: SpawnAccount<'_>,
    now: i64,
) -> Option<String> {
    let row = match account {
        SpawnAccount::Pinned(id) => limits
            .iter()
            .find(|row| row.account_id == id && row.agent_id == agent_id),
        SpawnAccount::Active => limits
            .iter()
            .find(|row| row.agent_id == agent_id && row.active),
        SpawnAccount::SharedHome => None,
    }?;
    let (windows, until) = exhausted_until(row, now)?;
    let names = windows
        .iter()
        .map(|w| w.label.as_str())
        .collect::<Vec<_>>()
        .join(", ");
    let limit = if names.is_empty() {
        String::new()
    } else {
        format!(" ({names} limit reached)")
    };
    let when = match until {
        Some(at) => format!("until {}", format_time(at)),
        None => "and its reset time is unknown".to_string(),
    };
    Some(format!(
        "{agent_id} account \"{}\" is out of quota{limit} {when}",
        row.label
    ))
}

/// The windows keeping an account exhausted and when the last of them resets.
fn exhausted_until(
    row: &AgentAccountLimits,
    now: i64,
) -> Option<(Vec<&AgentLimitWindow>, Option<i64>)> {
    let still_closed = |w: &&AgentLimitWindow| w.resets_at.is_none_or(|at| at > now);
    let full: Vec<&AgentLimitWindow> = row
        .windows
        .iter()
        .filter(|w| w.used_percent >= 100.0)
        .collect();
    if !full.is_empty() {
        let blocking: Vec<&AgentLimitWindow> = full
            .into_iter()
            .filter(|w| !MODEL_SCOPED_WINDOWS.contains(&w.id.as_str()))
            .filter(still_closed)
            .collect();
        if blocking.is_empty() {
            return None;
        }
        let until = blocking
            .iter()
            .map(|w| w.resets_at)
            .collect::<Option<Vec<i64>>>()
            .and_then(|resets| resets.into_iter().max());
        return Some((blocking, until));
    }
    if !row.exhausted {
        return None;
    }
    // The provider flagged the account without a full window: no window says
    // which limit tripped, so the earliest pending reset is the best estimate.
    let pending = row
        .windows
        .iter()
        .filter_map(|w| w.resets_at)
        .filter(|at| *at > now)
        .min();
    if pending.is_none() && row.windows.iter().any(|w| w.resets_at.is_some()) {
        return None;
    }
    Some((Vec::new(), pending))
}

fn format_time(at: i64) -> String {
    match chrono::DateTime::from_timestamp(at, 0) {
        Some(utc) => utc
            .with_timezone(&chrono::Local)
            .format("%Y-%m-%d %H:%M")
            .to_string(),
        None => at.to_string(),
    }
}

/// An active account of `agent_id` whose session window is full for an hour.
#[cfg(test)]
pub(crate) fn exhausted_row(agent_id: &str) -> AgentAccountLimits {
    let now = chrono::Utc::now().timestamp();
    AgentAccountLimits {
        account_id: format!("{agent_id}:work"),
        agent_id: agent_id.into(),
        label: "Work".into(),
        active: true,
        plan: None,
        windows: vec![AgentLimitWindow {
            id: "five_hour".into(),
            label: "Session".into(),
            used_percent: 100.0,
            resets_at: Some(now + 3600),
            window_minutes: Some(300),
        }],
        exhausted: true,
        fetched_at: now,
        source: "api".into(),
        error: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const NOW: i64 = 1_800_000_000;

    fn window(id: &str, used: f64, resets_at: Option<i64>) -> AgentLimitWindow {
        AgentLimitWindow {
            id: id.into(),
            label: id.into(),
            used_percent: used,
            resets_at,
            window_minutes: None,
        }
    }

    fn row(
        account_id: &str,
        active: bool,
        exhausted: bool,
        windows: Vec<AgentLimitWindow>,
    ) -> AgentAccountLimits {
        AgentAccountLimits {
            account_id: account_id.into(),
            agent_id: "claude".into(),
            label: "Work".into(),
            active,
            plan: None,
            windows,
            exhausted,
            fetched_at: NOW - 60,
            source: "api".into(),
            error: None,
        }
    }

    fn full_now() -> AgentAccountLimits {
        row(
            "claude:work",
            true,
            true,
            vec![window("five_hour", 100.0, Some(NOW + 3600))],
        )
    }

    #[test]
    fn a_full_window_that_has_not_reset_refuses_with_account_and_window() {
        let reason = refusal(&[full_now()], "claude", SpawnAccount::Active, NOW).unwrap();
        assert!(reason.contains("\"Work\""), "{reason}");
        assert!(reason.contains("five_hour limit reached"), "{reason}");
        assert!(reason.contains("until "), "{reason}");
    }

    #[test]
    fn a_window_whose_reset_has_passed_allows() {
        let mut stale = full_now();
        stale.windows[0].resets_at = Some(NOW - 1);
        assert_eq!(refusal(&[stale], "claude", SpawnAccount::Active, NOW), None);
    }

    #[test]
    fn a_throttled_row_with_no_numbers_allows() {
        let throttled = crate::daemon::limits::shared::throttled_account(
            "claude",
            "claude:work",
            "Work",
            true,
            NOW,
        );
        assert_eq!(
            refusal(&[throttled], "claude", SpawnAccount::Active, NOW),
            None
        );
    }

    #[test]
    fn a_partly_used_account_allows() {
        let busy = row(
            "claude:work",
            true,
            false,
            vec![window("five_hour", 99.0, Some(NOW + 60))],
        );
        assert_eq!(refusal(&[busy], "claude", SpawnAccount::Active, NOW), None);
    }

    #[test]
    fn a_full_model_scoped_window_does_not_block_the_account() {
        let opus = row(
            "claude:work",
            true,
            true,
            vec![
                window("five_hour", 20.0, Some(NOW + 60)),
                window("seven_day_opus", 100.0, Some(NOW + 86_400)),
            ],
        );
        assert_eq!(refusal(&[opus], "claude", SpawnAccount::Active, NOW), None);
    }

    #[test]
    fn only_the_account_the_run_starts_on_is_judged() {
        let mut spare = row("claude:spare", true, false, Vec::new());
        spare.label = "Spare".into();
        let mut exhausted = full_now();
        exhausted.active = false;
        let limits = [exhausted, spare];
        assert_eq!(refusal(&limits, "claude", SpawnAccount::Active, NOW), None);
        assert!(refusal(&limits, "claude", SpawnAccount::Pinned("claude:work"), NOW).is_some());
        assert_eq!(
            refusal(&limits, "claude", SpawnAccount::SharedHome, NOW),
            None
        );
        assert_eq!(
            refusal(&limits, "codex", SpawnAccount::Pinned("claude:work"), NOW),
            None
        );
    }

    #[test]
    fn a_provider_flag_without_a_full_window_refuses_until_the_next_reset() {
        let flagged = row(
            "claude:work",
            true,
            true,
            vec![
                window("primary", 60.0, Some(NOW + 7200)),
                window("secondary", 90.0, Some(NOW + 600)),
            ],
        );
        let reason = refusal(
            std::slice::from_ref(&flagged),
            "claude",
            SpawnAccount::Active,
            NOW,
        )
        .unwrap();
        assert!(reason.contains(&format_time(NOW + 600)), "{reason}");

        let mut reset = flagged;
        for w in &mut reset.windows {
            w.resets_at = Some(NOW - 1);
        }
        assert_eq!(refusal(&[reset], "claude", SpawnAccount::Active, NOW), None);
    }
}
