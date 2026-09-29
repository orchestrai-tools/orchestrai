use std::sync::atomic::{AtomicUsize, Ordering};

use super::super::port_watch::{
    announced_port, assess, spawn_port_watch, PortWarning, WatchTiming,
};
use super::*;

fn warning(expected: u16, announced: Option<u16>) -> Option<PortWarning> {
    Some(PortWarning {
        expected,
        announced,
    })
}

#[test]
fn announced_port_reads_dev_server_banners() {
    let cases = [
        ("  ➜  Local:   http://localhost:5173/", Some(5173)),
        ("[astro] 🚀 astro  v5.0.0 started in 20ms\n", None),
        ("┃ Local    http://localhost:4321/", Some(4321)),
        ("   - Local:        http://localhost:3000", Some(3000)),
        ("* Listening on http://127.0.0.1:3000", Some(3000)),
        ("* Listening on tcp://0.0.0.0:3001", Some(3001)),
        ("Listening on [::1]:8080", Some(8080)),
        ("no url here", None),
        ("localhost: nothing", None),
    ];
    for (line, expected) in cases {
        assert_eq!(announced_port(line), expected, "{line}");
    }
}

#[test]
fn announced_port_ignores_ansi_codes() {
    let line = "\u{1b}[32m  ➜\u{1b}[39m  \u{1b}[1mLocal\u{1b}[22m:   http://localhost:\u{1b}[1m5173\u{1b}[22m/";
    assert_eq!(announced_port(line), Some(5173));
    assert_eq!(
        announced_port("\u{1b}[1mhttp://localhost:4321\u{1b}[0m"),
        Some(4321)
    );
}

#[test]
fn an_answering_port_clears_the_warning() {
    let previous = warning(4400, Some(4321));
    assert_eq!(
        assess(4400, true, true, previous.as_ref(), [].into_iter()),
        None
    );
}

#[test]
fn a_silent_port_of_a_running_service_warns_with_the_announced_port() {
    let lines = ["booting", "Local: http://localhost:4321/", "idle"];
    assert_eq!(
        assess(4400, false, true, None, lines.into_iter()),
        warning(4400, Some(4321))
    );
}

#[test]
fn the_newest_announcement_other_than_the_expected_port_wins() {
    let lines = [
        "http://localhost:3000",
        "http://localhost:4321",
        "http://localhost:4400",
    ];
    assert_eq!(
        assess(4400, false, true, None, lines.into_iter()),
        warning(4400, Some(4321))
    );
}

#[test]
fn a_starting_service_with_nothing_announced_stays_quiet() {
    assert_eq!(
        assess(4400, false, false, None, ["compiling"].into_iter()),
        None
    );
    assert_eq!(
        assess(
            4400,
            false,
            false,
            None,
            ["http://localhost:4321"].into_iter()
        ),
        warning(4400, Some(4321))
    );
}

#[test]
fn a_running_service_without_an_announcement_warns_without_a_port() {
    assert_eq!(
        assess(4400, false, true, None, ["ready"].into_iter()),
        warning(4400, None)
    );
}

#[test]
fn an_earlier_announcement_survives_a_trimmed_log() {
    let previous = warning(4400, Some(4321));
    assert_eq!(
        assess(4400, false, true, previous.as_ref(), ["noise"].into_iter()),
        warning(4400, Some(4321))
    );
}

fn running(mgr: &mut ServiceManager, from_seq: u64) {
    let svc = mgr.services.get_mut("p/web").unwrap();
    svc.status = ServiceStatus::Running;
    svc.allocated_port = 4400;
    svc.push_log("old run: http://localhost:3000".into());
    svc.push_log("Local: http://localhost:4321/".into());
    assert!(svc.next_seq > from_seq);
}

fn probe(run_id: u64, answered: bool, from_seq: u64) -> ServiceEvent {
    ServiceEvent::PortProbe {
        key: "p/web".into(),
        run_id,
        answered,
        from_seq,
    }
}

