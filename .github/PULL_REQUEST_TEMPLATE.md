## What does this change?

<!-- A sentence or two. Link the request-board idea or issue it addresses. -->

## Type

- [ ] New tool
- [ ] Improvement to an existing tool
- [ ] Bug fix
- [ ] Docs / tests / tooling

## Checklist

- [ ] Logic is in `packages/core`, pure, and unit-tested (edge cases and bad input included)
- [ ] No network calls: tool input never leaves the device
- [ ] Errors are understandable by non-developers; copy is honest about limitations
- [ ] Keyboard accessible, labelled, readable in light and dark themes, usable at ~360px wide
- [ ] Design rules ([docs/design-language.md](../docs/design-language.md)): shared components and tokens only; no gradients, glows, blur, pill badges, purple or orange; marker (lime) only behind ink text
- [ ] `npm run lint && npm run typecheck && npm test` pass
- [ ] `npm run docs:tools` run if a tool was added or renamed
- [ ] `npm run e2e` run if UI, routing, headers or file handling changed

## Screenshots

<!-- Light and dark, for UI changes. `npm run screenshots` can produce them for the pages you touched. -->
