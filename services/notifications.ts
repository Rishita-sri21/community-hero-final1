import Notification from '../models/Notification';
import { log } from './logger';
import { timeAgo } from './reports';

type Kind = 'upvote' | 'verify' | 'resolved';

/** Records a notification for the report's author. Never throws; a failure only loses the notice. */
export function notifyReporter(kind: Kind, report: any, actor: any) {
  const reporterId = report.reporter?.id;
  if (!reporterId || String(reporterId) === String(actor._id)) return;
  Notification.create({
    user: reporterId,
    type: kind,
    report: { id: report._id, title: report.title },
    actor: { name: actor.name, avatar: actor.avatar },
  }).catch((err) => log.error('Could not save notification:', err));
}

export async function listNotifications(userId: unknown, limit = 20) {
  const [items, unread] = await Promise.all([
    Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ user: userId, read: false }),
  ]);
  return {
    unread,
    items: items.map((n: any) => ({
      id: String(n._id),
      type: n.type,
      reportId: n.report?.id ? String(n.report.id) : undefined,
      reportTitle: n.report?.title,
      actorName: n.actor?.name || 'A neighbor',
      read: n.read,
      createdAt: n.createdAt.toISOString(),
      timeAgo: timeAgo(n.createdAt),
    })),
  };
}

export function markAllRead(userId: unknown) {
  return Notification.updateMany({ user: userId, read: false }, { $set: { read: true } });
}