#[test]
fn probe_results_set_and_clear_the_warning_for_the_current_run() {
    let (tx, _rx) = mpsc::unbounded_channel();
    let mut mgr = ServiceManager::new(tx);
    readiness_seed(&mut mgr);
    running(&mut mgr, 1);

    mgr.apply_event(probe(7, false, 1));
    assert_eq!(
        mgr.get("p", "web").unwrap().port_warning,
        warning(4400, Some(4321))
    );

    mgr.apply_event(probe(8, true, 1));
    assert_eq!(
        mgr.get("p", "web").unwrap().port_warning,
        warning(4400, Some(4321))
    );

    mgr.apply_event(probe(7, true, 1));
    assert_eq!(mgr.get("p", "web").unwrap().port_warning, None);
}

#[test]
fn lines_from_an_earlier_run_are_not_announcements() {
    let (tx, _rx) = mpsc::unbounded_channel();
    let mut mgr = ServiceManager::new(tx);
    readiness_seed(&mut mgr);
    running(&mut mgr, 1);

    mgr.apply_event(probe(7, false, 1));
    let warning = mgr.get("p", "web").unwrap().port_warning.clone();
    assert_eq!(warning.and_then(|w| w.announced), Some(4321));
    mgr.get_mut("p", "web").unwrap().port_warning = None;
    mgr.apply_event(probe(7, false, 2));
    let warning = mgr.get("p", "web").unwrap().port_warning.clone();
    assert_eq!(warning.unwrap().announced, None);
}

#[test]
fn an_exited_run_drops_its_warning() {
    let (tx, _rx) = mpsc::unbounded_channel();
    let mut mgr = ServiceManager::new(tx);
    readiness_seed(&mut mgr);
    running(&mut mgr, 1);
    mgr.apply_event(probe(7, false, 1));

    mgr.apply_event(ServiceEvent::StatusChange {
        key: "p/web".into(),
        run_id: 7,
        status: ServiceStatus::Failed,
        exit_code: Some(1),
    });
    assert_eq!(mgr.get("p", "web").unwrap().port_warning, None);
    mgr.apply_event(probe(7, false, 1));
    assert_eq!(mgr.get("p", "web").unwrap().port_warning, None);
}

#[tokio::test]
async fn an_unresolved_port_reference_in_the_command_fails_the_start() {
    bounded(async {
        let (tx, _rx) = mpsc::unbounded_channel();
        let mut mgr = ServiceManager::new(tx);
        mgr.start(
            "p",
            ".",
            (4000, 4099),
            ports::PortPin::Auto,
            "web",
            "echo --port ${api.port}",
            0,
            None,
            &Readiness::default(),
            None,
        )
        .await
        .unwrap();

        let svc = mgr.get("p", "web").unwrap();
        assert_eq!(svc.status, ServiceStatus::Failed);
        assert!(logs_of(&mgr)
            .iter()
            .any(|l| l.contains("command references ${api.port}")));
    })
    .await
}

/// Needs to bind a port from the range, which a sandbox may forbid.
#[tokio::test]
async fn a_command_receives_the_interpolated_port() {
    bounded(async {
        let (tx, mut rx) = mpsc::unbounded_channel();
        let mut mgr = ServiceManager::new(tx);
        mgr.start(
            "p",
            ".",
            (4000, 4099),
            ports::PortPin::Auto,
            "web",
            "echo port=${web.port}",
            3000,
            None,
            &Readiness::default(),
            None,
        )
        .await
        .unwrap();
        let port = mgr.get("p", "web").unwrap().allocated_port;
        assert!(port > 0);

        let wanted = format!("port={port}");
        while let Ok(Some(ev)) = timeout(Duration::from_secs(5), rx.recv()).await {
            if let ServiceEvent::Log { line, .. } = &ev {
                if *line == wanted {
                    return;
                }
            }
        }
        panic!("expected the command to print {wanted}");
    })
    .await
}

const FAST: WatchTiming = WatchTiming {
    grace: Duration::from_millis(1),
    interval: Duration::from_millis(5),
};

