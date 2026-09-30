use std::collections::BTreeMap;

use anyhow::{bail, Result};
use serde_yaml::{Mapping, Value};

use super::LocalOverrides;

/// Deep-merge a local override document over the shared one.
///
/// @param base The shared config as parsed YAML.
/// @param local The local override file as parsed YAML.
/// @returns The merged document and which services and forwards it touched.
pub(super) fn merge_config(base: Value, local: Value) -> Result<(Value, LocalOverrides)> {
    let (Value::Mapping(mut merged), Value::Mapping(local)) = (base, local) else {
        bail!("the top level must be a mapping");
    };
    let mut overrides = LocalOverrides::default();
    for (key, value) in local {
        match (key.as_str(), value) {
            (_, Value::Null) => {
                merged.remove(&key);
            }
            (Some("services"), Value::Mapping(services)) => {
                merge_services(
                    section(&mut merged, &key),
                    services,
                    &mut overrides.services,
                );
            }
            (Some("portforwards"), Value::Sequence(forwards)) => {
                merge_forwards(&mut merged, &key, forwards, &mut overrides.portforwards)?;
            }
            (_, value) => merge_entry(&mut merged, key, value),
        }
    }
    Ok((Value::Mapping(merged), overrides))
}

fn merge_value(base: &mut Value, local: Value) {
    match (base, local) {
        (Value::Mapping(base), Value::Mapping(local)) => merge_mapping(base, local),
        (base, local) => *base = local,
    }
}

fn merge_mapping(base: &mut Mapping, local: Mapping) {
    for (key, value) in local {
        merge_entry(base, key, value);
    }
}

fn merge_entry(base: &mut Mapping, key: Value, value: Value) {
    if value.is_null() {
        base.remove(&key);
        return;
    }
    match base.get_mut(&key) {
        Some(existing) => merge_value(existing, value),
        None => {
            let fresh = match value {
                Value::Mapping(local) => {
                    let mut fresh = Mapping::new();
                    merge_mapping(&mut fresh, local);
                    Value::Mapping(fresh)
                }
                other => other,
            };
            base.insert(key, fresh);
        }
    }
}

fn section<'a>(root: &'a mut Mapping, key: &Value) -> &'a mut Mapping {
    let slot = root
        .entry(key.clone())
        .or_insert_with(|| Value::Mapping(Mapping::new()));
    if !slot.is_mapping() {
        *slot = Value::Mapping(Mapping::new());
    }
    slot.as_mapping_mut().expect("slot was just made a mapping")
}

fn field_names(mapping: &Mapping, skip: &[&str]) -> Vec<String> {
    mapping
        .keys()
        .filter_map(Value::as_str)
        .filter(|name| !skip.contains(name))
        .map(str::to_string)
        .collect()
}

fn merge_services(base: &mut Mapping, local: Mapping, touched: &mut BTreeMap<String, Vec<String>>) {
    for (name, service) in local {
        if let Some(name) = name.as_str() {
            match &service {
                Value::Null => touched.remove(name),
                Value::Mapping(fields) => touched.insert(name.into(), field_names(fields, &[])),
                _ => touched.insert(name.into(), Vec::new()),
            };
        }
        merge_entry(base, name, service);
    }
}

fn forward_key(entry: &Mapping) -> Option<String> {
    if let Some(name) = entry.get("name").and_then(Value::as_str) {
        return Some(name.to_string());
    }
    let namespace = entry.get("namespace")?.as_str()?;
    let pod = entry.get("pod")?.as_str()?;
    Some(format!("{namespace}:{pod}"))
}

fn merge_forwards(
    root: &mut Mapping,
    key: &Value,
    local: Vec<Value>,
    touched: &mut BTreeMap<String, Vec<String>>,
) -> Result<()> {
    let slot = root
        .entry(key.clone())
        .or_insert_with(|| Value::Sequence(Vec::new()));
    if !slot.is_sequence() {
        *slot = Value::Sequence(Vec::new());
    }
    let base = slot
        .as_sequence_mut()
        .expect("slot was just made a sequence");
    for (index, entry) in local.into_iter().enumerate() {
        let Value::Mapping(mut entry) = entry else {
            bail!("portforwards[{index}] must be a mapping");
        };
        let Some(name) = forward_key(&entry) else {
            bail!("portforwards[{index}] needs a `name` (or `namespace` and `pod`)");
        };
        let remove = entry.remove("remove") == Some(Value::Bool(true));
        let position = base
            .iter()
            .position(|e| e.as_mapping().and_then(forward_key).as_deref() == Some(&name));
        if remove {
            if let Some(position) = position {
                base.remove(position);
            }
            touched.remove(&name);
            continue;
        }
        touched.insert(name, field_names(&entry, &["name"]));
        match position.and_then(|p| base[p].as_mapping_mut()) {
            Some(existing) => merge_mapping(existing, entry),
            None => {
                let mut fresh = Mapping::new();
                merge_mapping(&mut fresh, entry);
                base.push(Value::Mapping(fresh));
            }
        }
    }
    Ok(())
}
