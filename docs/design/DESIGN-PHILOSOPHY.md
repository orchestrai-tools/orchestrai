# Design philosophy

How to design interfaces for tools that do a lot. It applies to any product with many features, many panels, or many agents running at once. Every principle names where it came from, and every source is linked at the end.

The short version: keep every feature, show few of them. The person's work takes the screen. Everything else is quiet until it is needed, and one place reaches all of it.

## 1. The work takes the screen

Decide what the person is actually looking at all day, and give that the center. Everything else is chrome, and chrome should step back.

- Linear dimmed its navigation sidebar a few notches so that, once you have arrived somewhere, the main content wins. Before, the sidebar stayed bright enough to compete with the work.
- Figma's redesign was organized around "your work takes center stage." It moved the toolbar to the bottom to free the top of the canvas.
- TradingView shortened its chart legend and gave it a semi-transparent background so it stops covering the chart.

If people read more than they write, design the reading surface first. A rendered page that stays fast with thousands of documents matters more than any editor. The editor sits beside or behind the rendered page, and the two stay in sync. Zed's markdown preview follows the editor's cursor and active block, and that is the interaction to copy.

## 1a. Less, but better, and a mode that hides everything else

Minimalism here means Dieter Rams' tenth principle, not an empty screen: "Good design is as little design as possible. Less, but better, because it concentrates on the essential aspects, and the products are not burdened with non-essentials." His fifth principle is the same idea from the user's side: a tool is "neutral and restrained," not a decoration. Rams' own caution belongs next to it: less is only more if it is also better. A screen that is simple because it is empty has failed in the other direction.

A product with many features still needs a place where the feature count drops to almost zero. That is a focus or zen mode, and it is designed, not just a hidden sidebar:

- VS Code's Zen Mode hides the sidebar, activity bar, status bar, and panel, centers the editor, and goes full screen (Cmd+K then Z on macOS). Escape twice leaves it. Each hidden part can be kept through a setting, such as the status bar or line numbers, so people choose their own minimum. Full screen is optional too.
- iA Writer's Focus Mode keeps the text but dims everything except the active sentence or paragraph. A third option, typewriter mode, keeps the cursor line centered while typing. iA says it works best for drafting and recommends turning it off while editing, because centering fights selection.
- iA's reasoning is the useful part: writing, structuring, and formatting use different kinds of attention, and switching between them is expensive. A focus mode protects one kind of work by removing the tools for the other kinds until you leave the mode.
- Figma offers two levels: minimize UI (panels collapse, properties return only when you select something) and hide all UI. One key each.

Rules for a focus mode:

1. One shortcut in, the same shortcut or Escape out. It is always reversible.
2. It hides chrome, never the work, and never the one thing the person is doing right now.
3. What stays visible is a setting. Different people have a different minimum.
4. Anything that genuinely needs the person (a failed job, an approval) still gets through, as a quiet mark at the edge, not a dialog.
5. It is for one kind of work. Leaving it brings back the full tool set exactly as it was.

## 2. Every feature exists; most are one step away

Progressive disclosure keeps the core features on screen and defers advanced or rare ones to a secondary place. It is more than thirty years old and still the main tool for a product with too many options.

- Put the things used every session in the primary view. Put settings, rare actions, and diagnostics one step away: a menu, a panel that opens on request, a details view.
- Staged disclosure (a wizard, one step at a time) works when the steps are independent. It fails when people have to move back and forth between steps.
- Show that something is hidden and how to reach it. Hiding without a visible way back reads as missing.

## 3. One place reaches everything

A command palette is how a dense product stays clean. Most features can leave the screen because they are one shortcut away.

Superhuman's rules, which hold up:

- One shortcut, everywhere. The same key opens it on every screen and closes it again.
- It is central. Do not split actions between several palettes.
- It is omnipotent. Every action is in it, not only navigation.
- It teaches. Each entry shows its keyboard shortcut, so the palette turns people into power users.

Two refinements:

- Fuzzy search. People forget exact names and make typos.
- Scope. Retool found that one global list of everything was overwhelming. Their palette shows actions for the current context first, and you widen or narrow the scope explicitly.

## 4. One action list drives every surface

Define each action once, with its name, arguments, shortcut, and whether it is dangerous. The palette, keyboard shortcuts, menus, buttons, plugins, and any automation or agent tool all read from that one list.

