# Sharp edges

Should interface corners be rounded or square? This note collects the research, the products that chose each way, the trend writing, and the rules that hold either way. It is a companion to [DESIGN-PHILOSOPHY.md](DESIGN-PHILOSOPHY.md).

The short answer: there is a real move toward square or nearly square corners, mostly in dense professional tools. The perception research points the other way: people generally prefer curves. Both are true. Which one applies depends on the product, so the decision is a design-system choice, not a fashion.

## What the research says

### People prefer curves

Moshe Bar and Maital Neta, "Humans Prefer Curved Visual Objects," *Psychological Science* 17(8), August 2006, pages 645–648.

- Participants saw pairs of emotionally neutral objects and abstract patterns that differed only in contour: curved versus sharp-angled. Images were shown briefly (about 84 ms) to capture the immediate reaction.
- They liked the curved items about 67.2% of the time and the sharp-angled ones about 50.6%.
- Curved items were also preferred over control items that mixed curved and sharp elements.
- The authors' hypothesis: sharp transitions in a contour convey a sense of threat, consciously or not, and that triggers a negative bias. They cite older work in which jagged human figures were rated as more aggressive.

### Sharp objects activate the amygdala more

Bar and Neta, "Visual elements of subjective preference modulate amygdala activation," *Neuropsychologia*, 2007.

- In an fMRI study, the amygdala, a brain structure involved in fear processing and arousal, was significantly more active for everyday objects with sharp corners (for example, a sofa with sharp corners) than for curved versions of the same objects.
- The activation was tied to the sharp shapes, not to whether the person said they liked them.
- The authors conclude that contour can create a preference bias independent of meaning, possibly as a fast early-warning signal.

### The open question: liking curves or disliking angles?

Gómez-Puerto, Munar, and Nadal, "Do observers like curvature or do they dislike angularity?," *British Journal of Psychology*, 2015 (review).

- The preference for curvature has been replicated across cultures, including in Spain and with a Ghanaian population.
- It is not settled whether people like curves or dislike angles.
- The amygdala also responds to positive and attractive stimuli, so its activation is not proof of fear.

### What the research does not show

These studies used physical objects and abstract shapes, not interface elements. None of them compared a 0 px button corner with a 2 px or 4 px one, or measured speed or accuracy in a dense tool. They support "curves feel friendlier." They do not settle whether a dense desktop tool should round its buttons.

## Products that chose square corners

### IBM Carbon design system

Carbon is the best-known design system that defaults to 0 px corners.

| Element | Radius |
| --- | --- |
| Buttons, inputs, cards, dropdowns, tiles | 0 |
| Tags and badges | 2 px |
| Tooltips and popovers | 4 px |
| Modals and notifications (v11 and later) | 8 px |
| Toggle pills | fully rounded |

