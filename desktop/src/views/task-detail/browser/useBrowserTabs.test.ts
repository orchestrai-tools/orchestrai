import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearBrowserSession } from "./browserSession";
import { BROWSER_START, useBrowserTabs } from "./useBrowserTabs";

function activeTab(result: { current: ReturnType<typeof useBrowserTabs> }) {
  return result.current.tabs.find((t) => t.id === result.current.activeId);
}

describe("useBrowserTabs", () => {
  beforeEach(() => {
    localStorage.clear();
    clearBrowserSession("p");
    let n = 0;
    vi.spyOn(crypto, "randomUUID").mockImplementation(() => `0-0-0-0-${++n}`);
  });

  it("opens with one ready start tab", () => {
    const { result } = renderHook(() => useBrowserTabs("p"));
    expect(result.current.tabs).toHaveLength(1);
    expect(activeTab(result)?.url).toBe(BROWSER_START);
  });

  it("opens a new start tab and makes it active", () => {
    const { result } = renderHook(() => useBrowserTabs("p"));
    act(() => result.current.newTab());
    expect(result.current.tabs).toHaveLength(2);
    expect(result.current.activeId).toBe(result.current.tabs[1].id);
  });

  it("activates the neighbour when the active tab is closed", () => {
    const { result } = renderHook(() => useBrowserTabs("p"));
    act(() => result.current.newTab());
    act(() => result.current.newTab());
    const [, middle, last] = result.current.tabs;
    act(() => result.current.setActive(middle.id));
    act(() => result.current.closeTab(middle.id));
    expect(result.current.activeId).toBe(last.id);
  });

  it("leaves a fresh start tab when the last tab is closed", () => {
    const { result } = renderHook(() => useBrowserTabs("p"), { wrapper: StrictMode });
    act(() => result.current.newTab());
    const [first, second] = result.current.tabs;
    act(() => result.current.closeTab(first.id));
    act(() => result.current.closeTab(second.id));
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0].id).not.toBe(second.id);
    expect(activeTab(result)?.url).toBe(BROWSER_START);
    expect(result.current.activeId).toBe(result.current.tabs[0].id);
  });

  it("gets its tabs back from memory when the pane remounts", () => {
    const first = renderHook(() => useBrowserTabs("p"));
    act(() => first.result.current.setTabUrl(first.result.current.tabs[0].id, "https://a.test/"));
    act(() => first.result.current.newTab());
    const before = first.result.current.tabs;
    first.unmount();
    localStorage.clear();
    const { result } = renderHook(() => useBrowserTabs("p"));
    expect(result.current.tabs.map((t) => [t.id, t.url])).toEqual(before.map((t) => [t.id, t.url]));
    expect(result.current.activeId).toBe(before[1].id);
  });
});