- Daintree uses one typed action list for its palette, keybindings, menus, plugins, and the MCP tools an agent can call. Dangerous actions still ask for confirmation, and an agent cannot skip that confirmation.
- TradingView's embeddable chart library makes almost every interface element a named switch ("featureset"). A simpler version of the product is then a configuration, not a separate build.

When the list is the source, a new feature appears everywhere at once, and nothing can be done in one place that is impossible in another.

## 5. Stable layout beats clever layout

Figma's most useful published lesson is what failed. During its redesign it tried panels that appeared only on hover and panels that floated over the canvas. In beta, those made the workspace feel unstable, cramped the canvas on smaller screens, and slowed down people who use the tool for hours. Figma reversed it: panels are fixed, but resizable and collapsible.

What it kept:

- A "minimize UI" toggle (Shift+\ in Figma) that collapses the side panels for focus.
- With the panels minimized, selecting something brings its properties panel back, and it goes away again when you deselect.
- A second toggle that hides all interface entirely.

So: let people collapse things on purpose. Do not make the interface rearrange itself under them.

"Speed is a feature" was the deciding argument at Figma. A pattern that looks calmer but makes experts slower is the wrong pattern.

## 6. Small controls appear on hover; one switch hides them all

Hover is fine for item-level controls, not for whole panels.

- TradingView shows the buttons for each indicator only when you hover its line in the legend, so they take no space the rest of the time.
- One click collapses every legend line at once.

The distinction from principle 5: a hidden button on a row is fine, but a hidden panel is not.

## 7. Status lives at the edge

Calm technology's principles (Amber Case, building on Mark Weiser and John Seely Brown at Xerox PARC):

- Require the smallest possible amount of attention.
- Inform without taking the person out of their task.
- Use the periphery. Information moves from the edge to the center when it matters, and back.
- Communicate without speaking. A dot, a color, or a badge is often enough.
- Keep working when something fails, and fall back to a usable state.
- Use the minimum technology needed. Slim the feature set to what solves the problem.
- Introduce features slowly and build on familiar behavior.

In practice, a running job is a small status mark. Only a job that needs a person comes to the center, through one place that collects those requests.

## 8. Consistency is a feature

Linear's 2026 refresh started from inconsistency, not ugliness: sharing a page, copying a link, and opening a pull request were in different places on different screens. They made headers, navigation, and view controls the same across every kind of page.

- The same action lives in the same place everywhere.
- The same kind of page has the same header.
- Muscle memory is worth protecting. Figma called breaking it the controversial part of their redesign. Change it only when the gain is clear, and change it once.

## 9. Prune decoration, keep density

Dense information is fine. Noise is not. Linear's pruning list is a good checklist:

- Fewer icons, and smaller ones. Remove decorative treatments such as colored backgrounds behind icons. Let labels do work that icons were straining to do.
- Fewer borders and separators. Keep the ones that explain structure, and soften them.
- Less brand color in the chrome. Put contrast on the content, the text, and the important icons.

Check light and dark modes separately. In Linear's refresh, users noticed that removing borders lost needed contrast in light mode first.

Corner radius is part of this choice. The research, the square-corner systems, and the rules for nested and touching corners are in [SHARP-EDGES.md](SHARP-EDGES.md).

## 10. Many panels, one set of controls

From TradingView's multi-chart layout:

- One toolbar for all panels. It acts on the selected panel instead of repeating a full control bar under each one.
- Maximize one panel with a single key (Alt+Enter in TradingView) and return to the grid.
- Preset layouts (rows, columns, grids) instead of free-form tiling as the default.
- Linked panels. Change the subject in one panel and the linked ones follow, the way linked charts share a symbol and date range.
- Name tabs after their purpose ("Crypto," "US stocks"), not the item that happens to be open.

Daintree applies the same idea to many coding agents: a grid of live terminals, one prompt sent to several selected panels at once, and a worktree dashboard. It is the reference for running many tools side by side.

## 11. Show the real state, not a guess

A status badge is only as good as the signal behind it.

- Daintree decides whether a terminal agent is working, waiting, or done by watching the terminal's output: prompt patterns, and how much of the screen changed recently. It works for every CLI because it never talks to them, but a spinner or a redrawn prompt can be read as the wrong state.
- KLIDE reads hooks that the CLI calls, such as a hook that runs when a turn ends. That is a better signal for any tool that can send one.
- A structured protocol beats both. When the tool reports its own state, the interface shows it instead of inferring it.

