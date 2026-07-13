import { getSnapshot } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const stream = new ReadableStream({
    start(controller) {
      let previous = "";
      const stop = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
      };
      const write = (message: string): boolean => {
        if (closed || request.signal.aborted) return false;
        try { controller.enqueue(encoder.encode(message)); return true; }
        catch { stop(); return false; }
      };
      const publish = () => {
        if (closed || request.signal.aborted) return;
        try {
          const snapshot = getSnapshot();
          if (snapshot.fingerprint !== previous) {
            previous = snapshot.fingerprint;
            write(`event: snapshot\ndata: ${JSON.stringify({ fingerprint: previous })}\n\n`);
          } else write(`: heartbeat ${Date.now()}\n\n`);
        } catch { write(`event: index-error\ndata: ${JSON.stringify({ message: "Index refresh failed" })}\n\n`); }
      };
      publish();
      timer = setInterval(publish, 3_000);
      request.signal.addEventListener("abort", () => {
        stop();
        try { controller.close(); } catch { /* Stream is already closed. */ }
      }, { once: true });
    },
    cancel() { closed = true; if (timer) clearInterval(timer); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
