/** Agent browser tabs belong to a project; each task pane can adopt that project's tab. */
export interface AgentBrowserTab {
  id: string;
  url: string;
  title?: string;
}
const tabs = new Map<string, AgentBrowserTab>();
const generations = new Map<string, number>();
const listeners = new Map<string, Set<(tab: AgentBrowserTab) => void>>();

export function agentTabId(project: string): string | undefined {
  return tabs.get(project)?.id;
}

export function agentTabGeneration(project: string): number {
  return generations.get(project) ?? 0;
}

/** Closing an agent tab prevents another task's pane from resurrecting it. */
export function forgetAgentTab(id: string): void {
  for (const [project, tab] of tabs) {
    if (tab.id === id) clearAgentTabs(project);
  }
}

export function resetAllAgentTabs(): void {
  tabs.clear();
  generations.clear();
}

export function showAgentTab(project: string, tab: AgentBrowserTab): void {
  const previous = tabs.get(project);
  tabs.set(project, { ...(previous?.id === tab.id ? previous : {}), ...tab });
  for (const listener of listeners.get(project) ?? []) listener(tabs.get(project)!);
}

export function onAgentTab(project: string, listener: (tab: AgentBrowserTab) => void): () => void {
  const group = listeners.get(project) ?? new Set();
  group.add(listener);
  listeners.set(project, group);
  const current = tabs.get(project);
  if (current) listener(current);
  return () => {
    group.delete(listener);
    if (!group.size) listeners.delete(project);
  };
}

export function recordTabPage(id: string, page: { url?: string; title?: string }): void {
  for (const [project, tab] of tabs) {
    if (tab.id === id) tabs.set(project, { ...tab, ...page });
  }
}

export function clearAgentTabs(project: string): void {
  tabs.delete(project);
  generations.set(project, agentTabGeneration(project) + 1);
}
