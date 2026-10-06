/** Walk every backlog page that matches a Factory filter and return the item ids. */
export async function collectBacklogIds(
  load: (page: number, pageSize: number) => Promise<{ items: { id: string }[]; hasNextPage: boolean }>,
): Promise<string[]> {
  const pageSize = 100;
  const ids: string[] = [];
  for (let page = 0; page < 100; page += 1) {
    const result = await load(page, pageSize);
    ids.push(...result.items.map((item) => item.id));
    if (!result.hasNextPage) return ids;
  }
  return ids;
}

interface Named {
  id: string;
  valid: boolean;
  verifyRequired?: boolean | null;
}

/** Whether any selectable template checks the running app. */
export function canTestInApp(workflows: Named[]): boolean {
  return workflows.some((item) => item.valid && item.verifyRequired != null);
}

/** Pick the template the "Test in the running app" switch should select. */
export function testingWorkflow(workflows: Named[], on: boolean): string | null {
  const valid = workflows.filter((item) => item.valid);
  const tests = valid.filter((item) => item.verifyRequired != null);
  const plain = valid.filter((item) => item.verifyRequired == null);
  const list = on ? tests : plain;
  const preferred = on ? "verify-review-loop" : "review-loop";
  return list.find((item) => item.id === preferred)?.id ?? list[0]?.id ?? null;
}
