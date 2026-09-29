import { describe, expect, it } from "vitest";

import { portWarningText } from "./portWarning";

describe("portWarningText", () => {
  it("names one, several or no answering ports", () => {
    expect(portWarningText({ expected: 4000, listening: [8787] })).toMatch(
      /^Listening on 8787, not 4000 — /,
    );
    expect(portWarningText({ expected: 4000, listening: [8787, 9501] })).toMatch(
      /^Listening on 8787 and 9501, not 4000 — /,
    );
    expect(portWarningText({ expected: 4000 })).toMatch(/^Nothing answers on port 4000 — /);
  });
});
