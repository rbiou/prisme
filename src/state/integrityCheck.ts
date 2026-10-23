import { cellLabel } from '../engine/board';
import { scanCell } from '../engine/cellScan';
import { deserializeMine } from '../engine/mine';
import { simulateRay } from '../engine/ray';
import type { GameState, Mine, PlayerId, SerializedMine } from '../engine/types';
import { verifyCommitment } from '../net/integrity';

export interface RevealVerification {
  hashOk: boolean;
  replayOk: boolean;
  replayChecked: number;
  problems: string[];
}

export interface RevealInput {
  player: PlayerId;
  mine: SerializedMine;
  salt: string;
  expectedHash: string;
  game: GameState;
  hostMine: Mine;
  guestMine: Mine;
}

/**
 * Vérifie l'engagement d'une mine révélée, puis rejoue toutes les réponses
 * que ce joueur a données en tant que maître de sa mine.
 */
export async function verifyReveal({
  player,
  mine,
  salt,
  expectedHash,
  game,
  hostMine,
  guestMine,
}: RevealInput): Promise<RevealVerification> {
  const revealedMine = deserializeMine(mine);
  const hashOk = await verifyCommitment(revealedMine, salt, expectedHash);
  const defenderMine = player === 'host' ? hostMine : guestMine;
  const problems: string[] = [];
  let replayOk = true;
  let replayChecked = 0;

  for (const scan of game.scans) {
    if (scan.by === player) continue;
    replayChecked += 1;

    if (scan.kind === 'wave' && scan.entry) {
      const result = simulateRay(defenderMine, scan.entry);
      const expectedExit = result.exit?.label ?? 'boucle';
      const expectedColor = result.color;
      if (scan.answer.kind !== 'wave') {
        replayOk = false;
        problems.push(`Le rayon ${scan.entry.label} a reçu une réponse de type incohérent.`);
        continue;
      }
      if (scan.answer.exit.label !== expectedExit || scan.answer.color !== expectedColor) {
        replayOk = false;
        problems.push(
          `Rayon ${scan.entry.label} : réponse « ${scan.answer.exit.label} / ${scan.answer.color} », attendu « ${expectedExit} / ${expectedColor} ».`,
        );
      }
      continue;
    }

    if (scan.kind === 'cell' && scan.cell) {
      const result = scanCell(defenderMine, scan.cell);
      if (scan.answer.kind !== 'cell') {
        replayOk = false;
        problems.push(`La case ${cellLabel(scan.cell)} a reçu une réponse de type incohérent.`);
        continue;
      }
      if (scan.answer.color !== result.color) {
        replayOk = false;
        problems.push(
          `Case ${cellLabel(scan.cell)} : réponse « ${scan.answer.color ?? 'rien'} », attendu « ${result.color ?? 'rien'} ».`,
        );
      }
    }
  }

  return { hashOk, replayOk, replayChecked, problems };
}
