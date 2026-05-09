import { NextResponse } from "next/server";
import { getScoreboardSessionById } from "@/lib/scoreboard-sessions";
import { subscribeToScoreboardSession } from "@/lib/scoreboard-stream";

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
  const session = await getScoreboardSessionById(id);

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
      controller.enqueue(encoder.encode(encodeEvent("session", session)));

      unsubscribe = subscribeToScoreboardSession(id, (nextSession) => {
        if (closed) return;
        controller.enqueue(encoder.encode(encodeEvent("session", nextSession)));
      });

      keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
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