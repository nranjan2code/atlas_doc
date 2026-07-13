"use client";

import { useState } from "react";
import { Check, Clipboard, ExternalLink, Link as LinkIcon } from "lucide-react";

export function SourceActions({ path, rawHref }: { path: string; rawHref: string }) {
  const [copied, setCopied] = useState<"path" | "link" | null>(null);

  const copy = async (kind: "path" | "link") => {
    try {
      await navigator.clipboard.writeText(kind === "path" ? path : window.location.href);
      setCopied(kind);
      window.setTimeout(() => setCopied((current) => current === kind ? null : current), 1_600);
    } catch { setCopied(null); }
  };

  return <div className="source-actions">
    <button onClick={() => copy("path")} aria-label={copied === "path" ? "Source path copied" : "Copy source path"}>{copied === "path" ? <Check size={15}/> : <Clipboard size={15}/>}<span>{copied === "path" ? "Copied" : "Copy path"}</span></button>
    <button onClick={() => copy("link")} aria-label={copied === "link" ? "Source link copied" : "Copy source link"}>{copied === "link" ? <Check size={15}/> : <LinkIcon size={15}/>}<span>{copied === "link" ? "Copied" : "Copy link"}</span></button>
    <a href={rawHref} aria-label="Open raw file"><ExternalLink size={15}/><span>Raw</span></a>
  </div>;
}
