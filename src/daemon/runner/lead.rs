use warpforge_protocol as wire;

/// The lead agent and model a Factory task runs with. What the person gave
/// wins; the project's defaults fill in only what was not given, and the
/// default model only ever goes with the default agent.
/// @param agent the requested lead agent
/// @param model the requested lead model
/// @param settings the project's Factory settings
/// @param first_enabled the first enabled agent, for settings that name none
/// @returns the agent (empty when none is set up) and its model, if any
pub(crate) fn resolve_lead(
    agent: Option<&str>,
    model: Option<&str>,
    settings: &wire::RunnerSettings,
    first_enabled: &str,
) -> (String, Option<String>) {
    let given = |value: Option<&str>| {
        value
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(str::to_string)
    };
    let default_agent = given(Some(&settings.agent)).unwrap_or_else(|| first_enabled.to_string());
    let agent = given(agent).unwrap_or_else(|| default_agent.clone());
    let model = given(model).or_else(|| {
        (agent == default_agent)
            .then(|| given(settings.model.as_deref()))
            .flatten()
    });
    (agent, model)
}
