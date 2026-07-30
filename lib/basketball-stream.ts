import type { BasketballSessionRecord } from "@/lib/basketball-sessions";
import { createSessionChannel } from "@/lib/session-stream";

const basketballChannel = createSessionChannel<BasketballSessionRecord>("__basketballSessionListeners");

export const subscribeToBasketballSession = basketballChannel.subscribe;
export const publishBasketballSessionUpdate = basketballChannel.publish;
