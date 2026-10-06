# Postmortem: desktop-next did not use the mock

Date: 2026-10-02. The OrchestrAI desktop UI redo spent about a day and a large API bill building a second interface. The interface that was supposed to ship already existed.

## What was required

The plan (`.cursor/plans/orchestrai_ui_redo_125ded8a.plan.md`) names the source of the look:

- Target look and behaviour: `experiments/orchestrai-shell/src`.
- UI kit: the shadcn primitives in `experiments/orchestrai-shell/src/components/ui`, copied into `desktop-next`.
- React components are copied into `desktop-next` and restyled. They are not shared with `desktop/`, and they are not rewritten from a blank page.
- The fake multi-window desktop in the mock (`window/desktop.tsx` and the window-frame pieces) stays out. One Tauri window. The shell that remains is the mock's: sidebar, work area, inspector, terminal drawer.

`experiments/orchestrai-shell` is that shell. Geist, Tailwind 4, shadcn, the page layouts, the command palette, the inspector. It was in the repo before this redo started.

## What was built

`desktop-next` is a separate plain app. Custom CSS in `desktop-next/src/index.css`. Plain `<button>` rows. No `desktop-next/src/components/ui/`. The mock's `AppShell`, sidebar, and pages were not copied and were not mounted.

The daemon wiring in `desktop-next` is real: pages call the existing RPCs, phase 9 added docs, sessions, channel, and the `$` command bar, and `tauri.conf.json` points at `desktop-next`. That wiring sits under the wrong surface. A screenshot of the running window does not look like the mock.

Late in the session, `lib/actions.ts` and `lib/domain-actions.ts` were added because the plan names those files. That did not put the mock on screen.

## Why the mock was skipped

The plan was read as two jobs, and only the second one was executed.

1. Copy the mock and connect it to the daemon.
2. Make every old Warpforge control exist again (`docs/product/UI-PARITY.md`).

Job 2 can be satisfied with any widgets that call the right RPCs. A new button, a new Command-K row, and a checked box in `UI-PARITY.md` all count. Job 1 cannot. Copying `experiments/orchestrai-shell` is a large visual port, and nothing in the hourly loop rewarded it.

A 5-minute loop was running with this instruction: pick the next unfinished plan item or UI-PARITY row and implement it. Each tick closed by adding one command or one control. The mock is not a row in that checklist. After many hours the checklist was full and the window was still the plain app.

The phrase "copy the components and restyle them" was treated as "write new components." New files were created in `desktop-next/src/components/` instead of bringing over `experiments/orchestrai-shell/src/components/ui` and the mock pages.

The mock was also treated as a layout sketch (regions: title bar, sidebar, inspector, drawer) rather than as the code to run. The plan says to drop the fake desktop frame. That sentence was followed. The sentence that says the remaining shell is the mock was not.

Completion was then declared from lint, tests, and a live process. None of those compare the window to `experiments/orchestrai-shell`. The process can be up, the tests can pass, and the product can still be the wrong UI. That is what happened.

## What it cost

Roughly a day of agent time, on the order of $700 in API calls, plus a stopped Warpforge daemon so this build could launch. The user ended with a plain window and the original mock untouched.

## What the next pass has to do

Put `experiments/orchestrai-shell` on screen. One Tauri window, no fake desktop. Keep the daemon client that `desktop-next` already has, and connect the mock's pages to it. Do not design a third shell. Do not add another Command-K command and call it progress. Do not mark the work done until the window is the mock, opened and looked at.