Prefer reported state over inferred state. When you must infer, add hysteresis so a flicker does not flip the badge, and log dropped transitions so false readings can be found.

## 12. Agent work is a board, not a chat log

One long chat scroll hides parallel work. When several agents run at once:

- Show a grid or board of tasks, one card each, with a status mark and a one-line summary. Opening a card shows only that task's history.
- Collect every approval request from every agent into one inbox. Google's Antigravity does this: terminal commands, browser actions, and implementation plans from all agents are reviewed in one place.
- Make the plan visible before it runs, and show a step log while it runs.
- Give every action a receipt: what changed, where, with which permission, a diff, and a way to undo.
- Gate actions by risk. Reversible, cheap actions can run on their own. Destructive or irreversible ones need a person.
- Give people start, stop, pause, and resume.
- Let autonomy be a dial (suggest, draft, execute), set per task or per kind of action.

KLIDE's Mission Control is the reference for one board that holds sessions from several different agents, with continue and fork from the board.

## 13. A stop is a handoff, with the reason attached

When a system declines to act, it should say exactly where it stopped and why, so a person can pick it up.

- A System One harness only offers actions that are possible right now, gets a probability back for each choice, and runs nothing below a bar set by the action's risk. It keeps the full set of probabilities as the record. When refusals repeat, check the state the system reported before lowering the bar: overlapping options, one question that is really two, or a missing fact are the usual causes.
- A durable agent runtime such as Hypha moves the run to a human-review state with the evidence attached, rather than retrying a step whose side effect is unknown.

The interface version: a stopped task shows what it was about to do, what it was unsure about, and the one action that would let it continue.

## 14. The tool you wrap keeps its own job

When a product hosts another tool (a coding CLI in a terminal, for example), add what that tool cannot do instead of rebuilding what it already does.

- Claude Code and Codex already have slash commands, file mentions, history, and multi-line input in their own prompts. Daintree's input bar above the terminal does not replace those. It adds one editor shared across many tools, context the hosted tool cannot see, and sending one message to many panels at once.
- KLIDE leaves the original CLI running as itself and adds a board, status, permissions, and continue or fork around it. The benefit is that the real tool stays current. The cost is that the wrapper sees only a terminal and hooks, so resume, fork, and tool events are weaker than with a structured protocol.

## 15. Secondary surfaces are pulled up, not parked

A terminal, a log, or a console is something you open when needed, not a permanent pane.

- Sinew puts terminals in a drawer along the bottom: a short tab strip (about 28 px), one tab per session, and a status on each tab (starting, running, exited). The main page stays on top.
- Daintree's command bar in the bottom-left of the sidebar is a `$` field for shell commands only, with saved commands, package scripts, and history, scoped to the selected workspace. It is not a chat box. Running commands sit above it.

## 16. First impressions are designed

- Helmor's first run locks the window to a fixed size, keeps a live mock of the real workspace beside the steps, and walks through signing in agents, connecting a code host, picking skills, and adding a project. Status checks are real (agent sign-in refreshes when the window regains focus), not screenshots.
- Buzz opens on a landing page, not a form: a large wordmark, one sentence, and a field of small shapes that drift on their own and move away from the pointer.
- Berd's home is a free-placement canvas of widgets (agents, chats, projects, notes, report updates), each with its own position and layer. On a large monitor it works as a board to watch work happen.

## 17. Build and test design in the running product

Linear's 2026 refresh was done by two engineers using AI coding agents. Instead of mocking colors in a design tool and waiting for preview builds, they built a color picker into the app's own developer toolbar, controlling hue, chroma, and lightness at the design-token level, and exported palettes as JSON that could be imported back into the design tool. Weeks of back and forth became hours.

Figma did the same with its beta: start with extreme removals, ship to real users, and measure feature adoption, performance, and feedback before deciding.

## 18. Layout and grouping: how to arrange many components

The principles above decide what is on screen. This one decides how what remains is arranged so that many pieces still read as a few clear groups.

### A fixed skeleton of regions

Give every screen the same small set of regions, and give each region one job. Apple's split-view guidance is the standard desktop model:

- **Sidebar (leading pane):** navigation. Top-level items and collections.
- **Content (center):** the work. The largest pane.
- **Inspector (trailing pane):** details and controls for whatever is selected. Optional and hideable.
- **Drawer (bottom) and toolbar (top):** secondary surfaces and global actions (see principle 15 for the drawer).

