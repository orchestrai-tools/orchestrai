import { create } from "zustand";
import type { ServiceInfo } from "@warpforge/protocol";

/** The service open on the Services page. Cleared when that page unmounts. */
export const useSelectedService = create<{
  service: ServiceInfo | null;
  select: (service: ServiceInfo | null) => void;
}>((set) => ({
  service: null,
  select: (service) => set({ service }),
}));

/** A pinned port is a hard requirement: a conflict fails the service. */
export const PINNED_PORT_TITLE =
  "This port is fixed by the project's config. If it is already taken, the service fails instead of moving.";

/** Names the fields a personal local config file added or changed. */
export function localConfigTitle(name: string, fields?: string[]): string {
  const detail = fields && fields.length > 0 ? `: ${fields.join(", ")}` : "";
  return `${name} is set by your local config${detail}`;
}

/** What the inspector says about a service that is up but not answering. */
export function portWarningText(service: ServiceInfo): string | null {
  const warning = service.portWarning;
  if (!warning) return null;
  const listening = warning.listening ?? [];
  if (listening.length === 0) return `Nothing is answering on port ${warning.expected}.`;
  return `Nothing is answering on port ${warning.expected}. The log mentions ${listening.join(", ")}.`;
}
