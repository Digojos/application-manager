-- AlterTable
ALTER TABLE `scoreboard_sessions` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- RenameIndex
ALTER TABLE `scoreboard_sessions` RENAME INDEX `ScoreboardSession_controlToken_key` TO `scoreboard_sessions_controlToken_key`;
