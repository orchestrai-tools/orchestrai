//! A bounded liveness probe: authenticate and complete `system.handshake` as
//! the web UI does, over just enough of a WebSocket client to do it.

use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use warpforge_protocol::{DaemonEndpoint, PROTOCOL_VERSION};

const TEXT: u8 = 0x1;
const CLOSE: u8 = 0x8;
const MASK: [u8; 4] = [0x77, 0x66, 0x70, 0x72];
const MAX_FRAME: u64 = 1 << 20;

/// Whether the daemon at `endpoint` answers `system.handshake` with a result
/// within about `timeout`. Refused, closed, an error reply or silence is no.
pub(super) fn answers_handshake(endpoint: &DaemonEndpoint, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    let Some(host) = endpoint.url.strip_prefix("ws://") else {
        return false;
    };
    let connected = host
        .parse::<SocketAddr>()
        .map_err(io::Error::other)
        .and_then(|addr| {
            let stream = TcpStream::connect_timeout(&addr, timeout)?;
            stream.set_read_timeout(Some(timeout))?;
            stream.set_write_timeout(Some(timeout))?;
            Ok(stream)
        });
    connected
        .and_then(|stream| handshake(&stream, &stream, host, &endpoint.token, deadline))
        .unwrap_or(false)
}

fn handshake(
    reader: impl Read,
    mut writer: impl Write,
    host: &str,
    token: &str,
    deadline: Instant,
) -> io::Result<bool> {
    let upgrade = format!(
        "GET / HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\
         Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n"
    );
    writer.write_all(upgrade.as_bytes())?;
    let mut reader = BufReader::new(reader);
    let mut line = String::new();
    reader.read_line(&mut line)?;
    if !line.starts_with("HTTP/1.1 101") {
        return Ok(false);
    }
    while line != "\r\n" {
        line.clear();
        if reader.read_line(&mut line)? == 0 {
            return Ok(false);
        }
    }

    let mut frames = Vec::new();
    if !token.is_empty() {
        frames.extend(text_frame(&json!({ "auth": token })));
    }
    frames.extend(text_frame(&json!({
        "id": 1,
        "method": "system.handshake",
        "params": {
            "client_version": env!("CARGO_PKG_VERSION"),
            "protocol_version": PROTOCOL_VERSION,
        },
    })));
    writer.write_all(&frames)?;

    while Instant::now() < deadline {
        let (opcode, payload) = read_frame(&mut reader)?;
        if opcode == CLOSE {
            return Ok(false);
        }
        if opcode == TEXT {
            let reply: Value = serde_json::from_slice(&payload)?;
            if reply["id"] == 1 {
                return Ok(reply.get("result").is_some());
            }
        }
    }
    Ok(false)
}

/// A final text frame, masked as RFC 6455 requires of a client.
fn text_frame(message: &Value) -> Vec<u8> {
    let payload = message.to_string().into_bytes();
    let mut frame = vec![0x80 | TEXT];
    match payload.len() {
        len @ 0..=125 => frame.push(0x80 | len as u8),
        len @ 126..=0xffff => {
            frame.push(0x80 | 126);
            frame.extend_from_slice(&(len as u16).to_be_bytes());
        }
        len => {
            frame.push(0x80 | 127);
            frame.extend_from_slice(&(len as u64).to_be_bytes());
        }
    }
    frame.extend_from_slice(&MASK);
    frame.extend(payload.iter().zip(MASK.iter().cycle()).map(|(b, k)| b ^ k));
    frame
}

