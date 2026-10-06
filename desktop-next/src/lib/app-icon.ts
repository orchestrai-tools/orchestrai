import ai from "../assets/app-icons/ai.png";
import back from "../assets/app-icons/back.png";
import front from "../assets/app-icons/front.png";
import line from "../assets/app-icons/line.png";

/** Ids match the icons the desktop shell embeds; `back` is also the bundle icon. */
export const APP_ICONS = [
  { id: "back", label: "Silhouette", src: back },
  { id: "front", label: "Maestro", src: front },
  { id: "line", label: "Line", src: line },
  { id: "ai", label: "AI", src: ai },
] as const;

export type AppIconId = (typeof APP_ICONS)[number]["id"];

export const APP_ICON_DEFAULT: AppIconId = "back";

export function isAppIcon(value: unknown): value is AppIconId {
  return APP_ICONS.some((icon) => icon.id === value);
}

/** Swap the Dock icon (window icon off macOS). A browser tab has nothing to swap. */
export function applyAppIcon(id: AppIconId) {
  if (!("__TAURI_INTERNALS__" in window)) return;
  void import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke("set_app_icon", { name: id }))
    .catch(() => {});
}
