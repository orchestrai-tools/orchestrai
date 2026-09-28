use crate::daemon::acp::PolicyCheck;
use crate::daemon::actor::Daemon;

impl Daemon {
    /// Handle a policy check request from an ACP reader task.
    pub(crate) async fn handle_policy_check(&mut self, check: PolicyCheck) {
        let result = self.policies.evaluate_all(&check.ctx).await;
        let _ = check.reply.send(result);
    }
}
