import { useEffect } from "react"
import { useShallow } from "zustand/react/shallow"

import { useLayoutStore, type Radius } from "@/lib/layout-store"

const RADIUS: Record<Radius, string> = { none: "0rem", small: "0.25rem", medium: "0.625rem" }

/** Theme, density, and the radius token live on the root, so every component reads one value. */
export function useThemeSync() {
  const { theme, density, radius } = useLayoutStore(
    useShallow((state) => ({ theme: state.theme, density: state.density, radius: state.radius }))
  )
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("dark", theme === "dark")
    root.dataset.density = density
    root.style.setProperty("--radius", RADIUS[radius])
  }, [theme, density, radius])
}
