import { useCallback, useSyncExternalStore } from "react"

function subscribeFocus(onChange: () => void) {
  window.addEventListener("focus", onChange)
  window.addEventListener("blur", onChange)
  return () => {
    window.removeEventListener("focus", onChange)
    window.removeEventListener("blur", onChange)
  }
}

/** Whether the browser window has focus; desktop apps dim their window controls when it doesn't. */
export function useWindowFocused() {
  return useSyncExternalStore(subscribeFocus, () => document.hasFocus())
}

function subscribeFullscreen(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange)
  return () => document.removeEventListener("fullscreenchange", onChange)
}

/** Browser full screen, standing in for a desktop window's zoom button. */
export function useFullscreen() {
  const fullscreen = useSyncExternalStore(subscribeFullscreen, () => document.fullscreenElement !== null)
  const toggle = useCallback(() => {
    // Rejects where full screen is not allowed (some embedded webviews); the button then does nothing.
    const request = document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen()
    request.catch(() => {})
  }, [])
  return { fullscreen, toggle }
}
