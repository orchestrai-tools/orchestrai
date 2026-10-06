/** Agent browser tabs belong to a project; each task pane can adopt that project's tab. */
export interface AgentBrowserTab {
  id: string;
  url: string;
  title?: string;
}
const tabs = new Map<string, AgentBrowserTab>();
const listeners = new Map<string, Set<(tab: AgentBrowserTab) => void>>();

export function showAgentTab(project: string, tab: AgentBrowserTab): void {
  tabs.set(project, { ...tabs.get(project), ...tab });
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
}
