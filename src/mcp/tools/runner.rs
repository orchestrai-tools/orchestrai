use serde_json::{json, Value};

pub(super) fn defs() -> Vec<Value> {
    vec![
        json!({
            "name": "runner_enqueue",
            "description": "Start Factory tasks for backlog items: one task per item, all with the same configuration. Each task runs the workflow template (implement, optional browser check, review ⇄ fix) and appears in the sidebar at once; it starts as soon as the project's Factory limits allow and waits as Queued until then. With pull_request on (the default) a successful run is committed, pushed and opened as a draft pull request for a person to review; off, the change is left in its checkout. Items that already have a Factory task, and done or cancelled items, are skipped and reported. A Factory run cannot start Factory tasks itself. Use it to start backlog items in bulk; for one goal that is not a backlog item, or to run a pipeline as your own child without a pull request, use spawn_workflow.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "number": { "type": "integer", "description": "The item number, as in #87. Give number or numbers." },
                    "numbers": { "type": "array", "items": { "type": "integer" }, "description": "Several item numbers, started in this order." },
                    "project": { "type": "string", "description": "Project name. Defaults to the current project." },
                    "workflow": { "type": "string", "description": "Workflow template id. Defaults to the project's Factory default." },
                    "agent": { "type": "string", "description": "Lead agent for every stage the template does not pin. Defaults to the project's Factory default." },
                    "model": { "type": "string", "description": "Lead model. Defaults to the project's Factory default." },
                    "run_location": { "type": "string", "enum": ["default", "worktree", "checkout"], "description": "Where each task runs: 'worktree' (a background copy of the repository), 'checkout' (the project folder, one task at a time, so a browser check tests the running app), or 'default' (Automatic: the project folder when the template tests the app, a background copy otherwise). Defaults to 'default'." },
                    "pull_request": { "type": "boolean", "description": "Open a draft pull request when a run succeeds. Defaults to true." }
                }
            }
        }),
        json!({
            "name": "runner_status",
            "description": "Read the project's Factory: its limits, why queued tasks are waiting, every Factory task that is queued, running or in review with its pull request, and optionally the recent runs with their outcome and cost.",
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
