# Reader refinement — September 2026

The core loop is choose an issue → find something worth reading → read comfortably → move elsewhere without losing your place. The cover index, issue entrance, and reading surface should each do one job well.

## Findings and changes

1. **The splash made the act of reading secondary on phones.** Its tall cover and long copy pushed the action below the fold. Keep the cinematic entrance, but use a smaller mobile cover, a persistent Read / Contents action strip, and generous, restrained typography. Charcoal, white, and Atlantic red replace the green-and-gold palette. Preserve the existing cover transition and reduced-motion behavior.
2. **The reader showed choices that usually did nothing.** Article view exists for only three prepared pieces, yet the old selector appeared everywhere with a disabled half. Show it only where available; put that choice in reading settings on mobile.
3. **Two unlabeled arrow pairs mixed story and page navigation.** Label the story controls and keep the current story tappable. Contents remains a named action in the header; printed page navigation lives in the lower row.
4. **A fitted print page is not comfortable phone-sized text.** Put Enlarge beside page navigation. It uses existing print-column detection; visible column controls make the next column accessible without reopening settings. Pinch adjusts magnification and horizontal swipes at Fit turn pages. The publication retains its original layout; this is not a claim of full text reflow for every story.
5. **Small targets and inputs made the mobile interface fragile.** Use 44px primary targets, 16px search/page input text, safe-area padding, and a bottom reading-settings sheet. Keep search and story lists vertically scrollable inside their own bounded surface.
6. **The user's place is more valuable than a flourish.** Retain resume, saved pages, preview, detour return, search, direct story destinations, and classic page curl. Do not add new collections, recommendation rails, slogans, or tutorial panels.

## Research basis

- [Apple Books: reading on iPhone](https://support.apple.com/en-euro/guide/iphone/iphc1af7c57/ios) separates contents, bookmarks/search, and reading appearance, and supports returning to a prior location. Our inference: keep navigation close to reading, while settings remain secondary.
- [Apple HIG: Modality](https://developer.apple.com/design/human-interface-guidelines/modality) describes dedicated modes that require explicit dismissal. Our inference: avoid introducing extra modal steps to reach a story; keep one Contents overlay and a clear return path.
- [W3C: Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) defines a 24 CSS pixel minimum with exceptions. We choose 44px for primary controls to give touch users more margin; 44px is our design target, not a claim that this WCAG criterion requires it.
- [W3C: Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) describes interfaces adapting at 320 CSS pixels, while accounting for content that inherently needs two dimensions. Archive and controls should reflow; the print facsimile remains independently zoomable. A full accessible text edition of all stories would be a separate, substantial editorial-data project.
- Atlantic typography, wordmark, restrained rules, and red derive from the existing WWW design-system extraction documented in README.md. This is an independent editorial prototype, not production parity.

## Verification boundary

Archive integrity, story destinations, folio exceptions, saved places, pinch math, and curl geometry are covered by 23 targeted tests. TypeScript and the static build are checked. The in-app browser verified 320px and 390px layouts, search-to-story navigation, column enlargement, and the splash action placement. Physical touch/trackpad feel is not established by automated tests. Safari is excluded at the user's request.
