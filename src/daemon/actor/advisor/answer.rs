//! Closing a consultation: the advisor's answer, or its failure, goes to the
//! waiting `ask_advisor` call and into the executor's chat.

use warpforge_protocol as wire;

use super::AdvisorAnswer;
use crate::daemon::actor::{Daemon, Event};

impl Daemon {
    /// An advisor's turn ended. Only the turn that answered the pending
    /// question closes it; its closing message is the advice.
    pub(crate) fn advisor_turn_ended(&mut self, task_id: &str, success: bool) {
        let Some(executor) = self.advisor_executor_of(task_id) else {
            return;
        };
        let answering = self
            .advisors
            .states
            .get(&executor)
            .and_then(|state| state.pending.as_ref())
            .is_some_and(|pending| pending.started);
        if !answering {
            return;
        }
        let text = self.collect_stage_text(task_id);
        let answer = [text.closing, text.full]
            .into_iter()
            .map(|text| text.trim().to_string())
            .find(|text| !text.is_empty());
        let result = match (success, answer) {
            (true, Some(answer)) => Ok(answer),
            (true, None) => Err("the advisor ended its turn without an answer".to_string()),
            (false, _) => Err("the advisor's agent stopped before answering".to_string()),
        };
        self.finish_consultation(&executor, result);
    }

    /// The advisor's session died; a pending consultation fails with it.
    pub(crate) fn advisor_session_failed(&mut self, task_id: &str, reason: &str) {
        let Some(executor) = self.advisor_executor_of(task_id) else {
            return;
        };
        if self
            .advisors
            .states
            .get(&executor)
            .is_some_and(|state| state.pending.is_some())
        {
            self.finish_consultation(&executor, Err(format!("the advisor failed: {reason}")));
        }
    }

    pub(super) fn finish_consultation(&mut self, executor: &str, result: Result<String, String>) {
        let Some(state) = self.advisors.states.get_mut(executor) else {
            return;
        };
        let Some(pending) = state.pending.take() else {
            return;
        };
        // The running total restarts with the session; a drop means a resume.
        let cost = match (pending.baseline_cost, state.running_cost) {
            (_, None) => None,
            (Some(before), Some(now)) if now >= before => Some(now - before),
            (_, now) => now,
        };
        let waiters: Vec<_> = state.waiters.drain(..).collect();
        let Some(task) = self.tasks.get_mut(executor) else {
            return;
        };
        let Some(advisor) = task.advisor.as_mut() else {
            return;
        };
        advisor.consultations += 1;
        if let Some(cost) = cost {
            let total = advisor.cost.as_ref().map_or(0.0, |c| c.amount) + cost;
            advisor.cost = Some(usd(total));
        }
        let answer = AdvisorAnswer {
            answer: result.clone(),
            agent: advisor.agent.clone(),
            model: advisor.model.clone(),
        };
        let advisor_task_id = advisor.task_id.clone().unwrap_or_default();
        let updated = task.clone();
        self.persist(&updated);
        self.emit(Event::TaskUpdated(updated));
        let (outcome, text) = match result {
            Ok(text) => (wire::AdvisorOutcome::Answered, text),
            Err(reason) => (wire::AdvisorOutcome::Failed, reason),
        };
        self.emit_session(
            executor,
            wire::SessionUpdate::AdvisorConsultation {
                question: pending.question,
                answer: text,
                outcome,
                agent: answer.agent.clone(),
                model: answer.model.clone(),
                advisor_task_id,
                cost: cost.map(usd),
            },
        );
        let mut delivered = false;
        for waiter in waiters {
            delivered |= waiter.send(answer.clone()).is_ok();
        }
        if !delivered {
            if let Some(state) = self.advisors.states.get_mut(executor) {
                state.unread = Some(answer);
            }
        }
    }
}

fn usd(amount: f64) -> wire::SessionUsageCost {
    wire::SessionUsageCost {
        amount,
        currency: "USD".into(),
    }
}
