# Block file, card anatomy, card-unit API, quick-create

## Block file (`src/blockfile/`)

The aff/neg side division is enforced by the ProseMirror schema - `doc` content is exactly `"affSection negSection"`.
Both section nodes are `isolating`, so a selection or edit cannot cross the boundary.

Install the schema via the feature-extension seam:
```ts
createEditor({
  binding: { handle, fragment: BLOCK_FILE_FRAGMENT },
  extensions: editorPreset({ extensions: blockFileExtensions }),
});
```

**Gotcha:** Tiptap logs `[tiptap warn] Duplicate extension names: ['doc']` because `blockDocument` overrides the baseline - this is expected and harmless.

The workspace singleton (`src/blockfile-workspace/`) is the first `block-file` document in the registry, found-or-created by `ensureBlockFile(service)`. The block-file screen (`src/screens/BlockFileScreen.tsx`) owns the editor via `useDocumentEditor` and passes it to `BlockFileTocPanel` - it does not use `DocumentEditor` directly (ToC needs the raw editor instance).


### Card node model (`src/blockfile/card.ts`)

A debate *card* is first-class structured content that lives inside a side region, not free-form prose.
`cardExtensions` (the `card` container plus its four region nodes) layers onto a block-file editor through the same shared-preset feature-extension seam as the side schema - append it after `blockFileExtensions`, together with `cardCreate` for the keyboard shortcut: `editorPreset({ extensions: [...blockFileExtensions, ...cardExtensions, cardCreate] })`.