Apple's rules for those panes:

- Set sensible minimum and maximum sizes so a divider never disappears.
- Let people hide panes that compete with the main work, and give more than one way to bring them back: a toolbar button, a menu command, and a keyboard shortcut.
- Use thin dividers (1 point) unless both sides have strong lines that would hide it.
- As the window narrows, hide the inspector first, and switch to a compact layout as late as possible so the interface stays familiar.
- Apple also cautions against putting critical controls at the very bottom of a window, because people drag windows partly off screen. A bottom drawer or toolbar is fine, but it should not hold the only copy of something critical.

The same region is used for the same kind of thing on every screen. That is what lets a product grow without becoming a new layout per feature (principle 8).

### Group by space first, by containers second

Two Gestalt principles do most of the work, and Nielsen Norman Group has a clear article on each.

- **Proximity:** items close together are read as related, and items spaced apart are read as separate. It is one of the strongest grouping cues and can overpower color or shape.
- **Common region:** items inside a boundary (a border, a background tint, a card) are read as a group, even if they are far apart. A boundary beats proximity.

How to use them together:

1. Reach for space first. It groups with nothing but whitespace and adds no lines.
2. Use a container only when space cannot do it, or when related items cannot sit next to each other.
3. Never let them disagree. A border that cuts through a tight cluster, or a card that splits a related pair, sends two signals, and the border wins, usually not the way you meant.
4. Containers that exist for decoration are clutter. This is the same conclusion Linear reached when it removed borders (principle 9).
5. Groupings can break when a layout resizes. Check them at every window size.

Similarity (same color, shape, or style for things of the same kind) is the third tool. Use it to say "these are the same kind of thing," not to group by location.

### Rank by size, weight, and contrast

Visual hierarchy is the order in which the eye should read the screen. Nielsen Norman Group's guidance:

- Use about three sizes: small, medium, and large (for example, body, subheading, heading). More sizes blur the ranking.
- Rank with contrast in value and saturation, not with many colors. A limited palette, often two colors plus neutrals, keeps hierarchy clear.
- Rank with type weight before adding more sizes.
- Do not lower text contrast to make something secondary if that makes it hard to read. Check contrast for accessibility.
- Size alone says nothing about which items belong together. That is the job of proximity and common region.

### One spacing scale and one grid

When dozens of components share the screen, they line up only if every gap comes from the same short list of values.

- IBM Carbon builds everything on an 8 px "mini unit." Sizes for icons, boxes, and vertical spacing come from a short scale: 8, 16, 24, 32, 48, 64, 80 px.
- Carbon's spacing tokens run 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96, 160 px. The small steps are for spacing inside components. The large steps control density between components.
- Every margin and padding uses a token, never a one-off number. At smaller window sizes it is fine to step down one or two tokens, but the tokens themselves do not change.
- A "stack" component that puts equal space between items removes most hand-placed gaps.
- Align type and elements to a grid. Nielsen Norman Group lists alignment to a grid first among the basics of good visual design.

### Density is a mode, applied everywhere

Dense tools need more on screen, but density is a whole-product setting, not a per-page decision.

- Cloudscape (AWS) offers comfortable and compact modes. Comfortable is the default. Compact is for data-heavy views. Both come from the same 4 px base unit, with compact stepping spacing down in increments of 4. Users can always switch, and the mode applies to the whole application, not to single pages.
- SAP Fiori calls them cozy and compact. Cozy is sized for fingers (a 44 px touch area); compact is for mouse and keyboard, with 32 px rows and toolbars. The font size stays the same in both. Never mix the two at the same level of the hierarchy.
- Material Design numbers density from 0 down to −3, each step removing 4 dp of component height. Default stays touch-safe (48 × 48 dp targets); people opt in to denser components because they do not meet accessibility minimums.
- A useful counterweight from Material: when components get denser, make the layout's margins and gutters larger, so the screen stays legible.
- Matthew Ström's definition is the right goal: density is the value a person gets from the interface divided by the time and space it takes. A faster, more predictable screen is denser even if it shows the same amount.

### Order long lists on purpose

Sidebars, menus, and palettes grow long. How they are ordered decides whether anyone finds anything.