/// One unmasked server frame: its opcode and payload.
fn read_frame(reader: &mut impl Read) -> io::Result<(u8, Vec<u8>)> {
    let mut head = [0; 2];
    reader.read_exact(&mut head)?;
    let len = match head[1] & 0x7f {
        126 => {
            let mut len = [0; 2];
            reader.read_exact(&mut len)?;
            u64::from(u16::from_be_bytes(len))
        }
        127 => {
            let mut len = [0; 8];
            reader.read_exact(&mut len)?;
            u64::from_be_bytes(len)
        }
        len => u64::from(len),
    };
    if len > MAX_FRAME {
        return Err(io::Error::other("oversized frame"));
    }
    let mut payload = vec![0; len as usize];
    reader.read_exact(&mut payload)?;
    Ok((head[0] & 0x0f, payload))
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::net::UnixStream;

    /// A daemon stand-in: accepts the upgrade, collects the client's messages
    /// up to the request, then sends `reply` or stays silent until hung up on.
    fn fake_daemon(stream: UnixStream, reply: Option<Vec<u8>>) -> Vec<Value> {
        let mut reader = BufReader::new(&stream);
        let mut line = String::from("start");
        while line != "\r\n" {
            line.clear();
            reader.read_line(&mut line).unwrap();
        }
        (&stream)
            .write_all(b"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n\r\n")
            .unwrap();
        let mut messages = Vec::new();
        loop {
            let message: Value = serde_json::from_slice(&read_client_frame(&mut reader)).unwrap();
            let is_request = message.get("method").is_some();
            messages.push(message);
            if is_request {
                break;
            }
        }
        match reply {
            Some(reply) => (&stream).write_all(&reply).unwrap(),
            None => while reader.read(&mut [0; 1]).is_ok_and(|read| read > 0) {},
        }
        messages
    }

    fn read_client_frame(reader: &mut impl Read) -> Vec<u8> {
        let mut head = [0; 2];
        reader.read_exact(&mut head).unwrap();
        assert_eq!(head[0], 0x80 | TEXT, "a final text frame");
        assert!(head[1] & 0x80 != 0, "client frames are masked");
        let len = match head[1] & 0x7f {
            126 => {
                let mut len = [0; 2];
                reader.read_exact(&mut len).unwrap();
                usize::from(u16::from_be_bytes(len))
            }
            len => usize::from(len),
        };
        let mut key = [0; 4];
        reader.read_exact(&mut key).unwrap();
        let mut payload = vec![0; len];
        reader.read_exact(&mut payload).unwrap();
        payload
            .iter_mut()
            .zip(key.iter().cycle())
            .for_each(|(b, k)| *b ^= k);
        payload
    }

    fn probe(token: &str, reply: Option<Vec<u8>>) -> (io::Result<bool>, Vec<Value>) {
        let (client, server) = UnixStream::pair().unwrap();
        client
            .set_read_timeout(Some(Duration::from_millis(300)))
            .unwrap();
        let daemon = std::thread::spawn(move || fake_daemon(server, reply));
        let deadline = Instant::now() + Duration::from_secs(3);
        let answered = handshake(&client, &client, "127.0.0.1:1", token, deadline);
        drop(client);
        (answered, daemon.join().unwrap())
    }

    fn server_text(message: Value) -> Vec<u8> {
        let payload = message.to_string().into_bytes();
        let mut frame = vec![0x80 | TEXT, payload.len() as u8];
        frame.extend(payload);
        frame
    }

    #[test]
    fn it_authenticates_then_asks_for_the_handshake() {
        let reply = server_text(json!({ "id": 1, "result": { "owner": "desktop" } }));
        let (answered, messages) = probe("tok", Some(reply));
        assert!(answered.unwrap());
        assert_eq!(messages[0], json!({ "auth": "tok" }));
        assert_eq!(messages[1]["method"], "system.handshake");
        assert_eq!(messages[1]["params"]["protocol_version"], PROTOCOL_VERSION);
    }

    #[test]
    fn without_a_token_the_handshake_goes_first() {
        let reply = server_text(json!({ "id": 1, "result": {} }));
        let (answered, messages) = probe("", Some(reply));
        assert!(answered.unwrap());
        assert_eq!(messages.len(), 1);
    }

    #[test]
    fn an_error_reply_is_not_an_answer() {
        let reply = server_text(json!({ "id": 1, "error": { "code": "internal" } }));
        assert!(!probe("tok", Some(reply)).0.unwrap());
    }

    #[test]
    fn a_close_frame_is_not_an_answer() {
        assert!(!probe("tok", Some(vec![0x80 | CLOSE, 0])).0.unwrap());
    }

    #[test]
    fn silence_is_not_an_answer() {
        assert!(probe("tok", None).0.is_err());
    }

    #[test]
    fn frames_longer_than_125_bytes_carry_a_16_bit_length() {
        let frame = text_frame(&json!({ "auth": "x".repeat(200) }));
        assert_eq!(frame[1], 0x80 | 126);
        assert_eq!(usize::from(u16::from_be_bytes([frame[2], frame[3]])), 211);
    }
}
