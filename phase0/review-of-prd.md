Findings

  1. High: The zoom model depends on browser behavior the app does not control (PRD.md:16, PRD.md:131, PRD.md:201). The
     spec says browser Ctrl+/- “adjusts a multiplier” on root font size, but browser zoom is user-agent controlled and
     inconsistent across browsers. That makes a non-negotiable requirement depend on an implementation detail you cannot
     reliably own. This should be rewritten as either “native browser zoom is supported” or “the app provides its own
     zoom controls/hotkeys.”
  2. High: The build step mutates the source file during normal builds, which is a bad fit for --watch mode (PRD.md:247,
     PRD.md:263). Writing IDs back into the Markdown on rebuild is likely to create watch-loop churn, constant dirty-
     file noise, and unpleasant editor behavior. Stable IDs are the right goal, but the PRD needs an explicit one-time
     initialization flow or a sidecar strategy instead of silent source mutation on every build path.
  3. High: The core layout algorithm is underspecified even though navigation depends on it (PRD.md:24, PRD.md:26,
     PRD.md:30, PRD.md:97, PRD.md:185). You define a “column-major grid,” mixed chunk widths, left-margin notes, and
     right-margin expansions, but not the actual placement/collision rules that make “next chunk in current column”
     deterministic. That leaves camera targeting, scrubber order, and deep-link stability open to interpretation. The
     warning about deep expansion nesting (PRD.md:256) is a symptom of the same problem.
  4. Medium: The Markdown extensions need a real parsing contract, not just marked plus cleanup passes (PRD.md:82,
     PRD.md:84, PRD.md:86, PRD.md:242, PRD.md:248). > note: collides with ordinary blockquotes, ![](fig-id){.wide} is
     not standard Markdown, and the custom fenced directives are central to rendering. Without specifying whether these
     are parsed pre-Markdown, via custom tokenizers, or via an AST transform, the implementation will drift into brittle
     regex behavior.
  5. Medium: The linter treats genuinely broken content as warnings only (PRD.md:252, PRD.md:253, PRD.md:258). A missing
     chunk ID or dead image reference is not an advisory issue; it breaks deep-links, speaker sync, and/or rendering.
     Those should be hard build failures. Keep compositional rules like density budget as warnings, but promote
     integrity failures to errors.