- Do not default to alphabetical. Nielsen Norman Group's guidance is to look for a better order first: frequency of use, the order of a workflow, a natural sequence (small to large, low to high), or time.
- Alphabetical works when the list is long (about 20 items or more) and people already know the exact name they want, such as states or product names. For fewer than about 10 items, order by meaning.
- For a long list with a few important items, use two parts: the few most-used items, then a link to the full list.
- Group related commands together (cut, copy, paste; undo, redo). Order the groups by workflow or importance, most important first.
- Keep groups to a medium size: not one huge group, not dozens of tiny ones. Give each group a short, distinct label.
- Show each item once. A duplicate makes people wonder whether the two are different.
- In context menus, put the most-used actions at the top and the destructive action last.
- Keep the order stable. A list that reorders itself by usage breaks muscle memory. If you want a "recent" or "frequent" section, add it as a separate group above a fixed list.

## 19. Background patterns: a quiet dot grid

A clean surface with a faint dot grid reads as organized and calm. That is a matter of taste, but there are concrete reasons it works:

- **It implies a grid without drawing one.** The eye joins evenly spaced dots into rows and columns, so structure is felt without lines to read. A line grid states the structure loudly; a dot grid suggests it.
- **It is almost all empty space.** In Rams' sense of "less, but better," it is close to the least design that still gives the eye something to hold onto.
- **It gives anchor points.** An empty canvas reads as ready for organized work, not blank.
- **It is even.** Same spacing, same weight, no focal point, so nothing competes with what is placed on top.

Dot grids are a common default for canvases and node editors. React Flow's background component, used by many node-graph tools, defaults to dots spaced 20 px apart with a 1 px radius, and also offers lines and crosses. It lets several backgrounds be layered, for example a fine grid with a stronger line every tenth step.

Rules for using one:

1. **Barely visible.** The dots sit a step or two off the background color. Check light and dark mode separately.
2. **Snap to the spacing scale.** If the scale is built on 8 px, space the dots 16 or 24 px apart, so anything placed on the canvas lines up with them.
3. **Open space only.** Use it on canvases, boards, empty states, and landing screens. Behind dense text or tables it becomes texture people have to read through.
4. **Scale with zoom.** On a zoomable canvas, fade or thin the dots as the view zooms out, or they turn into a gray haze.
5. **Never compete with the work.** A focus mode may keep it or drop it, but it is always the quietest thing on screen.

## 20. Design the whole journey, not only the main screen

Everything above is about screens. IBM Carbon's "Universal Experiences" framework adds the other axis: the moments a person goes through with a product over time. Each moment has its own goal, its own mindset, and something to measure. Designing them as one connected path is what makes a product feel like one product instead of a set of screens.

### The nine moments

| Moment | Goal |
| --- | --- |
| Discover | Find the product and judge whether it is worth it. |
| Learn | Understand how it helps before committing. |
| Try | Get real value quickly with minimal risk. |
| Buy | Commit without losing momentum. |
| Onboard | Get set up correctly and reach first value fast. |
| Use | Fit it into regular work and grow into deeper features. |
| Get help | Fix problems quickly without leaving the product. |
| Expand | Unlock more value as needs grow. |
| End use | Leave cleanly, with data and trust intact. |

Not every product has every moment. A free local tool has no Buy. But asking "what is this person thinking at this moment, and what would make it easy?" for each one finds gaps that screen-level design misses.

### Time to value and the "aha" moment

The core idea is the aha moment: the point where the person sees the product solve their real problem. Onboarding exists to get there, and everything in it should point at it.

- Give a clear next step at every point, so people always feel guided and never lost.
- Each onboarding step answers one question:

| Step | The person's question |
| --- | --- |
| First launch | Where do I begin? |
| Complete setup | Am I ready to use this? |
| Connect and deploy | Can my team start using this? |
| First real result | Does this solve my problem? |
| Lasting value | Was choosing this the right decision? |

- Mark the milestone when it happens. Carbon lists celebration and a visible success milestone as onboarding touchpoints.

Carbon's own targets, which are IBM's numbers for its products and useful as a sense of scale:

- Trial aha moment in under 10 minutes, reached by more than 60% of trial users.
- A usable environment under 3 minutes after purchase. Setup completed by more than 90%.
- Basic features adopted within 72 hours of the aha moment, by at least 60% of new users. At least 40% adopt one intermediate or advanced capability within 30 days. At least 85% of those still active after 90 days.
- Problems solved through self-service in under 15 minutes, with a 95% self-service resolution rate.

The point is not those exact numbers. It is that each moment has a time and a completion rate someone is watching.

