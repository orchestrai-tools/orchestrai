//! The Origin check runs on the real handshake.

use super::*;
use crate::daemon::{Daemon, Store};
use std::net::SocketAddr;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::{header::ORIGIN, HeaderValue, StatusCode};
use tokio_tungstenite::tungstenite::Error as WsError;

async fn connect(addr: SocketAddr, origin: Option<&str>) -> Result<(), WsError> {
    let mut request = format!("ws://{addr}").into_client_request().unwrap();
    if let Some(origin) = origin {
        request
            .headers_mut()
            .insert(ORIGIN, HeaderValue::from_str(origin).unwrap());
    }
    tokio_tungstenite::connect_async(request).await.map(|_| ())
}

#[tokio::test]
async fn a_web_page_is_refused_at_the_handshake() {
    let store = Store::open_at(std::path::Path::new(":memory:")).ok();
    let handle = Daemon::spawn(Vec::new(), store);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(run(listener, handle, String::new()));

    match connect(addr, Some("https://evil.example")).await {
        Err(WsError::Http(response)) => assert_eq!(response.status(), StatusCode::FORBIDDEN),
        other => panic!("expected a 403, got {other:?}"),
    }
    connect(addr, None).await.expect("a non-browser client");
    connect(addr, Some("tauri://localhost"))
        .await
        .expect("the packaged app");
}
