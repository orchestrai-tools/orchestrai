use super::*;
use std::collections::VecDeque;
use std::sync::Arc;

const PLATFORM_BROKEN: &str = "Missing optional dependency @openai/codex-darwin-arm64";
const MODULE_BROKEN: &str = "Error: Cannot find module '@openai/codex'";
const AUTH: &str = "agent rejected session/new: Authentication required [-32000]";

struct MockOps {
    plan: Option<InstallPlan>,
    runs: Mutex<VecDeque<(bool, String)>>,
    commands: Mutex<Vec<String>>,
    verifies: Mutex<VecDeque<Result<(), String>>>,
    gate: Option<(Arc<tokio::sync::Notify>, Arc<tokio::sync::Notify>)>,
}

impl MockOps {
    fn new(
        plan: Option<InstallPlan>,
        runs: Vec<(bool, String)>,
        verifies: Vec<Result<(), String>>,
    ) -> Self {
        Self {
            plan,
            runs: Mutex::new(runs.into()),
            commands: Mutex::new(Vec::new()),
            verifies: Mutex::new(verifies.into()),
            gate: None,
        }
    }

    fn commands(&self) -> Vec<String> {
        self.commands.lock().unwrap().clone()
    }
}

impl InstallOps for MockOps {
    async fn plan(&self, _id: &str, clean: bool) -> Option<InstallPlan> {
        let plan = self.plan.clone()?;
        if clean {
            return Some(InstallPlan {
                command: plan.clean_command.clone()?,
                clean_command: plan.clean_command,
            });
        }
        Some(plan)
    }

    async fn run(&self, command: &str, _limit: Duration) -> (bool, String) {
        self.commands.lock().unwrap().push(command.to_string());
        if let Some((started, release)) = &self.gate {
            started.notify_one();
            release.notified().await;
        }
        self.runs
            .lock()
            .unwrap()
            .pop_front()
            .unwrap_or((true, String::new()))
    }

    async fn verify(&self, _acp_command: &str, _cwd: &Path, _env: &AgentEnv) -> Result<(), String> {
        self.verifies.lock().unwrap().pop_front().unwrap_or(Ok(()))
    }
}

fn plan() -> Option<InstallPlan> {
    Some(InstallPlan {
        command: "npm install -g codex".to_string(),
        clean_command: Some("npm uninstall -g codex && npm install -g codex".to_string()),
    })
}

fn request<'a>(
    id: &'a str,
    clean: bool,
    is_default_command: bool,
    env: &'a AgentEnv,
) -> InstallRequest<'a> {
    InstallRequest {
        id,
        clean,
        acp_command: "codex-acp",
        is_default_command,
        cwd: Path::new("."),
        env,
    }
}

#[tokio::test]
async fn a_broken_install_is_repaired_once_and_verified() {
    let ops = MockOps::new(
        plan(),
        vec![(true, "installed".into())],
        vec![Err(PLATFORM_BROKEN.into()), Ok(())],
    );
    let env = AgentEnv::default();
    let out = install_agent_with(
        request("t-repair", false, true, &env),
        &ops,
        Duration::from_secs(600),
    )
    .await
    .unwrap();

    assert!(out.ok && out.verified && out.repaired);
    assert_eq!(out.verify_error, None);
    assert_eq!(
        ops.commands(),
        vec![
            "npm install -g codex",
            "npm uninstall -g codex && npm install -g codex"
        ]
    );
}

#[tokio::test]
async fn a_failed_repair_leaves_the_install_unverified_and_not_ok() {
    let ops = MockOps::new(
        plan(),
        vec![
            (true, "installed".into()),
            (false, "EACCES: permission denied".into()),
        ],
        vec![Err(PLATFORM_BROKEN.into())],
    );
    let env = AgentEnv::default();
    let out = install_agent_with(
        request("t-failed-repair", false, true, &env),
        &ops,
        Duration::from_secs(600),
    )
    .await
    .unwrap();

    assert!(!out.ok && !out.verified && out.repaired);
    assert!(
        out.output.contains("EACCES: permission denied"),
        "{}",
        out.output
    );
    assert_eq!(ops.commands().len(), 2);
}

#[tokio::test]
async fn an_auth_failure_never_triggers_a_repair() {
    let ops = MockOps::new(plan(), vec![(true, "ok".into())], vec![Err(AUTH.into())]);
    let env = AgentEnv::default();
    let out = install_agent_with(
        request("t-auth", false, true, &env),
        &ops,
        Duration::from_secs(600),
    )
    .await
    .unwrap();

    assert!(out.ok && !out.verified && !out.repaired);
    assert!(!out.broken_install);
    assert_eq!(ops.commands().len(), 1);
}