### What each later moment asks of the interface

- **Use.** The product stays dependable as people move from basic to advanced features. Updates and fixes keep confidence instead of breaking habits (principles 5 and 8).
- **Get help.** Help is in the flow of work: in context, searchable, with an assistant and a path to a person, without leaving the product. A stop or failure that explains itself (principle 13) is the first layer of help.
- **Expand.** More capability is suggested when the person's own behavior shows they need it, not on a timer. Calm technology's rule applies: inform, do not nag (principle 7).
- **End use.** Leaving is clear and simple: data can be exported, migrated, or deleted, and the person knows exactly what happens to it. A respectful exit is what makes coming back possible.

### How this connects

- First impressions (principle 16) are the first two onboarding steps. Helmor's live status checks and fixed first-run window are an implementation of "a clear next step at every point."
- Focus modes, the command palette, and stable layout are what make the Use stage hold up over months.
- Show the real state (principle 11) and a stop is a handoff (principle 13) are most of Get help.

## Anti-patterns

- Panels that appear only on hover, or float over the work, for tools people use all day.
- A separate control bar repeated under every panel.
- Actions that live in different places on different screens.
- Two palettes for two kinds of command.
- A status badge inferred from output with no hysteresis and no way to find false readings.
- One chat scroll as the only view of parallel agent work.
- A prompt that says "do not do X" where X could simply not be offered.
- A refusal or failure that does not say why, or where to pick it up.
- Icons doing the job of labels, colored icon backgrounds, and borders that separate nothing.
- Changing muscle memory repeatedly in small steps.
- A new layout for every feature instead of a fixed set of regions.
- Borders and cards that cut across groups that spacing already made.
- More than three text sizes on one screen, or ranking by many colors.
- One-off pixel values for spacing instead of a scale.
- Compact density on one page and comfortable on the next.
- Alphabetical order by default, and lists that reorder themselves.
- Designing the main screen and leaving onboarding, help, and leaving to chance.
- An onboarding flow with no clear next step, or one that does not lead to a first real result.
- Help that sends people out of the product to find an answer.
- Upgrade prompts on a timer instead of when behavior shows a need.
- No clean way to export data and leave.

## Checklist for any screen

1. What is the person's work on this screen, and does it have the most space and the most contrast?
2. Which controls are used every session? Is everything else one step away, with a visible way to reach it?
3. Is every action on this screen also in the command palette, with its shortcut shown?
4. Is the same action in the same place as on every other screen?
5. Can the panels be collapsed on purpose, and does nothing move on its own?
6. Is status a small mark at the edge until a person is needed?
7. Is each status reported by the system, or guessed? If guessed, is it damped?
8. For anything an agent does: is there a plan, a receipt, an undo, and a gate set by risk?
9. When something stops, does it say why and what would let it continue?
10. Which icons, borders, and colors can be removed without losing meaning? Checked in light and dark mode?
11. Is there a focus mode for the main kind of work here, with one key in and out, and does an urgent item still reach the person?
12. Does every component sit in the region meant for its kind of job: navigation, work, inspector, drawer, or toolbar?
13. Are groups made by spacing first, and does every border or card agree with that spacing?
14. Are there at most three text sizes, and is every gap a value from the spacing scale?
15. Does the screen follow the product-wide density mode?
16. Is every long list ordered by use, workflow, or a natural sequence, and does its order stay put?
17. If there is a background pattern, is it barely visible, aligned to the spacing scale, and kept out from behind dense text?
18. Which journey moment is this screen for (discover, learn, try, onboard, use, get help, expand, end use), and does it serve that moment's goal?
19. On a first run, is there always one clear next step, and how long until the person gets a first real result?
20. When something goes wrong here, can the person get help without leaving, and can they always export their data and leave cleanly?

## References

**Feature-heavy products that simplified**

- Linear, "A calmer interface for a product in motion" (March 2026): https://linear.app/now/behind-the-latest-design-refresh
- Linear, UI refresh changelog (12 March 2026): https://linear.app/changelog/2026-03-12-ui-refresh
- Linear, "How we redesigned the Linear UI (part II)": https://www.linear.app/now/how-we-redesigned-the-linear-ui
- Agent Wars, how two engineers used AI coding agents for Linear's refresh: https://agent-wars.com/news/2026-03-13-how-two-engineers-used-ai-coding-agents-to-overhaul-linears-ui
- Figma, "Inside the redesigned Figma, where your work takes center stage": https://www.figma.com/blog/behind-our-redesign-ui3/
- Figma, "Our approach to designing UI3": https://www.figma.com/blog/our-approach-to-designing-ui3/
- Figma, "Making the move to UI3": https://www.figma.com/blog/making-the-move-to-ui3-a-guide-to-figmas-next-chapter/
- Figma Help, "Navigating UI3": https://help.figma.com/hc/en-us/articles/23954856027159-Navigating-UI3
- Config 2024 talk notes, "How we redesigned Figma": https://lilys.ai/en/notes/144841

