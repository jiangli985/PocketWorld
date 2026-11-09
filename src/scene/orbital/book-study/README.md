# Book structure study

Local preview: `/book-study.html`. This is an isolated prototype with sample text, not the journal editor. Existing journal data is neither loaded nor written.

The page mechanism uses Three.js bone chains and skinned meshes: each leaf remains in the scene, including when it settles into a stack. A curved binding distributes the sewn edges; separate rigid boards attach to flexible case cloth. Paper cut surfaces derive directly from the leaf profiles. There are 32 leaves (64 printed pages).

Technical reference: [Wawa Sensei's animated book](https://github.com/wass08/r3f-animated-book-slider-final), particularly the technique of using a bone chain along the width of each sheet. This study contains original implementation and canvas artwork; source code and image assets from that repository have not been copied.

Run `node --test src/scene/orbital/book-study/model.test.mjs` for sheet order, thickness clearance, width preservation and board placement checks. Browser checks cover the rendered skeletons, forward/backward turns, cover sequencing and narrow screens.

The production journal now uses this same engine through `JournalBinding.tsx`. Native textareas handle editing and IME; their text, selection and caret are drawn onto the leaf textures. Small native button targets follow the curved weather icons and page arrows. Page textures are created when needed and shared through the journal provider, rather than generating 64 unique textures for each inactive book.

The geometry remains an animated approximation, not a paper physics simulation or collision solver. Extreme viewing angles, paper-edge shading and device memory/performance can still be improved.
