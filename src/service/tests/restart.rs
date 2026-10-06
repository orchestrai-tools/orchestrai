use super::*;

#[tokio::test]
async fn repeated_pinned_restarts_wait_for_the_previous_listener_to_exit() {
    bounded(async {
        // Stay outside the OS ephemeral range: concurrent tests otherwise
        // claim our just-released port for unrelated outbound connections.
        let listener = (20000..30000)
            .find_map(|port| std::net::TcpListener::bind(("127.0.0.1", port)).ok())
            .expect("a free service test port");
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let (tx, mut rx) = mpsc::unbounded_channel();
        let mut mgr = ServiceManager::new(tx);
        let command = "node -e 'require(\"net\").createServer().listen(Number(process.env.PORT), \"127.0.0.1\", () => console.log(\"READY\"))'";
        let readiness = Readiness { pattern: Some("READY".into()), ..Readiness::default() };
        for cycle in 0..8 {
            mgr.start("restart-test", ".", (port, port), ports::PortPin::Strict,
                "web", command, port, None, &readiness, None).await.unwrap();
            assert_ne!(mgr.get("restart-test", "web").unwrap().status, ServiceStatus::Failed,
                "restart {cycle} refused its own pinned port: {:?}",
                mgr.log_window("restart-test", "web", 0, None).0);
            loop {
                let event = timeout(Duration::from_secs(5), rx.recv()).await.unwrap().unwrap();
                mgr.apply_event(event);
                if mgr.get("restart-test", "web").unwrap().status == ServiceStatus::Running { break; }
            }
            mgr.stop("restart-test", "web").await.unwrap();
            assert!(std::net::TcpListener::bind(("127.0.0.1", port)).is_ok(),
                "stop {cycle} returned before releasing its listener");
        }
    }).await;
}