**TradingView**

- "Introducing new bottom toolbar in a multi-chart layout" (2019): https://www.tradingview.com/blog/en/new-bottom-toolbar-in-multichart-layout-11245/
- "The new chart legend redesign" (2019): https://www.tradingview.com/blog/en/the-new-chart-legend-redesign-14700/
- "New chart layout patterns" (2024): https://www.tradingview.com/blog/en/new-chart-layout-patterns-45487/
- TradingView Desktop release notes: https://www.tradingview.com/support/solutions/43000673888-tradingview-desktop-releases-and-release-notes/
- Desktop theme management and customizable tabs: https://www.tradingview.com/blog/en/in-app-theme-management-and-customizable-tabs-in-tradingview-desktop-32720/
- Advanced Charts customization and featuresets: https://www.tradingview.com/charting-library-docs/latest/customization/
- "We've got a new look and feel" (2021 rebrand): https://www.tradingview.com/blog/en/major-update-we-ve-got-a-new-look-and-feel-25469/
- ScreensDesign mobile UI breakdown: https://screensdesign.com/showcase/tradingview-track-all-markets
- Medium case study on paper trading (outside critique): https://medium.com/@kanishk.chauhan.fs09/redesigning-paper-trading-on-tradingview-mobile-a-ux-case-study-7de86f3893c7
- Rondesignlab concept redesign (an agency's own concept; its numbers are marketing): https://rondesignlab.com/cases/tradingview-platform-for-traders

**Minimalism and focus modes**

- Vitsoe, Dieter Rams, "The power of good design" (ten principles): https://www.vitsoe.com/site/download/1698/The%20power%20of%20good%20design.pdf
- Rams Foundation, Rams' theses on the ten principles: https://rams-foundation.org/foundation/design-comprehension/theses/
- Rams Foundation, Tokyo Manifesto ("less is only more if it is also better"): https://rams-foundation.org/foundation/design-comprehension/tokyo-manifesto/
- VS Code, the original Zen Mode issue and first implementation: https://github.com/microsoft/vscode/issues/12940
- XDA, VS Code Zen Mode as a writing environment: https://www.xda-developers.com/vs-code-is-best-writing-app-ive-used-not-written-a-line-of-code/
- iA Writer, Focus Mode: https://ia.net/writer/support/editor/focus-mode
- iA, "Separate writing and formatting": https://ia.net/topics/separate-writing-and-formatting
- iA, "Writer vs. Word": https://ia.net/topics/writer-vs-word

**Patterns and principles**

- Nielsen Norman Group, "Progressive disclosure": https://www.nngroup.com/articles/progressive-disclosure/
- Interaction Design Foundation, progressive disclosure: https://ixdf.org/literature/topics/progressive-disclosure
- Superhuman, "How to build a remarkable command palette": https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/
- Retool, "Designing the command palette": https://retool.com/blog/designing-the-command-palette
- Destiner, "Designing a command palette": https://destiner.io/blog/post/designing-a-command-palette/
- Calm Technology principles: https://calmtech.com/
- Amber Case, "Principles of calm technology": https://www.caseorganic.com/post/principles-of-calm-technology

**Layout, grouping, hierarchy, spacing, density, and ordering**

- Apple Human Interface Guidelines, "Split views": https://developer.apple.com/design/human-interface-guidelines/split-views
- Apple Human Interface Guidelines, "Layout" (version comparison): https://developerguidelines.com/human-interface-guidelines/version/21/layout/
- Apple, `NSSplitViewController` (sidebar and inspector toggles): https://developer.apple.com/documentation/appkit/nssplitviewcontroller
- Nielsen Norman Group, "Proximity principle in visual design": https://www.nngroup.com/articles/gestalt-proximity/
- Nielsen Norman Group, "The principle of common region": https://www.nngroup.com/articles/common-region/
- UX by Example, "Gestalt: proximity vs common region": https://uxbyexample.co.uk/entries/gestalt-proximity-vs-common-region/
- Laws of UX, "Law of proximity": https://lawsofux.com/law-of-proximity/
- Nielsen Norman Group, "Visual hierarchy in UX: definition": https://www.nngroup.com/articles/visual-hierarchy-ux-definition/
- Nielsen Norman Group, "5 principles of visual design in UX": https://www.nngroup.com/articles/principles-visual-design/
- Nielsen Norman Group, "Good visual design, explained": https://www.nngroup.com/articles/good-visual-design/
- Nielsen Norman Group, visual design study guide: https://www.nngroup.com/articles/visual-design-in-ux-study-guide/
- IBM Carbon, "2x Grid": https://www.carbondesignsystem.com/building-blocks/foundations/2x-grid/overview
- IBM Carbon, "Spacing": https://www.carbondesignsystem.com/building-blocks/foundations/spacing/overview
- Cloudscape (AWS), "Content density": https://cloudscape.design/foundation/visual-foundation/content-density/
- SAP Fiori, "Content density (cozy and compact)": https://www.sap.com/design-system/fiori-design-web/v1-108/foundations/visual/cozy-compact
- Material Design, "Applying density": https://m2.material.io/design/layout/applying-density.html
- Google Design, "Using Material density on the web": https://medium.com/google-design/using-material-density-on-the-web-59d85f1918f0
- Matthew Ström, "UI density" (archived): https://ghostarchive.org/archive/YVqbA
- Nielsen Norman Group, "Top 3 IA questions about navigation menus": https://www.nngroup.com/articles/ia-questions-navigation-menus/
- Nielsen Norman Group, "Alphabetical sorting must (mostly) die": https://www.nngroup.com/articles/alphabetical-sorting-must-mostly-die/
- Nielsen Norman Group, "Mega menus work well for site navigation" (group sizing and ordering): https://www.nngroup.com/articles/mega-menus-work-well/
- BASIS design system, "Contextual menu" (frequency order, destructive last): https://design.basis.com/components/contextual-menu

**User journey (IBM Carbon Universal Experiences)**

- Universal Experiences overview: https://www.carbondesignsystem.com/building-experiences/overview
- Onboard (aha moment, key moments, targets): https://www.carbondesignsystem.com/building-experiences/onboard
- Use: https://preview.carbondesignsystem.com/building-experiences/use
- Get help: https://preview.carbondesignsystem.com/building-experiences/get-help
- Expand: https://preview.carbondesignsystem.com/building-experiences/expand
- End use: https://www.carbondesignsystem.com/building-experiences/end-use

**Background patterns**

- React Flow, `Background` component (dots, lines, cross; dots by default): https://reactflow.dev/api-reference/components/background

**Agent interfaces (newer sources; use as checklists, not authority)**

- HCI Nerdz, "Seeing parallel agents as a task grid": https://hci-nerdz.github.io/blog/seeing-parallel-agents-as-a-task-grid/
- Setproduct, "16 AI agent UI design patterns for plans, approvals and undo": https://www.setproduct.com/blog/ai-agent-ui-design-patterns
- Hatchworks, "Agent UX patterns": https://hatchworks.com/blog/ai-agents/agent-ux-patterns/
- SmartScope, Antigravity architecture and its approvals inbox: https://smartscope.blog/en/generative-ai/google-gemini/antigravity-architecture-deep-dive/
- HarnessRouter, "What is a System One harness?": https://harnessrouter.ai/blog/what-is-a-system-one-harness

**Products worth studying directly**

- Daintree (many coding CLIs in one grid, one action list, command bar): https://github.com/daintreehq/daintree
- KLIDE (Mission Control session board, hook-based status): https://github.com/pierreprudh/KLIDE
- Sinew (bottom terminal drawer): https://github.com/Paseru/sinew
- Helmor (first-run onboarding): https://github.com/dohooo/helmor
- Buzz (landing page, agents as members of a channel): https://github.com/block/buzz
- Berd (free-placement canvas home): https://github.com/block/berd
- Zed (agent panel, markdown editor with synced preview): https://github.com/zed-industries/zed
- System One Harness (menus instead of prompts, risk gates): https://github.com/HarnessRouter/SystemOneHarness
- Hypha (durable runs, human-review handoff): https://github.com/CodeSoul-co/Hypha
