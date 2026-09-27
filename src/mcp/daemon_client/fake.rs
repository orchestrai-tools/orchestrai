//! A scripted stand-in for the daemon: restarts, drops, errors and silence on
//! demand, without a socket.

use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use anyhow::{anyhow, Result};
use async_trait::async_trait;
use serde_json::{json, Value};

use super::{Connection, Endpoint, Transport};

/// How a dial is answered.
#[derive(Clone, Copy, Default)]
pub(crate) enum Dial {
    #[default]
    Accept,
    Refuse,
    Hang,
}

/// How the next request on a connection is answered.
#[derive(Clone, Copy)]
pub(crate) enum Answer {
    /// `{"id", "result": {"method", "url"}}`, after an event and a stale reply.
    Reply,
    Error,
    Close,
    Silence,
}

#[derive(Default)]
pub(crate) struct State {
    /// What `daemon.json` holds; `None` when there is no file.
    pub(crate) endpoint: Option<Endpoint>,
    pub(crate) dial: Dial,
    /// Answers for the coming requests, front first; `Reply` once empty.
    pub(crate) answers: VecDeque<Answer>,
    pub(crate) panic_on_endpoint: bool,
    pub(crate) dials: Vec<String>,
}

#[derive(Clone, Default)]
pub(crate) struct FakeDaemon(pub(crate) Arc<Mutex<State>>);

pub(crate) fn endpoint(url: &str) -> Endpoint {
    Endpoint {
        url: url.to_string(),
        token: "token".to_string(),
        pid: Some(1),
    }
}

impl FakeDaemon {
    pub(crate) fn at(url: &str) -> Self {
        let daemon = Self::default();
        daemon.state().endpoint = Some(endpoint(url));
        daemon
    }

    pub(crate) fn state(&self) -> std::sync::MutexGuard<'_, State> {
        self.0.lock().unwrap()
    }
}

#[async_trait]
impl Transport for FakeDaemon {
    fn endpoint(&self) -> Result<Endpoint> {
        let (panic, endpoint) = {
            let state = self.state();
            (state.panic_on_endpoint, state.endpoint.clone())
        };
        assert!(!panic, "scripted panic");
        endpoint.ok_or_else(|| anyhow!("reading daemon.json — is the daemon running?"))
    }

    async fn connect(&self, endpoint: &Endpoint) -> Result<Box<dyn Connection>> {
        let dial = {
            let mut state = self.state();
            state.dials.push(endpoint.url.clone());
            state.dial
        };
        match dial {
            Dial::Accept => Ok(Box::new(FakeConnection {
                daemon: self.clone(),
                url: endpoint.url.clone(),
                inbox: VecDeque::new(),
                closed: false,
                silent: false,
            })),
            Dial::Refuse => Err(anyhow!("connecting to daemon at {}: refused", endpoint.url)),
            Dial::Hang => std::future::pending().await,
        }
    }
}

struct FakeConnection {
    daemon: FakeDaemon,
    url: String,
    inbox: VecDeque<String>,
    closed: bool,
    silent: bool,
}

#[async_trait]
impl Connection for FakeConnection {
    async fn send(&mut self, text: String) -> Result<()> {
        if self.closed {
            return Err(anyhow!("broken pipe"));
        }
        let frame: Value = serde_json::from_str(&text)?;
        let id = frame["id"].clone();
        let answer = self.daemon.state().answers.pop_front();
        match answer.unwrap_or(Answer::Reply) {
            Answer::Reply => {
                self.inbox
                    .push_back(json!({ "event": "task.updated" }).to_string());
                self.inbox
                    .push_back(json!({ "id": 0, "result": "stale" }).to_string());
                let result = json!({ "method": frame["method"], "url": self.url });
                self.inbox
                    .push_back(json!({ "id": id, "result": result }).to_string());
            }
            Answer::Error => self
                .inbox
                .push_back(json!({ "id": id, "error": { "message": "boom" } }).to_string()),
            Answer::Close => self.closed = true,
            Answer::Silence => self.silent = true,
        }
        Ok(())
    }

    async fn recv(&mut self) -> Result<Option<String>> {
        if let Some(frame) = self.inbox.pop_front() {
            return Ok(Some(frame));
        }
        if self.silent {
            std::future::pending::<()>().await;
        }
        Ok(None)
    }
}
