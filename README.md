# Atlas

Atlas turns a Git repository or ordinary code directory into a live,
source-linked developer portal for humans and coding agents.

It indexes the project directly. There is no documentation database, generated
CMS, required AI provider, or requirement that the target use a particular
language or build system. The goal is simple: help a new contributor find the
right entry point, source of truth, and run command in minutes.

## Quick start

```bash
pnpm install
pnpm atlas /path/to/project
```

Open `http://127.0.0.1:3010`.

To run this checkout directly:

```bash
node scripts/atlas.mjs /path/to/project
```

Atlas accepts directories with or without Git and with or without a
`package.json`.

### CLI options

```text
atlas [project-directory] [options]

-p, --port <number>  Loopback port (default: 3010)
    --production     Start a previously built production server
-h, --help           Show help
-v, --version        Show the Atlas version
```

## Human workflows

- Start on `/` for project identity, authoritative sources, languages, code
  areas, commands, and key symbols.
- Press `⌘K` or `Ctrl+K` anywhere on the portal to search files, concepts, and
  exported symbols. Arrow keys and Enter navigate results.
- Filter command search with `language:TypeScript`, `kind:test`, or
  `path:src/app`. Filters can be combined with ordinary terms.
- Open `/browse` for the complete, filterable source catalog.
- Source pages include stable line anchors, a symbol outline, raw-source access,
  copy actions, and previous/next navigation.

## Agent interfaces

- `/llms.txt` — discovery entrypoint and trust contract
- `/api/context` — Markdown onboarding with cited repository excerpts
- `/api/context?q=architecture&format=json` — structured topic context
- `/api/search?q=language%3ATypeScript+authentication` — ranked file and symbol search
- `/api/symbols?q=client` — extracted symbols with reader and raw line links
- `/api/source?path=README.md&start=1&end=80` — safe raw source and line ranges
- `/api/asset?path=docs/diagram.png` — safely admitted local image assets
- `/api/catalog?limit=500&cursor=0` — paginated machine-readable catalog
- `/api/catalog?view=full` — explicit complete snapshot for smaller projects
- `/api/catalog?view=portal` — compact portal snapshot
- `/api/health` — Git and snapshot identity
- `/api/events` — live repository-change stream

All machine responses carry a schema version or snapshot identity. Repository
content is explicitly marked as untrusted data in agent-context responses.

## Optional configuration

Add `atlas.yaml` or `atlas.yml` at the target-project root:

```yaml
project:
  name: Payments Platform
  description: Services and contracts for payment processing

source:
  include: ["**/*"]
  exclude: ["**/fixtures/**"]
  maxFileBytes: 1000000
  maxFiles: 25000
  maxTotalBytes: 250000000

authority:
  - match: AGENTS.md
    rank: 100
    label: Agent contract
    canonical: true
  - match: "docs/architecture/**"
    rank: 80
    canonical: true

portal:
  accent: "#b36b22"
```

See `atlas.example.yaml` for a copyable starter. Configuration is bounded and
validated before indexing.

## Supported intelligence

Atlas detects common project manifests and indexes text sources in TypeScript,
JavaScript, Rust, Python, Go, Java, Kotlin, Swift, C#, C/C++, Ruby, PHP, Scala,
Shell, SQL, Markdown, JSON, YAML, TOML, XML, CSS, and HTML.

Common PNG, JPEG, GIF, WebP, AVIF, ICO, BMP, and SVG assets are admitted through
the same ignore, size, symlink, and repository-boundary checks. Markdown readers
resolve local diagrams through the sandboxed asset endpoint.

Symbol extraction currently covers TypeScript, JavaScript, Rust, Python, Go,
and Java using conservative navigation-oriented extractors. These results are
discovery aids, not compiler or language-server claims.

## Safety boundary

Atlas is read-only and binds to loopback. The scanner:

- does not follow symlinks or execute repository code;
- disables Git filesystem monitors, hooks, submodule recursion, prompts, and
  optional locks for its read-only Git inspection;
- honors repository `.gitignore` files;
- excludes common secrets, dependency trees, virtual environments, and build
  output;
- bounds configuration, file, repository, and raw line-range sizes; and
- revalidates admitted source through a no-follow file descriptor before every
  raw read.

Local mode has no authentication. Put authenticated ingress in front of Atlas
before any shared deployment.

## Validation

```bash
pnpm check
pnpm build
pnpm audit --prod
```

The test suite covers symbol extraction, fielded search, compact snapshots,
configuration limits, Git fsmonitor isolation, `.gitignore`, secret exclusion,
and source symlink-swap protection.
