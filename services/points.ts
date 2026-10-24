import crypto from 'crypto';
import User from '../models/User';
import { GREEN_ACTIONS, REWARDS, SQUAD_JOIN_POINTS } from '../src/shared/catalog';

// Every change to a user's points goes through this file. Each function is a single
// atomic MongoDB update, so two requests arriving at once can't both read the old
// balance and overwrite each other (the bug with `user.points += n; user.save()`).

function startOfToday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Adds points and returns the new total, or null if the user doesn't exist. */
export async function awardPoints(userId: unknown, amount: number): Promise<number | null> {
  const user = await User.findByIdAndUpdate(userId, { $inc: { points: amount } }, { returnDocument: 'after' });
  return user ? user.points : null;
}

export type GreenActionResult =
  | { ok: true; points: number; awarded: number }
  | { ok: false; reason: 'unknown-action' | 'already-logged-today' };

/** Logs a green action and awards its points, at most once per action per day. */
export async function logGreenAction(userId: unknown, actionId: string): Promise<GreenActionResult> {
  const action = GREEN_ACTIONS.find((a) => a.id === actionId);
  if (!action) return { ok: false, reason: 'unknown-action' };

  const user = await User.findOneAndUpdate(
    {
      _id: userId,
      greenActionLog: { $not: { $elemMatch: { actionId, at: { $gte: startOfToday() } } } },
    },
    {
      $push: { greenActionLog: { actionId, at: new Date() } },
      $inc: { points: action.points },
    },
    { returnDocument: 'after' }
  );

  if (!user) return { ok: false, reason: 'already-logged-today' };
  return { ok: true, points: user.points, awarded: action.points };
}

export type RedeemResult =
  | { ok: true; points: number; code: string }
  | { ok: false; reason: 'unknown-reward' | 'insufficient-points' };

/** Spends points on a catalogue reward. The balance check and the deduction happen in one update. */
export async function redeemReward(userId: unknown, rewardId: string): Promise<RedeemResult> {
  const reward = REWARDS.find((r) => r.id === rewardId);
  if (!reward) return { ok: false, reason: 'unknown-reward' };

  const code = 'MUNI-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  const user = await User.findOneAndUpdate(
    { _id: userId, points: { $gte: reward.cost } },
    {
      $inc: { points: -reward.cost },
      $push: { redemptions: { rewardId, code, at: new Date() } },
    },
    { returnDocument: 'after' }
  );

  if (!user) return { ok: false, reason: 'insufficient-points' };
  return { ok: true, points: user.points, code };
}

export type JoinSquadResult =
  | { ok: true; points: number; awarded: number; joinedSquads: string[] }
  | { ok: false; reason: 'unknown-squad' };

/** Joins a squad. The join bonus is paid only the first time a user joins that squad. */
export async function joinSquad(userId: unknown, squadId: string): Promise<JoinSquadResult> {
  const bonus = SQUAD_JOIN_POINTS[squadId];
  if (bonus === undefined) return { ok: false, reason: 'unknown-squad' };

  let awarded = bonus;
  let user = await User.findOneAndUpdate(
    { _id: userId, rewardedSquads: { $ne: squadId } },
    { $addToSet: { joinedSquads: squadId, rewardedSquads: squadId }, $inc: { points: bonus } },
    { returnDocument: 'after' }
  );

  if (!user) {
    awarded = 0;
    user = await User.findByIdAndUpdate(userId, { $addToSet: { joinedSquads: squadId } }, { returnDocument: 'after' });
  }

  return { ok: true, points: user!.points, awarded, joinedSquads: user!.joinedSquads };
}

/** Leaves a squad. Points are not changed. */
export async function leaveSquad(userId: unknown, squadId: string): Promise<string[]> {
  const user = await User.findByIdAndUpdate(userId, { $pull: { joinedSquads: squadId } }, { returnDocument: 'after' });
  return user ? user.joinedSquads : [];
}
