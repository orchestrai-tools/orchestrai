use anyhow::{Context, Result};
use async_trait::async_trait;
use futures::{SinkExt, StreamExt};
use serde_json::json;
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

use super::{Connection, Endpoint, Transport};

/// The daemon as published in `~/.warpforge/daemon.json`, over its WebSocket.
pub(crate) struct PublishedDaemon;

#[async_trait]
impl Transport for PublishedDaemon {
    fn endpoint(&self) -> Result<Endpoint> {
        let path = dirs::home_dir()
            .unwrap_or_default()
            .join(".warpforge")
            .join("daemon.json");
        let raw = std::fs::read_to_string(&path)
            .with_context(|| format!("reading {} — is the daemon running?", path.display()))?;
        serde_json::from_str(&raw).with_context(|| format!("reading {}", path.display()))
    }

    async fn connect(&self, endpoint: &Endpoint) -> Result<Box<dyn Connection>> {
        let (mut ws, _) = tokio_tungstenite::connect_async(endpoint.url.as_str())
            .await
            .with_context(|| format!("connecting to daemon at {}", endpoint.url))?;
        if !endpoint.token.is_empty() {
            ws.send(Message::Text(json!({ "auth": endpoint.token }).to_string()))
                .await?;
        }
        Ok(Box::new(WsConnection(ws)))
    }
}

struct WsConnection(WebSocketStream<MaybeTlsStream<TcpStream>>);

#[async_trait]
impl Connection for WsConnection {
    async fn send(&mut self, text: String) -> Result<()> {
        Ok(self.0.send(Message::Text(text)).await?)
    }

    async fn recv(&mut self) -> Result<Option<String>> {
        while let Some(message) = self.0.next().await {
            match message? {
                Message::Text(text) => return Ok(Some(text)),
                Message::Ping(payload) => self.0.send(Message::Pong(payload)).await?,
                Message::Close(_) => return Ok(None),
                _ => {}
            }
        }
        Ok(None)
    }
}
