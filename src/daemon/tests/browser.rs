use super::*;
use crate::daemon::browser::{self, Grants};
use crate::daemon::server::ClientHub;
use serde_json::json;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;
use warpforge_protocol as wire;

fn client_request(message: Message) -> (String, wire::ClientRequestBody) {
    let Message::Text(text) = message else {
        panic!("not text")
    };
    match serde_json::from_str(&text).unwrap() {
        wire::ServerMessage::Event(wire::Event::ClientRequest {
            request_id, body, ..
        }) => (request_id, body),
        other => panic!("not a client request: {other:?}"),
    }
}

fn reply(request_id: String, result: serde_json::Value) -> wire::Method {
    wire::Method::ClientReply {
        request_id,
        result: Some(result),
        error: None,
    }
}

/// An origin outside the project's services raises a prompt on the task's
/// chat; "always" lets the action run and keeps the origin for the task.
#[tokio::test]
async fn a_foreign_origin_is_asked_about_on_the_task_and_always_is_remembered() {
    let store = Store::open_at(std::path::Path::new(":memory:")).ok();
    let daemon = Daemon::spawn(test_projects(), store);
    let mut events = daemon.subscribe();
    let mock = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/mock-acp-agent-noedit.mjs"
    );
    let task_id = daemon
        .create_task(
            "demo",
            "look at the page",
            &format!("node {mock}"),
            vec![],
            false,
            false,
            None,
            vec![],
            None,
            std::collections::HashMap::new(),
            None,
        )
        .await;
    // The session is live once its first turn has run.
    for _ in 0..40 {
        match timeout(Duration::from_secs(5), events.recv()).await {
            Ok(Ok(Event::SessionUpdate {
                task_id: tid,
                update: wire::SessionUpdate::TurnEnded { .. },
            })) if tid == task_id => break,
            Ok(Ok(_)) => {}
            _ => panic!("the mock session never finished its turn"),
        }
    }

    let hub = ClientHub::default();
    let grants = Grants::default();
    let desktop = hub.connection();
    let (events_tx, mut requests) = mpsc::channel(8);
    let mut register = wire::Method::ClientRegister {
        capabilities: vec![wire::BROWSER_CAPABILITY.into()],
    };
    desktop.intercept(1, &mut register, &events_tx);

    let act = browser::act(
        &daemon,
        &hub,
        &grants,
        "demo",
        &task_id,
        wire::BrowserAction::Snapshot,
    );
    let desktop_and_user = async {
        let (first, _) = client_request(requests.recv().await.unwrap());
        desktop.intercept(
            2,
            &mut reply(first, json!({ "blocked": "https://example.com" })),
            &events_tx,
        );
        let request_id = loop {
            match timeout(Duration::from_secs(5), events.recv()).await {
                Ok(Ok(Event::SessionUpdate {
                    task_id: tid,
                    update: wire::SessionUpdate::PermissionRequest { request_id, .. },
                })) if tid == task_id => break request_id,
                Ok(Ok(_)) => {}
                _ => panic!("no approval prompt on the task"),
            }
        };
        daemon
            .session_permission(&task_id, &request_id, "allow_always")
            .await
            .expect("the answer wins");
        let (second, body) = client_request(requests.recv().await.unwrap());
        let wire::ClientRequestBody::Browser {
            allowed_origins, ..
        } = body;
        assert!(allowed_origins.contains(&"https://example.com".to_string()));
        desktop.intercept(
            3,
            &mut reply(
                second,
                json!({ "url": "https://example.com/", "tree": "- link \"x\" [e1]" }),
            ),
            &events_tx,
        );
    };
    let (result, ()) = tokio::join!(act, desktop_and_user);
    assert_eq!(result.unwrap()["tree"], "- link \"x\" [e1]");
    assert_eq!(grants.of(&task_id), vec!["https://example.com".to_string()]);
}

#[tokio::test]
async fn without_a_task_a_foreign_origin_is_refused_and_no_desktop_is_an_error() {
    let store = Store::open_at(std::path::Path::new(":memory:")).ok();
    let daemon = Daemon::spawn(test_projects(), store);
    let hub = ClientHub::default();
    let grants = Grants::default();

    let navigate = wire::BrowserAction::Navigate {
        url: "https://example.com".into(),
    };
    let refused = browser::act(&daemon, &hub, &grants, "demo", "", navigate).await;
    assert!(refused.unwrap_err().contains("no Warpforge task"));

    let nobody = browser::act(
        &daemon,
        &hub,
        &grants,
        "demo",
        "",
        wire::BrowserAction::Console,
    )
    .await;
    assert!(nobody.unwrap_err().contains("no Warpforge desktop app"));

    let unknown = browser::act(
        &daemon,
        &hub,
        &grants,
        "nope",
        "",
        wire::BrowserAction::Console,
    )
    .await;
    assert!(unknown.unwrap_err().contains("no project named"));
}
