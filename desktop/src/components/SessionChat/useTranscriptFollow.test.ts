import type { LegendListRef } from "@legendapp/list/react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useTranscriptFollow } from "./useTranscriptFollow";

function scroller() {
  const node = document.createElement("div");
  const content = document.createElement("div");
  const containers = document.createElement("div");
  content.append(containers);
  node.append(content);
  let top = 0;
  Object.defineProperty(node, "scrollHeight", { configurable: true, value: 900 });
  Object.defineProperty(node, "scrollTop", {
    configurable: true,
    get: () => top,
    set: (value: number) => {
      top = value;
    },
  });
  return { containers, node };
}

async function mount(disclosureSettling = false) {
  const { containers, node } = scroller();
  const hook = renderHook(() =>
    useTranscriptFollow({
      active: false,
      taskId: "t1",
      disclosureSettling,
      disclosureAnchorKey: { current: disclosureSettling ? "activity:work:a" : null },
    }),
  );
  hook.result.current.listRef.current = {
    getScrollableNode: () => node,
  } as unknown as LegendListRef;
  // The hook attaches its observers on an animation frame once the list ref is set.
  await act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
  return { containers, hook, node };
}

async function commitHeight(containers: HTMLElement) {
  containers.style.height = "1200px";
  await act(() => Promise.resolve());
}

describe("useTranscriptFollow", () => {
  it("pins to the end when the list commits a new content height while following", async () => {
    const { containers, node } = await mount();
    await commitHeight(containers);
    await waitFor(() => expect(node.scrollTop).toBe(900));
  });

  it("leaves the scroll alone while reading", async () => {
    const { containers, hook, node } = await mount();
    act(() => hook.result.current.onWheelCapture({ deltaY: -40 } as React.WheelEvent));
    await commitHeight(containers);
    expect(node.scrollTop).toBe(0);
  });

  it("leaves the scroll alone while a disclosure settles", async () => {
    const { containers, node } = await mount(true);
    await commitHeight(containers);
    expect(node.scrollTop).toBe(0);
  });
});
