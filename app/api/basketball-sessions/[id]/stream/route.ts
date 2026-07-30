import { NextResponse } from "next/server";
import { getBasketballSessionById, toBasketballSessionPayload } from "@/lib/basketball-sessions";
import { subscribeToBasketballSession } from "@/lib/basketball-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function encodeEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const session = await getBasketballSessionById(id);

  if (!session) {
    return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  let unsubscribe = () => {};
  let closed = false;

  const closeStream = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (closed) return;
    closed = true;

    if (keepAlive) {
      clearInterval(keepAlive);
      keepAlive = null;
    }

    unsubscribe();
    controller.close();
  };

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(encodeEvent("session", toBasketballSessionPayload(session))));

      unsubscribe = subscribeToBasketballSession(id, (nextSession) => {
        if (closed) return;
        controller.enqueue(encoder.encode(encodeEvent("session", toBasketballSessionPayload(nextSession))));
      });

      // Keep-alive a cada 25s, promovido a evento nomeado (em vez do comentário ": ping"
      // do vôlei) para também recalibrar o offset de relógio de uma TV silenciosa.
      keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(encodeEvent("clock-sync", { serverNow: new Date().toISOString() })));
      }, 25000);

      _request.signal.addEventListener("abort", () => closeStream(controller), { once: true });
    },
    cancel() {
      if (keepAlive) {
        clearInterval(keepAlive);
        keepAlive = null;
      }

      unsubscribe();
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
