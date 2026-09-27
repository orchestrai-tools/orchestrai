use std::time::Duration;

use serde_json::json;

use super::fake::{endpoint, Answer, Dial, FakeDaemon};
use super::{DaemonClient, Endpoint};

fn client(daemon: &FakeDaemon) -> DaemonClient {
    DaemonClient::new(Box::new(daemon.clone()))
        .with_timeouts(Duration::from_millis(50), Duration::from_millis(50))
}

#[tokio::test]
async fn replies_are_matched_by_id_past_events_and_stale_replies() {
    let daemon = FakeDaemon::at("ws://a");
    let mut client = client(&daemon);

    let reply = client.request("runtime.list", json!({})).await.unwrap();
    assert_eq!(reply, json!({ "method": "runtime.list", "url": "ws://a" }));
    client.request("agents.list", json!({})).await.unwrap();
    assert_eq!(daemon.state().dials, ["ws://a"]);
}

#[tokio::test]
async fn a_restarted_daemon_is_dialed_before_the_next_request() {
    let daemon = FakeDaemon::at("ws://old");
    let mut client = client(&daemon);
    client.request("agents.list", json!({})).await.unwrap();

    daemon.state().endpoint = Some(endpoint("ws://new"));
    let reply = client.request("agents.list", json!({})).await.unwrap();

    assert_eq!(reply["url"], "ws://new");
    assert_eq!(daemon.state().dials, ["ws://old", "ws://new"]);
}

#[tokio::test]
async fn a_daemon_restarted_on_the_same_port_is_told_apart_by_its_pid() {
    let daemon = FakeDaemon::at("ws://127.0.0.1:61814");
    let mut client = client(&daemon);
    client.request("agents.list", json!({})).await.unwrap();

    daemon.state().endpoint = Some(Endpoint {
        pid: Some(2),
        ..endpoint("ws://127.0.0.1:61814")
    });
    client.request("agents.list", json!({})).await.unwrap();

    assert_eq!(daemon.state().dials.len(), 2);
}

#[tokio::test]
async fn a_second_daemon_does_not_take_the_session_from_a_live_one() {
    let daemon = FakeDaemon::at("ws://first");
    daemon.state().alive.push(1);
    let mut client = client(&daemon);
    client.request("agents.list", json!({})).await.unwrap();

    daemon.state().endpoint = Some(Endpoint {
        pid: Some(2),
        ..endpoint("ws://second")
    });
    let reply = client.request("agents.list", json!({})).await.unwrap();
    assert_eq!(reply["url"], "ws://first");

    daemon.state().alive.clear();
    let reply = client.request("agents.list", json!({})).await.unwrap();
    assert_eq!(reply["url"], "ws://second");
    assert_eq!(daemon.state().dials, ["ws://first", "ws://second"]);
}

#[tokio::test]
async fn a_dropped_connection_fails_one_call_and_the_next_one_redials() {
    let daemon = FakeDaemon::at("ws://a");
    daemon.state().answers.push_back(Answer::Close);
    let mut client = client(&daemon);

    let error = client.request("agents.list", json!({})).await.unwrap_err();
    assert!(
        error.to_string().contains("ended before replying"),
        "{error}"
    );
    client.request("agents.list", json!({})).await.unwrap();
    assert_eq!(daemon.state().dials, ["ws://a", "ws://a"]);
}

#[tokio::test]
async fn a_daemon_error_keeps_the_connection() {
    let daemon = FakeDaemon::at("ws://a");
    daemon.state().answers.push_back(Answer::Error);
    let mut client = client(&daemon);

    let error = client.request("task.create", json!({})).await.unwrap_err();
    assert!(error.to_string().contains("daemon error"), "{error}");
    client.request("agents.list", json!({})).await.unwrap();
    assert_eq!(daemon.state().dials, ["ws://a"]);
}

#[tokio::test]
async fn a_daemon_that_never_answers_times_out_and_the_next_call_redials() {
    let daemon = FakeDaemon::at("ws://a");
    daemon.state().answers.push_back(Answer::Silence);
    let mut client = client(&daemon);

    let error = client.request("agents.list", json!({})).await.unwrap_err();
    assert!(
        error.to_string().contains("did not answer agents.list"),
        "{error}"
    );
    client.request("agents.list", json!({})).await.unwrap();
    assert_eq!(daemon.state().dials, ["ws://a", "ws://a"]);
}

#[tokio::test]
async fn a_timed_out_spawn_says_it_may_still_complete() {
    let daemon = FakeDaemon::at("ws://a");
    daemon.state().answers.push_back(Answer::Silence);
    let mut client = client(&daemon);

    let error = client.request("task.create", json!({})).await.unwrap_err();
    let message = error.to_string();
    assert!(message.contains("may still complete"), "{message}");
    assert!(message.contains("list_agents"), "{message}");
}

#[tokio::test]
async fn a_daemon_that_never_accepts_times_out() {
    let daemon = FakeDaemon::at("ws://a");
    daemon.state().dial = Dial::Hang;
    let mut client = client(&daemon);

    let error = client.request("agents.list", json!({})).await.unwrap_err();
    assert!(
        error.to_string().contains("did not accept a connection"),
        "{error}"
    );
}

#[tokio::test]
async fn a_daemon_that_is_down_is_an_error_until_it_is_back() {
    let daemon = FakeDaemon::default();
    let mut client = client(&daemon);
    let error = client.request("agents.list", json!({})).await.unwrap_err();
    assert!(error.to_string().contains("daemon.json"), "{error}");

    daemon.state().endpoint = Some(endpoint("ws://a"));
    daemon.state().dial = Dial::Refuse;
    let error = client.request("agents.list", json!({})).await.unwrap_err();
    assert!(error.to_string().contains("refused"), "{error}");

    daemon.state().dial = Dial::Accept;
    client.request("agents.list", json!({})).await.unwrap();
}

#[cfg(unix)]
#[test]
fn a_running_daemon_is_alive_and_an_exited_one_is_not() {
    use super::{PublishedDaemon, Transport};

    assert!(PublishedDaemon.alive(std::process::id()));
    let mut child = std::process::Command::new("true").spawn().unwrap();
    let pid = child.id();
    child.wait().unwrap();
    assert!(!PublishedDaemon.alive(pid));
}