#[tokio::test]
async fn a_module_not_found_is_broken_but_never_auto_repaired() {
    let ops = MockOps::new(
        plan(),
        vec![(true, "ok".into())],
        vec![Err(MODULE_BROKEN.into())],
    );
    let env = AgentEnv::default();
    let out = install_agent_with(
        request("t-module", false, true, &env),
        &ops,
        Duration::from_secs(600),
    )
    .await
    .unwrap();

    assert!(out.ok && !out.verified && !out.repaired && out.broken_install);
    assert_eq!(ops.commands().len(), 1);
}

#[tokio::test]
async fn a_custom_command_is_never_auto_repaired() {
    let ops = MockOps::new(
        plan(),
        vec![(true, "ok".into())],
        vec![Err(PLATFORM_BROKEN.into())],
    );
    let env = AgentEnv::default();
    let out = install_agent_with(
        request("t-custom", false, false, &env),
        &ops,
        Duration::from_secs(600),
    )
    .await
    .unwrap();

    assert!(!out.repaired && out.broken_install);
    assert_eq!(ops.commands().len(), 1);
}

#[tokio::test]
async fn a_clean_install_does_not_repair_again() {
    let ops = MockOps::new(
        plan(),
        vec![(true, "ok".into())],
        vec![Err(PLATFORM_BROKEN.into())],
    );
    let env = AgentEnv::default();
    let out = install_agent_with(
        request("t-clean", true, true, &env),
        &ops,
        Duration::from_secs(600),
    )
    .await
    .unwrap();

    assert!(!out.verified && !out.repaired);
    assert_eq!(
        ops.commands(),
        vec!["npm uninstall -g codex && npm install -g codex"]
    );
}

#[tokio::test]
async fn an_exhausted_budget_skips_the_repair() {
    let ops = MockOps::new(
        plan(),
        vec![(true, "ok".into())],
        vec![Err(PLATFORM_BROKEN.into())],
    );
    let env = AgentEnv::default();
    let out = install_agent_with(request("t-budget", false, true, &env), &ops, Duration::ZERO)
        .await
        .unwrap();

    assert!(!out.repaired);
    assert!(out.output.contains("repair skipped"), "{}", out.output);
    assert_eq!(ops.commands().len(), 1);
}

#[tokio::test]
async fn an_unknown_agent_has_no_command() {
    let ops = MockOps::new(None, vec![], vec![]);
    let env = AgentEnv::default();
    let err = install_agent_with(
        request("t-unknown", false, true, &env),
        &ops,
        Duration::from_secs(60),
    )
    .await
    .unwrap_err();
    assert_eq!(err, InstallError::NoCommand);
}

#[tokio::test]
async fn a_second_install_for_the_same_agent_is_rejected() {
    let started = Arc::new(tokio::sync::Notify::new());
    let release = Arc::new(tokio::sync::Notify::new());
    let mut mock = MockOps::new(plan(), vec![(true, "ok".into())], vec![Ok(())]);
    mock.gate = Some((started.clone(), release.clone()));
    let ops = Arc::new(mock);

    let first = tokio::spawn({
        let ops = ops.clone();
        async move {
            let env = AgentEnv::default();
            install_agent_with(
                request("conflict-test", false, true, &env),
                &*ops,
                Duration::from_secs(60),
            )
            .await
        }
    });

    started.notified().await;
    let env = AgentEnv::default();
    let second = install_agent_with(
        request("conflict-test", false, true, &env),
        &*ops,
        Duration::from_secs(60),
    )
    .await;
    assert_eq!(second.unwrap_err(), InstallError::InFlight);

    release.notify_one();
    assert!(first.await.unwrap().is_ok());
}

#[test]
fn only_platform_binary_failures_are_auto_repaired() {
    assert!(auto_repairable(PLATFORM_BROKEN));
    assert!(!auto_repairable(MODULE_BROKEN));
    assert!(!auto_repairable(AUTH));
    assert!(should_repair(false, true, PLATFORM_BROKEN));
    assert!(!should_repair(true, true, PLATFORM_BROKEN));
    assert!(!should_repair(false, false, PLATFORM_BROKEN));
    assert!(!should_repair(false, true, MODULE_BROKEN));
}
