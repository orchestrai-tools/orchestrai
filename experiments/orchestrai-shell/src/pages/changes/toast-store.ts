import { create } from "zustand"

export interface Toast {
  text: string
  tone: "ok" | "error"
}

let timer: ReturnType<typeof setTimeout> | undefined

/** One line saying what the last action did, or why it could not. */
export const useToast = create<{ toast: Toast | null; dismiss: () => void }>()((set) => ({
  toast: null,
  dismiss: () => set({ toast: null }),
}))

export function say(text: string, tone: Toast["tone"] = "ok") {
  clearTimeout(timer)
  useToast.setState({ toast: { text, tone } })
  timer = setTimeout(() => useToast.setState({ toast: null }), 6000)
}
