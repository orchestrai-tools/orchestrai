use serde_json::{json, Value};

pub(super) fn defs() -> Vec<Value> {
    vec![
        json!({
            "name": "runner_enqueue",
            "description": "Queue backlog items for the project's Factory: each runs through the configured workflow in its own worktree or in the project checkout (one checkout run at a time; the project setting decides unless run_location says otherwise), and a successful run is committed, pushed and opened as a draft pull request for a person to review. Queuing does not start anything while the Factory is paused. A Factory run cannot queue items itself.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "number": { "type": "integer", "description": "The item number, as in #87. Give number or numbers." },
                    "numbers": { "type": "array", "items": { "type": "integer" }, "description": "Several item numbers, queued in this order." },
                    "project": { "type": "string", "description": "Project name. Defaults to the current project." },
                    "run_location": { "type": "string", "enum": ["default", "worktree", "checkout"], "description": "Where these items run: 'worktree' (a fresh worktree each), 'checkout' (the project checkout, so a verify stage can test the running app), or 'default' to follow the project setting. Defaults to 'default'." }
                }
            }
        }),
        json!({
            "name": "runner_status",
            "description": "Read the project's Factory: whether it is running, what holds it, the queue in order, the items in flight with their pull requests, and optionally the recent runs with their outcome and cost.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "project": { "type": "string", "description": "Project name. Defaults to the current project." },
                    "runs": { "type": "boolean", "description": "Also list the ten most recent runs." }
                }
            }
        }),
    ]
}
