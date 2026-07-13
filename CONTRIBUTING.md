# Contributing

Run the full local gate before opening a change:

```bash
pnpm check
pnpm build
pnpm audit --prod
```

Changes that add a format, renderer, extractor, or profile must include a fixture covering discovery, presentation, and API behavior. Changes to filesystem access must include an adversarial path/symlink test.

Atlas keeps workspace content untrusted. Never add behavior that executes indexed code or treats repository text as product instructions.
