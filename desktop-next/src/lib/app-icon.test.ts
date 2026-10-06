import { describe, expect, it } from "vitest";

import { APP_ICONS, APP_ICON_DEFAULT, isAppIcon } from "./app-icon";
import { useAppearance } from "./appearance";

describe("app icon", () => {
  it("knows the icons the desktop shell embeds", () => {
    expect(APP_ICONS.map((icon) => icon.id)).toEqual(["back", "front", "line", "ai"]);
    expect(isAppIcon(APP_ICON_DEFAULT)).toBe(true);
    expect(isAppIcon("orbit")).toBe(false);
  });

  it("falls back to the default for a name it does not know", () => {
    useAppearance.getState().setAppIcon("line");
    expect(useAppearance.getState().appIcon).toBe("line");
    useAppearance.getState().setAppIcon("orbit");
    expect(useAppearance.getState().appIcon).toBe(APP_ICON_DEFAULT);
  });
});
