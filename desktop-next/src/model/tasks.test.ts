import type { TaskInfo } from "@warpforge/protocol";
import { expect, test } from "vitest";

import { inboxEntries } from "../pages/inbox/inbox-items";
import { columnOf, groupByColumn, needsPerson, visibleTasks, waitingTasks } from "./tasks";

function task(patch: Partial<TaskInfo>): TaskInfo {
  return {
    id: "t",
    project: "demo",
    prompt: "do the thing",
    agent: "claude",
    status: "running",
    tags: [],
    title: "Do the thing",
    createdAt: 0,
    updatedAt: 0,
    filesChanged: 0,
    blockedReason: null,
    ...patch,
  };
}

test("an advisor conversation stays off the board", () => {
  const rows = visibleTasks([task({ origin: "advisor" }), task({ id: "lead" })]);
  expect(rows.map((row) => row.id)).toEqual(["lead"]);
});

test("a quick chat stays off the board", () => {
  const rows = visibleTasks([task({ origin: "chat" }), task({ id: "lead" })]);
  expect(rows.map((row) => row.id)).toEqual(["lead"]);
});

test("a chat needs you only for a permission, not after each reply", () => {
  expect(needsPerson(task({ origin: "chat", status: "waiting" }))).toBe(false);
  expect(needsPerson(task({ origin: "chat", status: "waiting", pendingPermission: true }))).toBe(
    true,
  );
});

test("a blocked task waits in Needs you", () => {
  const blocked = task({ status: "blocked" });
  expect(needsPerson(blocked)).toBe(true);
  expect(columnOf(blocked)).toBe("needs-you");
});

test("a task with a pull request sits in review", () => {
  expect(columnOf(task({ status: "waiting" }), true)).toBe("review");
  expect(columnOf(task({ status: "running" }), true)).toBe("review");
});

test("a snoozed block stays out of Needs you", () => {
  const later = Math.floor(Date.now() / 1000) + 3600;
  const snoozed = task({ status: "blocked", snoozedAt: 1, snoozedUntil: later });
  expect(needsPerson(snoozed)).toBe(false);
  expect(columnOf(snoozed)).toBe("running");
  expect(groupByColumn([snoozed])["needs-you"]).toEqual([]);
  expect(groupByColumn([snoozed]).running.map((item) => item.id)).toEqual(["t"]);
});

test("a waiting task is not asking for a person", () => {
  expect(needsPerson(task({ status: "waiting" }))).toBe(false);
  expect(columnOf(task({ status: "waiting" }))).toBe("running");
});

test("done stays done even with a pull request", () => {
  expect(columnOf(task({ status: "done" }), true)).toBe("done");
});

test("a task the user marked handled sits with the finished ones", () => {
  expect(columnOf(task({ status: "waiting", settledOverride: true }))).toBe("done");
});

test("a settled block leaves every waiting list, not just the board", () => {
  const settled = task({ status: "blocked", settledOverride: true });
  expect(needsPerson(settled)).toBe(false);
  expect(columnOf(settled)).toBe("done");
  expect(waitingTasks([settled])).toEqual([]);
  expect(inboxEntries([settled], {}, {}, {})).toEqual([]);
});
