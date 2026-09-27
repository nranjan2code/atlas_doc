# Contributing to Atlas

Thank you for your interest in contributing to Atlas! Atlas is an open-source, read-only developer portal and workspace discovery engine designed for humans and AI agents.

## Core Tenet: Pure Read-Only & Untrusted Workspace

Atlas strictly treats all workspace-derived metadata and file contents as **untrusted data**. 
- **Never execute workspace code**: Under no circumstances should Atlas execute scripts, binaries, or evaluate code found within indexed repositories.
- **Never mutate the indexed workspace**: Atlas is strictly read-only. No file writing, editing, moving, or deleting within the target workspace.
- **Maintain snapshot immutability**: Admitted bytes belong to an immutable in-memory snapshot, preventing time-of-check to time-of-use (TOCTOU) file swap vulnerabilities.

## Development Setup

### Prerequisites

- **Node.js**: `>= 20.9.0`
- **pnpm**: `>= 10.0.0` (or enable via `corepack enable`)

### Getting Started

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/nranjan2code/atlas_doc.git
   cd atlas_doc
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Run the development server against a workspace:
   ```bash
   pnpm atlas /path/to/target-workspace
   ```
   Or run Next.js in dev mode:
   ```bash
   pnpm dev
   ```

## Local Validation Gate

Before opening a pull request or submitting code, ensure that the entire validation gate passes cleanly:

```bash
pnpm check        # Runs TypeScript typecheck (tsc --noEmit) and automated test suite
pnpm build        # Validates production Next.js compilation
pnpm audit --prod # Audits production dependencies for security advisories
```

## Testing Guidelines

The test suite in `scripts/test.mjs` verifies discovery, security sandboxing, search, symbol extraction, and API contracts.

- **New Formats, Extractors, or Profiles**: Any change adding a file format, language renderer, AST symbol extractor, or workspace profile must include test fixtures covering discovery, presentation, and API endpoints.
- **Filesystem & Git Access**: Any change modifying filesystem access, traversal, or Git invocation must include adversarial tests (e.g., path traversal, symlink swaps, oversized inputs, and malicious Git configurations).

## Pull Request Guidelines

1. Create a feature branch: `git checkout -b feature/my-improvement`.
2. Ensure commit messages are descriptive and concise.
3. Verify all tests and lints pass (`pnpm check && pnpm build && pnpm audit --prod`).
4. Submit a Pull Request with a clear description of the problem solved and the tests added.
