use std::time::Duration;

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::{json, Value};

#[cfg(test)]
pub(crate) mod fake;
mod published;
#[cfg(test)]
mod tests;

pub(crate) use published::PublishedDaemon;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);

/// Where the daemon listens, as published in `daemon.json`. A restarted daemon
/// publishes a new one: a new port and token, and always a new pid.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub(crate) struct Endpoint {
    pub(crate) url: String,
    #[serde(default)]
    pub(crate) token: String,
    #[serde(default)]
    pub(crate) pid: Option<u32>,
}

/// How the client finds and reaches the daemon.
#[async_trait]
pub(crate) trait Transport: Send {
    /// Read the endpoint the daemon publishes right now.
    /// @returns the current endpoint, or why there is none
    fn endpoint(&self) -> Result<Endpoint>;

    /// Open an authenticated connection.
    /// @param endpoint where to connect
    /// @returns the open connection
    async fn connect(&self, endpoint: &Endpoint) -> Result<Box<dyn Connection>>;
}

/// One open connection carrying JSON text frames.
#[async_trait]
pub(crate) trait Connection: Send {
    /// Send one frame.
    /// @param text the serialized frame
    async fn send(&mut self, text: String) -> Result<()>;

    /// Wait for the next text frame.
    /// @returns the frame, or `None` once the daemon closed the connection
    async fn recv(&mut self) -> Result<Option<String>>;
}

/// A minimal request/response client over the daemon WebSocket. Tool calls are
/// serialized (one stdin request at a time), so a simple send-then-read-until-
/// matching-id loop is sufficient — we never subscribe, so no event stream.
pub(crate) struct DaemonClient {
    transport: Box<dyn Transport>,
    open: Option<(Endpoint, Box<dyn Connection>)>,
    next_id: u64,
    connect_timeout: Duration,
    request_timeout: Duration,
}

impl DaemonClient {
    /// A client that connects on its first request.
    /// @param transport how to find and reach the daemon
    /// @returns the client, not yet connected
    pub(crate) fn new(transport: Box<dyn Transport>) -> Self {
        Self {
            transport,
            open: None,
            next_id: 1,
            connect_timeout: CONNECT_TIMEOUT,
            request_timeout: REQUEST_TIMEOUT,
        }
    }

    #[cfg(test)]
    pub(crate) fn with_timeouts(mut self, connect: Duration, request: Duration) -> Self {
        self.connect_timeout = connect;
        self.request_timeout = request;
        self
    }

    /// Send one request and wait for its reply.
    ///
    /// The endpoint is re-read first, so a daemon that restarted since the
    /// last call is dialed afresh instead of written to through a dead socket.
    /// @param method the daemon RPC method
    /// @param params the method's parameters
    /// @returns the reply's `result`, or the daemon's error or the transport's
    pub(crate) async fn request(&mut self, method: &str, params: Value) -> Result<Value> {
        let endpoint = self.transport.endpoint()?;
        // The connection is only put back after a complete exchange, so a
        // transport error, a timeout or a panic leaves the next call to redial.
        let connection = match self.open.take() {
            Some((open_at, connection)) if open_at == endpoint => connection,
            _ => self.connect(&endpoint).await?,
        };
        let id = self.next_id;
        self.next_id += 1;
        let (connection, reply) = tokio::time::timeout(
            self.request_timeout,
            exchange(connection, id, method, params),
        )
        .await
        .map_err(|_| {
            anyhow!(
                "the daemon did not answer {method} within {}s",
                self.request_timeout.as_secs_f32()
            )
        })??;
        self.open = Some((endpoint, connection));
        reply.map_err(|error| anyhow!("daemon error: {error}"))
    }

    async fn connect(&self, endpoint: &Endpoint) -> Result<Box<dyn Connection>> {
        tokio::time::timeout(self.connect_timeout, self.transport.connect(endpoint))
            .await
            .map_err(|_| {
                anyhow!(
                    "the daemon at {} did not accept a connection within {}s",
                    endpoint.url,
                    self.connect_timeout.as_secs_f32()
                )
            })?
    }
}

async fn exchange(
    mut connection: Box<dyn Connection>,
    id: u64,
    method: &str,
    params: Value,
) -> Result<(Box<dyn Connection>, Result<Value, Value>)> {
    let frame = json!({ "id": id, "method": method, "params": params });
    connection.send(frame.to_string()).await?;
    while let Some(text) = connection.recv().await? {
        let Ok(frame) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        if frame.get("id").and_then(Value::as_u64) != Some(id) {
            continue; // an event or a stale reply — ignore
        }
        let reply = match frame.get("error") {
            Some(error) => Err(error.clone()),
            None => Ok(frame.get("result").cloned().unwrap_or(Value::Null)),
        };
        return Ok((connection, reply));
    }
    Err(anyhow!("daemon connection ended before replying"))
}
