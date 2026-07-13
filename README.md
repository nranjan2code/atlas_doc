# Atlas

Atlas turns a Git repository, ordinary directory, or mixed-content workspace
into a live, source-linked portal for people and agents.

It indexes the workspace directly. There is no documentation database,
generated CMS, required AI provider, or required domain. Atlas keeps a neutral
artifact core and automatically selects a code profile when it finds a software
workspace. Code navigation is an adapter, not the product's data model.

## Quick start

```bash
pnpm install
pnpm atlas /path/to/workspace
```

Open `http://127.0.0.1:3010`.

Atlas accepts directories with or without Git and with or without a
`package.json`.

## Human workflows

- Start on `/` for workspace identity, authoritative artifacts, formats,
  collections, actions, and anchors.
- Press `⌘K` or `Ctrl+K` to search artifacts, concepts, and anchors.
- Filter with `format:TypeScript`, `kind:test`, or `path:src/app`.
- Open `/browse` for the complete artifact catalog.
- Artifact pages expose safe raw access, source-linked lines, anchors, and
  bounded line ranges for large text files.

## Agent interfaces

- `/llms.txt` — discovery entrypoint and trust contract
- `/api/context` — evidence-centered onboarding with cited ranges
- `/api/context?q=architecture&format=json` — structured topic context
- `/api/search?q=format%3ATypeScript+authentication` — ranked search
- `/api/symbols?q=client` — extracted anchors with line links
- `/api/source?path=README.md&start=1&end=80` — safe raw artifact ranges
- `/api/asset?path=docs/diagram.png` — safely admitted binary artifacts
- `/api/catalog?limit=500&cursor=0` — paginated machine-readable catalog
- `/api/catalog?view=full` — explicit complete snapshot for smaller workspaces
- `/api/health` — snapshot identity and index health
- `/api/events` — live workspace-change stream

All machine responses carry a schema version or snapshot identity. Workspace
content is explicitly untrusted data in agent-context responses.

## Configuration

Add `atlas.yaml` or `atlas.yml` at the workspace root:

```yaml
workspace:
  name: Operations Workspace
  description: Evidence, runbooks, records, and source material

content:
  include: ["**/*"]
  exclude: ["**/fixtures/**"]
  maxFileBytes: 1000000
  maxFiles: 25000
  maxTotalBytes: 250000000

authority:
  - match: AGENTS.md
    rank: 100
    label: Workspace contract
    canonical: true
  - match: "docs/architecture/**"
    rank: 80
    canonical: true

portal:
  accent: "#b36b22"
  profile: auto # auto, code, or general
```

`project` and `source` remain supported as compatibility aliases for
`workspace` and `content`.

## Supported content

Atlas safely indexes text artifacts even when their extension is unknown. It
labels common formats including source languages, Markdown, JSON/YAML/TOML,
plain text, CSV/TSV, RST, AsciiDoc, Terraform, GraphQL, and notebooks. Images,
PDFs, and common office artifacts are cataloged as binary artifacts; images
render inline and other binary artifacts receive a sandboxed raw view.

Symbol extraction currently covers TypeScript, JavaScript, Rust, Python, Go,
and Java. These anchors are discovery aids, not compiler or language-server
claims.

## Safety boundary

Atlas is read-only and binds to loopback. It never executes workspace code,
honors repository ignores, excludes common secrets, and bounds configuration,
file, repository, search, and raw-range sizes. Admitted bytes live with an
immutable in-memory snapshot, so reader/API responses never reopen mutable
workspace paths.

Local mode has no authentication. Shared deployment requires authenticated
ingress, transport security, and an access model appropriate to the indexed
workspace.

## Validation

```bash
pnpm check
pnpm build
pnpm audit --prod
```

The suite covers nested API routes, fielded search, compact snapshots,
configuration limits, Git isolation, ignore rules, secret exclusion,
symlink-swap protection, general-workspace formats, and raw-range contracts.
