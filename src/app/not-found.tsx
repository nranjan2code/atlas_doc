import Link from "next/link";

export default function NotFound() {
  return <main className="system-page"><section className="system-card"><small>SOURCE NOT FOUND</small><h1>This path is not in the active snapshot.</h1><p>The file may be ignored, excluded, oversized, binary, or changed since the last index refresh.</p><Link href="/browse">Browse indexed sources</Link><Link href="/">Return to Atlas</Link></section></main>;
}
