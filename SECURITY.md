# Security Policy

## Security Model & Read-Only Guarantees

Atlas is engineered for local, **strictly read-only workspace discovery and navigation**:
- **Loopback Binding**: Atlas binds to loopback (`127.0.0.1`) by default.
- **Zero Code Execution**: Atlas never executes, evaluates, or runs scripts or binaries contained in the indexed repository.
- **Zero Workspace Mutation**: Atlas will never write, modify, or delete files inside the indexed workspace.
- **In-Memory Immutable Snapshots**: File bytes admitted during indexing are held in immutable memory buffers; subsequent API requests read from this snapshot, eliminating Time-Of-Check to Time-Of-Use (TOCTOU) path-swap exploits.
- **Git Sandboxing**: Git operations strictly disable external hooks (`core.hooksPath=/dev/null`), ignore system/global configuration (`GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`), disable `core.fsmonitor`, and suppress submodule recursion.
- **Secret & Sensitive Data Filtering**: Common credential and key files (`.env*`, private keys, secrets) are excluded by default.

## Deployment Advisory

- **Do NOT expose Atlas directly to a public or untrusted network.**
- Local mode is deliberately unauthenticated to maximize developer ergonomics on localhost.
- Any shared or remote deployment **requires** authenticated reverse-proxy ingress (e.g., OAuth/OIDC/mTLS proxy), transport security (TLS/HTTPS), and an access control model suitable for the indexed content.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability within Atlas, please do **NOT** report it publicly through a GitHub issue.

Instead, please report security vulnerabilities privately:
- Through GitHub Security Advisories: [Report a vulnerability](https://github.com/nranjan2code/atlas_doc/security/advisories/new)
- Or contact the maintainers directly.

Please include:
1. Detailed description of the vulnerability.
2. Step-by-step reproduction steps or proof-of-concept.
3. Affected versions and platform / environment details.
4. Assessment of whether the issue allows reading unauthorized files, path traversal, denial-of-service, or remote code execution.

We take security reports seriously and will acknowledge receipt, investigate promptly, and release security fixes in accordance with responsible disclosure practices.
