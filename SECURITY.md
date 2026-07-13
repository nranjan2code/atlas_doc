# Security policy

Atlas is designed for local, read-only workspace discovery. It binds to loopback by default and never executes workspace code.

Do not expose an Atlas instance directly to a network. Shared deployment requires authenticated ingress, transport security, and a workspace access model appropriate to the files being indexed.

Please report vulnerabilities privately to the maintainers. Include reproduction steps, affected version, operating system, and whether the issue can expose workspace content or execute code.