- **One container, four fixed regions.** `card` (node name `card`, the only card node in the `block` group) has content expression `"cardTag cardTagline cardCite cardBody"` - one of each, in order, enforced by the schema exactly like the side division. The four region nodes are deliberately **out of every group** (reachable only by name from the card's content expression), so they can never appear on their own in a section and can never nest.
- **Region content rules.** `cardTag` / `cardTagline` / `cardCite` are `content: "text*"` with `marks: ""` - plain, single-line text with no marks (`text*` is what makes them single-line). `cardBody` is `content: "paragraph+"` - block prose whose text runs carry the shared marks; **bold and highlight apply here, independently and simultaneously on the same run**. `paragraph+` (not `block+`) keeps cards from nesting and keeps headings out of a card body.
- **The tag renders bracketed, stores bare - brackets are CSS, not DOM text.** `cardTag` accepts any free-form token (it is **not** a fixed enum - `[T]`, `[NU]`, `[CP]`, ...); the token is stored without brackets and `cardTag` renders a single content hole (`["span",{"data-card-region":"tag"},0]`, like the tagline/cite regions). The enclosing `[` `]` are **CSS `::before`/`::after`** on `.block-file-editor [data-card-region="tag"]` in `src/index.css`. **Gotcha (data-loss regression, fixed) - never render decorative chrome as a DOM text node beside a region's contentDOM.** The tag originally rendered literal `[`/`]` text nodes flanking an inner `data-card-tag-token` span; those sibling text nodes broke ProseMirror's input reconciliation for the region, so typed characters landed in the contentEditable DOM but never became a transaction - the tag silently accepted nothing and lost the text on reload. jsdom can't type into contentEditable, so `card.e2e.test.ts` (which seeds regions programmatically) never caught it; it only reproduces with real keyboard input in a browser. Keep any purely-visual affordance on a `text*` region in CSS (like the side-region labels), never in `renderHTML`.
- **Minimal CSS, data-attribute hooks.** Each region serializes with `data-card-region="tag|tagline|cite|body"`; the block file ships only the small `[data-card-region="tag"]` bracket pseudo-elements (above) and heading typography, scoped to `.block-file-editor`. Card region *formatting* (family/size/colour/weight) is driven separately by the formatting profile stylesheet (`src/formatting`), not here.
- **`buildCardContent(fields?)`** is a pure document-JSON builder (the seam the quick-create UI/tests use) - every field free-form and optional; its output matches what the schema auto-fills for a bare card (empty text regions, an empty body paragraph via `createAndFill`).
- **Gotcha - inserting a card via `insertContentAt`:** tiptap's `insertContentAt` *validates* content strictly (it does not `createAndFill` the inserted node), so insert a full node from `buildCardContent`, not a bare `{ type: "card" }`. Pass `{ updateSelection: false }` when inserting so the cursor is not placed inside the block-level card. Separately, y-prosemirror emits a one-time `TextSelection endpoint not pointing into a node with inline content (card)` warning if a *reloaded* document **begins** with a card (a non-textblock leading node); tests append cards after the side's leading paragraph to avoid the artificial edge.
- **This slice is schema/model + tests only.** Card-cutting tools come later. `card.test.ts` covers the four-region structure, `createAndFill` auto-fill, the card inside a side region, the free-form tag stored bare (no literal brackets in the serialized document), independent+simultaneous body marks, and a full Yjs round-trip (structure + marks).


### Card-as-a-unit addressability API (`src/blockfile/card-unit.ts`)

The pure query/selection seam that treats a card as an addressable **unit** on top of the card node model - the contract the card-cutting tools (Extract, Send to Block File) and drag-to-speech pipeline target. Re-exported from `src/blockfile`. Like `sideRegionsFromDoc`/`getSideSections`/`buildOutlineTree`, it is a pure derivation of ProseMirror state (no UI, nothing to invalidate); it splits into positional **location** and pure **content reading**.

- **Location.** `cardAt(doc, pos)` is the pure doc-node locator: it resolves `pos` to the enclosing `card` via ancestor walk and returns a `LocatedCard` (`{ node, from, to, regions }`) or `null`; `getCardAt(editor, pos)` is the editor form. `from`/`to` bound the whole card node - `from` is the position immediately before it (the `NodeSelection` anchor), so `[from, to]` is the range a cutting tool replaces/slices. `regions` is a `Record<CardRegionKey, LocatedCardRegion>` (keys `"tag"|"tagline"|"cite"|"body"`, ordered in `CARD_REGION_KEYS`); each region carries its node and its own `from`/`to` (content sits at `[from+1, to-1]`). **Snapshot discipline:** every position is valid only against the document version it was read from - re-derive after edits, same as the outline/side-region/section queries.
  - **Gotcha - out-of-range yields `null`, never throws:** `cardAt` guards a non-integer or out-of-`[0, doc.content.size]` `pos` and returns `null`, so a raw selection position can be passed without pre-validation (unlike `sideRegionsFromDoc`, which throws on a malformed doc).
- **Selection.** `selectCard(editor, pos?)` sets a `NodeSelection` on the whole card (`pos` defaults to the card enclosing the current selection), returning `true`/`false` (no-op) on hit/miss. It sets the selection only - **it does not focus** - so it composes with a tool that immediately transforms the selection. `getSelectedCard(editor)` reads "the card I'm working in" off the current selection; it matches both a cursor inside a card *and* a `NodeSelection` on a card (the latter's anchor sits *before* the card, so ancestor resolution alone would miss it - it is handled explicitly).
- **Reading/serialization (pure over a card node, no positions).** `readCardRegionText(card, key)` = one region's flattened text; `serializeCardRegion(card, key)` = one region node's document-JSON (marks preserved - use this for the body, not text); `readCardRegions(card)` = a `CardRegionsSnapshot` (`{ tag, tagline, cite }` as text + `body` as JSON); `serializeCard(card)` = the whole card as one re-insertable JSON node (the Extract/Send payload). All throw a clear error if handed a non-`card` node.
- **Tests:** `card-unit.test.ts` drives the locator from positions found by an *independent* document walk (never the API under test), and covers: locate-from-body/header, null for preamble/out-of-range/non-integer positions, `cardAt` doc purity, keyed region exposure; `NodeSelection` spanning the whole card + returns-true, miss returns-false-and-no-op, default-to-current-selection, `getSelectedCard` under cursor/node-selection/preamble; per-region text + JSON reads, body-mark preservation through serialization, whole-card snapshot, re-insertable whole-card round-trip, and the non-card throw.


### Quick card creation (`src/blockfile/card-create.ts`)

The one-gesture "new card" command layered on the card node model - the fast, no-dialog affordance a debater uses to drop a fresh, schema-valid card skeleton and start typing immediately. Re-exported from `src/blockfile`.

- **Two seams, one code path.** `insertCard(editor, options?)` is the imperative command (the same plain `(editor, ...) => ...` shape as `section-ops`); the Block File screen's *New card* button and the keyboard shortcut both call it, so there is one creation path. `cardCreate` is a tiny `Extension` carrying **only** the keyboard binding - append it after `cardExtensions` in the shared preset's feature-extension seam (`editorPreset({ extensions: [...blockFileExtensions, ...cardExtensions, cardCreate] })`), which is exactly what `BlockFileScreen`'s preset now does. Without `cardExtensions` in the preset the card node types are not in the schema and creation cannot work - the screen previously shipped `blockFileExtensions` only.
- **`CARD_CREATE_SHORTCUT = "Mod-Shift-c"`** - a `Mod-` chord mirroring the shared marks' shortcut convention (`Mod-b`, `Mod-Shift-h`); `c` is the card mnemonic. The button is inherently keyboard-reachable too (a real `<button>`, Tab + Enter). `BlockFileScreen` renders a platform-aware tooltip (`⇧⌘C` on macOS, `Ctrl+Shift+C` elsewhere) but the binding stays `Mod-Shift-c`.
- **Follows the caret, works in both sides.** `cardInsertPos` reads that a block file is `doc(0) > side(1) > block(2) > ...`, so depth-1 is always the side section and depth-2 the caret's top-level side block; it inserts the card as the **next sibling after that block** (`$from.after(2)`), so the card appears where the debater is working and the side never *begins* with a card (dodging the y-prosemirror leading-node warning). Fallbacks append to a side's `contentEnd`: when a `side` option is forced, or when the caret is not resolvably inside a side (e.g. a fresh unfocused editor - defaults to aff).
- **Cursor lands in the tag, ready to type.** The card opens at the insert position `at`, so `at + 2` is the first text position inside the empty `cardTag` region; `insertCard` inserts with `{ updateSelection: false }` then `setTextSelection(at + 2)` + `focus()` in one chain (one undo step). The next keystroke fills the tag.
- **Tests:** `card-create.test.ts` (unit, `fake-indexeddb`) covers the four-region insert, caret-lands-in-tag (typing flows into the tag), aff-and-neg placement, the explicit-`side` override, field seeding, sibling-after-current-block placement, and the extension registration + shortcut constant. `screens/BlockFileScreen.test.tsx` drives the real routed screen: the *New card* button appears once the editor mounts and one click renders a full card (all four `data-card-region` hooks) in the document.


### Long-document responsiveness (measured; no virtualization)

A season's block file is large, so the scaffold was measured against a representatively large document before shipping any optimization.
**Conclusion: no virtualization or other optimization is warranted now** - revisit only if a real, measured regression appears at realistic sizes.

- **Complexity is the load-bearing evidence, not the clock.** Every query and section op is scoped to *one side's direct children* (`region.node.forEach` in `argument-sections.ts` / `section-ops.ts`) and `sideRegionsFromDoc` touches only the two top-level section nodes, so query and reorder cost is **O(direct children of the side)**. The only inherently document-sized cost is ProseMirror's own parse/render of one large doc on mount - a property of holding the file in a single editor, not of anything this module adds.
- **Measured (`long-document.perf.test.ts`, jsdom - indicative wall-clock).** At 60 sections/side (past a realistic season): all operations linear-or-better and far below any responsiveness threshold. The test's generous ceilings are **smoke alarms for an accidental O(n²) full-document scan**, not tuned thresholds; the complexity argument above is the real guarantee.
- The ToC sidebar has a mirrored precedent (`src/toc/long-document.perf.test.tsx`): the ToC layer adds no document-sized cost of its own, so no memoization or virtualization there either.


### Feature closeout e2e (`src/blockfile/card.e2e.test.ts`)

`card.e2e.test.ts` is the whole-stack closeout for the Card Anatomy & Tag System feature - it spans the three card slices above (node model, card-unit API, quick-create) composed the way `BlockFileScreen` ships them, with no mocks. Over the real document service + `ensureBlockFile` singleton and IndexedDB, it drives the debater's full card lifecycle: `insertCard` (quick-create) → type all four regions → apply bold + highlight **together** on one body run → address the card as a unit (`getCardAt`/`selectCard`/`getSelectedCard`/`readCardRegions`/`serializeCard`), then tears the service down and reopens a **fresh** instance over the same backend to prove the whole card (four regions, every field's text, both coexisting body marks) survived and re-addresses it. Positions that drive the card-unit locator come from an independent document walk, never the API under test - same discipline as `card-unit.test.ts`. Follows the `settings.e2e`/`dashboard.e2e`/`toc-sidebar.e2e` closeout precedent.


