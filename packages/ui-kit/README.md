# @galley/ui-kit

Galley's design system: the typewriter-inspired design tokens, the Onionskin and
Carbon themes, and the shared Svelte components.

## What's inside

- **Tokens & themes** — `tokens.css` (primitive palette + type/spacing/radius/motion
  scales), `themes.css` (the semantic role tokens per theme), and `syntax.css` (the
  editor syntax theme). Import everything at once via `@galley/ui-kit/styles.css`.
- **Primitives** — `Logo`, `Wordmark`, `Button`, `IconButton`, `Toggle`,
  `SegmentedControl`, `Panel`, and `Icon`.
- **Helpers** — theme metadata and `resolveTheme`, the pane `layout` model, and WCAG
  `contrast` utilities.

```ts
import '@galley/ui-kit/styles.css';
import { Button, resolveTheme } from '@galley/ui-kit';
```

Theme is applied by setting `data-theme="onionskin" | "carbon"` on the document
element; every component reads the semantic tokens, so the switch is instant.

## Develop

```bash
pnpm --filter @galley/ui-kit test        # unit + component tests at 100% coverage
pnpm --filter @galley/ui-kit storybook   # browse the primitives in Storybook
```
