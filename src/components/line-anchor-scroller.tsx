"use client";

import { useEffect } from "react";

export function LineAnchorScroller() {
  useEffect(() => {
    let frame = 0;
    const scrollToHash = () => {
      const hash = window.location.hash.slice(1);
      let id = hash;
      try { id = decodeURIComponent(hash); } catch { /* Keep the literal fragment. */ }
      if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
    };
    frame = window.requestAnimationFrame(() => { frame = window.requestAnimationFrame(scrollToHash); });
    window.addEventListener("hashchange", scrollToHash);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("hashchange", scrollToHash); };
  }, []);
  return null;
}
