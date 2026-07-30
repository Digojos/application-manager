import type { ScoreboardSessionRecord } from "@/lib/scoreboard-sessions";
import { createSessionChannel } from "@/lib/session-stream";

const scoreboardChannel = createSessionChannel<ScoreboardSessionRecord>("__scoreboardSessionListeners");

export const subscribeToScoreboardSession = scoreboardChannel.subscribe;
export const publishScoreboardSessionUpdate = scoreboardChannel.publish;
