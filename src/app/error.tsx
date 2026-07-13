"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <main className="system-page"><section className="system-card"><small>ATLAS INDEX ERROR</small><h1>The project map could not be refreshed.</h1><p>Check the Atlas terminal for configuration or filesystem details, then retry the index.</p><button onClick={reset}>Retry indexing</button><a href="/api/health">Check API health</a></section></main>;
}