- Carbon sets `border-radius: 0` on buttons explicitly. In 2017 a Chromium change began giving all buttons a default 4 px radius. Carbon's answer was that its button mixin already forces 0, and the only way to change it is to override the radius variable.
- The visual character is described as geometric, structured, and information-dense: sharp corners, grids, IBM Plex type, thin 1 px rules, and depth from layered background colors rather than shadows.
- The practical reason, from people who have tried to change it: many Carbon components place buttons edge to edge with each other and with the container (a modal's footer, for example). Rounding the buttons makes those groups look broken, and then every layout that uses them has to change.
- IBM's icon guidelines follow the same logic: a 2 px radius only where the object's real shape needs it, square arrow tips, and no forced rounding.

### webconsulting.at

A web studio that moved its site and its own tools to 0 px corners and wrote down why:

- Rounded corners waste space in compact components. Content needs extra padding, and overlaps can happen.
- Square geometry is predictable, so visual quality has to come from typography, spacing, and contrast.
- Implementation: every radius token set to 0, plus a CSS layer that overrides any component that still brings its own rounding. Diagrams and charts follow the same rule. New components start at 0, and exceptions need a reason.
- Their template product for other people keeps radius as a theme setting (none, small, medium, large, full), the same model as the shadcn/ui theme editor. One attribute on the page drives every component with no rebuild. For their own site, 0 is the rule. For customers, it is a setting, not a dogma.

## Trend writing (opinion, not evidence)

- Setproduct, 2026 field guide to retro and brutalist UI: brutalism means exposed structure, hard borders, system fonts, high contrast, and zero radius. Its best line is a warning: the look is the easiest to fake, the product still has to work, and you should use it only when you have something to say, not because you are bored of clean.
- Viton13, "Why brutal clarity is replacing soft minimalism": premium interfaces moving toward sharper type, stronger contrast, and editorial hierarchy instead of generic rounded cards.
- Medium, "Return of the sharp corners": a shift to crisp corners of about 2–4 px rather than pure 0, read as a signal of professionalism now that people no longer need interfaces to look friendly to learn them. It notes component libraries reducing their default radii and moving away from pill shapes.
- Lucky Graphics, "Neo-Brutalism 2026": argues sharp edges give "visual friction" so people can tell where they act. It claims 40% faster task completion with no source. Do not cite that number.

## The other direction

Rounding is not going away. Two of the most influential recent redesigns moved toward it:

- **Apple Liquid Glass (2025).** Controls, toolbars, and navigation became rounded, floating shapes that sit concentric with the rounded corners of the hardware and the window. Apple's argument is that rounded shapes match the geometry of fingers and feel friendly to touch. SwiftUI added `ConcentricRectangle` to make nested corners line up automatically: an inner corner's radius is the container's radius minus the distance between them, and it becomes square when that distance is larger than the container's radius. A minimum radius can be set so it stays rounded.
- **Linear's 2026 refresh.** Borders and separators were rounded and softened to give structure without clutter, the opposite of squaring.

## How the split falls

| Context | Usual choice | Why |
| --- | --- | --- |
| Consumer, touch, onboarding, marketing | Rounded | Friendlier, matches rounded hardware and fingers, supported by the preference research |
| Dense desktop tools, data, enterprise, terminals | 0 px or 2–4 px | Saves space, predictable geometry, elements sit edge to edge, reads as precise |
| Brand-driven sites | Either, on purpose | Square as a deliberate identity (IBM) or as brutalist expression |

## Rules that hold either way

1. **Radius is one token.** Define it once and drive every component from it, so the decision can change with one setting. Webconsulting and shadcn/ui both do this.
2. **0 px where things touch.** Buttons that share an edge with each other or with the container, split panes, and tiles in a grid should be square, or the gaps look like mistakes. This is Carbon's practical reason.
3. **Nested corners are concentric.** If an element sits inside a rounded container, its radius is the outer radius minus the padding. A same-size radius inside a rounded box looks wrong. Apple formalized this.
4. **Small elements get small radii.** In a dense tool, 2–4 px reads as precise without feeling hostile. Pills are for tags and toggles, not for every button.
5. **Quality comes from type, spacing, and contrast.** Square corners remove one source of softness, so those three have to carry the design.
6. **Check both themes.** Removing borders or rounding changes contrast differently in light and dark mode.
7. **Do not cite the brain research for interface corners.** It is about objects and abstract shapes, not 2 px button corners.

## References

**Research**

- Bar and Neta (2006), "Humans Prefer Curved Visual Objects," *Psychological Science*: https://www.psychologicalscience.org/journals/psychological-science/j.1467-9280.2006.01759.x/
- Same paper, PDF: https://www.moshebar.org/_files/ugd/a77db7_5598c791a95a4436960eb2fe671ca1e5.pdf
- Same paper, Academia.edu: https://www.academia.edu/74092885/Humans_Prefer_Curved_Visual_Objects
- Bar and Neta (2007), "Visual elements of subjective preference modulate amygdala activation": https://pubmed.ncbi.nlm.nih.gov/17462678/
- "Do observers like curvature or do they dislike angularity?" (2015 review): https://pubmed.ncbi.nlm.nih.gov/25871463/

**Square-corner systems**

- Carbon, "Explicitly make `border-radius: 0` on buttons" (issue #285): https://github.com/carbon-design-system/carbon/issues/285
- Carbon radius tokens summarized: https://github.com/cuellarfr/design-skills/blob/main/skills/design-elevation/references/carbon-design-system.md
- IBM site design notes (flat geometry, 0 px corners): https://www.webdesignhot.com/design.md/ibm/
- Carbon users on changing the button radius: https://www.reddit.com/r/userexperience/comments/1boaxhn/ibm_design_system_how_much_can_i_style/
- IBM Design Language, UI icon design: https://www.ibm.com/design/language/iconography/ui-icons/design/
- webconsulting, "Saying goodbye to rounded corners": https://www.webconsulting.at/en/blog/abschied-von-rounded-corners

**Trend writing**

- Setproduct, "Retro and brutalist UI design: a 2026 field guide": https://www.setproduct.com/blog/retro-brutalist-ui-design-2026
- Viton13, "Why brutal clarity is replacing soft minimalism": https://viton13.com/journal/global-why-brutal-clarity-is-replacing-soft-minimalism-in-premium-digital-design
- Medium, "The design story: return of the sharp corners": https://medium.com/@shikharsingh03/the-design-story-return-of-the-sharp-corners-12c080314125
- Lucky Graphics, "Neo-Brutalism 2026" (unsourced claims): https://lucky.graphics/learn/neo-brutalism-2026/

**Rounded direction**

- Apple, "Apple introduces a delightful and elegant new software design" (Liquid Glass): https://www.apple.com/newsroom/2025/06/apple-introduces-a-delightful-and-elegant-new-software-design/
- Apple, "Meet Liquid Glass" (WWDC25): https://developer.apple.com/videos/play/wwdc2025/219/
- Nil Coalescing, "Corner concentricity in SwiftUI on iOS 26": https://nilcoalescing.com/blog/ConcentricRectangleInSwiftUI
- `ConcentricRectangle` documentation: https://apple-docs.everest.mt/docs/swiftui/concentricrectangle/
- `concentric(minimum:)` documentation: https://apple-docs.everest.mt/docs/swiftui/edge/corner/style/concentric(minimum:)/
- Linear, "A calmer interface for a product in motion": https://linear.app/now/behind-the-latest-design-refresh