/// Watch `p/web` with a probe that never answers; returns its call count.
fn watch(
    mgr: &mut ServiceManager,
    tx: mpsc::UnboundedSender<ServiceEvent>,
    timing: WatchTiming,
) -> Arc<AtomicUsize> {
    let probes = Arc::new(AtomicUsize::new(0));
    let counter = Arc::clone(&probes);
    let svc = mgr.services.get_mut("p/web").unwrap();
    let run = RunHandle::new(tx, "p/web".into(), svc.run_id, Arc::clone(&svc.stopping));
    let probe = move |_| {
        counter.fetch_add(1, Ordering::SeqCst);
        std::future::ready(false)
    };
    svc.port_watch = Some(spawn_port_watch(run, svc.allocated_port, 0, timing, probe));
    probes
}

async fn probing_stopped(probes: &AtomicUsize) -> bool {
    let before = probes.load(Ordering::SeqCst);
    tokio::time::sleep(Duration::from_millis(50)).await;
    probes.load(Ordering::SeqCst) == before
}

#[tokio::test]
async fn stop_returns_promptly_and_ends_an_active_probe_loop() {
    bounded(async {
        let (tx, mut rx) = mpsc::unbounded_channel();
        let mut mgr = ServiceManager::new(tx.clone());
        readiness_seed(&mut mgr);
        running(&mut mgr, 0);
        let probes = watch(&mut mgr, tx, FAST);

        for _ in 0..3 {
            let event = rx.recv().await.unwrap();
            mgr.apply_event(event);
        }
        assert_eq!(
            mgr.get("p", "web").unwrap().port_warning,
            warning(4400, Some(4321))
        );
        assert_eq!(logs_of(&mgr).len(), 2, "the entry stays readable");

        timeout(Duration::from_secs(1), mgr.stop("p", "web"))
            .await
            .expect("stop must not wait on the watcher")
            .unwrap();
        assert!(
            probing_stopped(&probes).await,
            "probing continued after stop"
        );
        assert_eq!(mgr.get("p", "web").unwrap().port_warning, None);
    })
    .await
}

#[tokio::test]
async fn an_exited_run_ends_its_watcher_without_a_stop() {
    bounded(async {
        let (tx, mut rx) = mpsc::unbounded_channel();
        let mut mgr = ServiceManager::new(tx.clone());
        readiness_seed(&mut mgr);
        running(&mut mgr, 0);
        let probes = watch(&mut mgr, tx, FAST);
        let event = rx.recv().await.unwrap();
        mgr.apply_event(event);

        mgr.apply_event(ServiceEvent::StatusChange {
            key: "p/web".into(),
            run_id: 7,
            status: ServiceStatus::Failed,
            exit_code: Some(1),
        });
        assert!(
            probing_stopped(&probes).await,
            "probing continued after exit"
        );
    })
    .await
}

#[tokio::test]
async fn shutdown_does_not_wait_out_a_watcher_grace_period() {
    bounded(async {
        let (tx, mut rx) = mpsc::unbounded_channel();
        let mut mgr = ServiceManager::new(tx.clone());
        readiness_seed(&mut mgr);
        running(&mut mgr, 0);
        let idle = WatchTiming {
            grace: Duration::from_secs(3600),
            interval: Duration::from_secs(3600),
        };
        let probes = watch(&mut mgr, tx, idle);

        timeout(Duration::from_secs(1), mgr.stop_all())
            .await
            .expect("shutdown must not wait on the watcher")
            .unwrap();
        drop(mgr);
        // The watcher holds the last sender, so the channel closes only once it is gone.
        let closed = timeout(Duration::from_secs(1), rx.recv()).await;
        assert!(matches!(closed, Ok(None)), "the watcher outlived shutdown");
        assert_eq!(probes.load(Ordering::SeqCst), 0);
    })
    .await
}

fn logs_of(mgr: &ServiceManager) -> Vec<String> {
    mgr.log_window("p", "web", 0, None).0
}

fn readiness_seed(mgr: &mut ServiceManager) {
    mgr.services.insert(
        "p/web".to_string(),
        ManagedService {
            name: "web".into(),
            project_name: "p".into(),
            command: "dev".into(),
            status: ServiceStatus::Starting,
            logs: Vec::new(),
            next_seq: 0,
            original_port: 0,
            allocated_port: 0,
            port_pinned: false,
            port_warning: None,
            pgid: None,
            alive: true,
            run_id: 7,
            waiting_on: Vec::new(),
            stopping: Arc::new(AtomicBool::new(false)),
            port_watch: None,
        },
    );
}
