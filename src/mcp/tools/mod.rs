use serde_json::Value;

use super::automations;

mod backlog;
mod memory;
mod orchestrator;
mod runtime;

pub(crate) fn tool_defs(is_orchestrator: bool) -> Value {
    let mut tools: Vec<Value> = Vec::new();
    tools.extend(runtime::defs());
    tools.extend(backlog::defs());
    tools.extend(memory::defs());

    if is_orchestrator {
        if let Value::Array(orch) = orchestrator::defs() {
            tools.extend(orch);
        }
    }
    if let Value::Array(automation) = automations::tool_defs() {
        tools.extend(automation);
    }
    Value::Array(tools)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_input_schema_is_a_plain_object_without_top_level_combinators() {
        for is_orchestrator in [false, true] {
            for tool in tool_defs(is_orchestrator).as_array().unwrap() {
                let name = &tool["name"];
                let schema = tool["inputSchema"].as_object().expect("inputSchema");
                assert_eq!(schema.get("type"), Some(&Value::from("object")), "{name}");
                for combinator in ["anyOf", "oneOf", "allOf"] {
                    assert!(!schema.contains_key(combinator), "{name} has {combinator}");
                }
            }
        }
    }
}
