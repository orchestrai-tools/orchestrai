import { IssueTrackers } from "./connections";
import { LanguageServers } from "./editor";
import { SectionHeader } from "./primitives";

/** What OrchestrAI plugs into on this Mac: the code view's language servers, then the issue trackers. */
export function IntegrationsSection() {
  return (
    <>
      <SectionHeader
        title="Integrations"
        scope="Every project on this Mac. Install language servers for the code view and connect your issue trackers."
      />
      <LanguageServers />
      <IssueTrackers />
    </>
  );
}
