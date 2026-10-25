import mongoose from 'mongoose';
import User from '../models/User';
import Report from '../models/Report';
import { SQUADS } from '../src/shared/catalog';

// Squad numbers are counted from the database: who joined, how many open reports in the
// squad's categories are near the viewer, and how many reports its members have fixed.

const NEARBY_KM = 25;

export async function listSquads(viewer: any, near: { lat: number; lng: number }) {
  const ids = SQUADS.map((s) => s.id);

  const [membership, openByCategory] = await Promise.all([
    User.aggregate([
      { $match: { joinedSquads: { $in: ids } } },
      { $unwind: '$joinedSquads' },
      { $match: { joinedSquads: { $in: ids } } },
      { $sort: { points: -1 } },
      { $group: { _id: '$joinedSquads', count: { $sum: 1 }, memberIds: { $push: '$_id' }, avatars: { $push: '$avatar' } } },
    ]),
    Report.aggregate([
      {
        $geoNear: {
          near: { type: 'Point', coordinates: [near.lng, near.lat] },
          distanceField: 'distanceMeters',
          maxDistance: NEARBY_KM * 1000,
          query: { status: 'open' },
          spherical: true,
        },
      },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]),
  ]);

  const members = new Map<string, any>(membership.map((m: any) => [m._id, m]));
  const openCount = new Map<string, number>(openByCategory.map((c: any) => [c._id, c.count]));
  const joined: string[] = viewer?.joinedSquads ?? [];

  return Promise.all(SQUADS.map(async (squad) => {
    const group = members.get(squad.id);
    const memberIds: mongoose.Types.ObjectId[] = group?.memberIds ?? [];
    const fixedByMembers = memberIds.length
      ? await Report.countDocuments({ status: 'resolved', 'resolution.by': { $in: memberIds }, category: { $in: squad.categories } })
      : 0;
    return {
      ...squad,
      members: group?.count ?? 0,
      memberAvatars: (group?.avatars ?? []).filter(Boolean).slice(0, 5),
      openNearby: squad.categories.reduce((sum, c) => sum + (openCount.get(c) ?? 0), 0),
      fixedByMembers,
      joined: joined.includes(squad.id),
    };
  }));
}

/** What a user has actually done, for the "Your impact" card. */
export async function userStats(user: any) {
  const id = user._id;
  const [reported, fixed, verified, upvotes, higherRanked] = await Promise.all([
    Report.countDocuments({ 'reporter.id': id }),
    Report.countDocuments({ status: 'resolved', 'resolution.by': id, 'reporter.id': { $ne: id } }),
    Report.countDocuments({ verifiedBy: id }),
    Report.aggregate([{ $match: { 'reporter.id': id } }, { $group: { _id: null, total: { $sum: '$upvotes' } } }]),
    User.countDocuments({ points: { $gt: user.points } }),
  ]);
  return {
    reportsCreated: reported,
    reportsFixed: fixed,
    verificationsGiven: verified,
    upvotesReceived: upvotes[0]?.total ?? 0,
    rank: higherRanked + 1,
    points: user.points,
    squadsJoined: (user.joinedSquads ?? []).filter((s: string) => SQUADS.some((q) => q.id === s)).length,
  };
}
