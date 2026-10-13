// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

import { ErrorBoundary } from "./error-boundary";

it("leaves workspace navigation usable when a page crashes and can recover", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const host = document.createElement("div");
  const root = createRoot(host);
  let broken = true;
  const navigate = vi.fn();
  function Page() {
    if (broken) throw new Error("page failure");
    return <p>Recovered page</p>;
  }
  try {
    await act(() =>
      root.render(
        <>
          <button onClick={navigate}>Board</button>
          <ErrorBoundary contained>
            <Page />
          </ErrorBoundary>
        </>,
      ),
    );
    expect(host.textContent).toContain("This page hit an error");
    await act(() => (host.querySelector("button") as HTMLButtonElement).click());
    expect(navigate).toHaveBeenCalledOnce();
    broken = false;
    const retry = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Try again",
    )!;
    await act(() => retry.click());
    expect(host.textContent).toContain("Recovered page");
  } finally {
    await act(() => root.unmount());
    errors.mockRestore();
  }
});
