import React, { useEffect, useState } from 'react';
import { NeighborhoodAnalytics, Report } from '../types';
import { api } from '../lib/api';
import { errorMessage } from '../lib/toast';

interface AnalyticsPanelProps {
  center: { lat: number; lng: number };
  // Already loaded open reports, used for the "waiting longest" list
  reports: Report[];
}

function formatHours(hours: number | null) {
  if (hours === null) return '—';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} days`;
}

const weekday = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });

export default function AnalyticsPanel({ center, reports }: AnalyticsPanelProps) {
  const [data, setData] = useState<NeighborhoodAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api.getAnalytics(center)
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(errorMessage(err, 'Could not load analytics.')));
    return () => { cancelled = true; };
    // Reload when the open reports change (a report was added, voted on or resolved)
  }, [center.lat, center.lng, reports.length]);

  if (error) {
    return <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-4">{error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-slate-500">Loading analytics…</p>;
  }

  const total = data.open + data.resolved;
  const maxDaily = Math.max(1, ...data.last7Days.flatMap((d) => [d.reported, d.resolved]));
  const maxCategory = Math.max(1, ...data.byCategory.map((c) => c.open + c.resolved));
  const oldest = [...reports]
    .filter((r) => r.createdAt)
    .sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime())
    .slice(0, 5);

  const stats = [
    { label: 'Open issues', value: String(data.open), icon: 'report', color: 'text-red-500' },
    { label: 'Resolved', value: String(data.resolved), icon: 'task_alt', color: 'text-teal-600' },
    {
      label: 'Resolution rate',
      value: data.resolutionRate === null ? '—' : `${Math.round(data.resolutionRate * 100)}%`,
      icon: 'percent',
      color: 'text-blue-600',
    },
    { label: 'Median time to fix', value: formatHours(data.medianHoursToResolve), icon: 'timer', color: 'text-purple-600' },
  ];

  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-500">
        All reports within {data.radiusKm} km of your neighborhood ({total} in total), computed live by MongoDB.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <span className={`material-symbols-outlined text-2xl mb-2 block ${s.color}`}>{s.icon}</span>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">{s.label}</p>
            <h2 className="text-2xl font-black text-slate-800">{s.value}</h2>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-7 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-bold text-slate-800">Last 7 days</h3>
            <div className="flex gap-3 text-[10px] font-bold text-slate-500">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> Reported</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-teal-500" /> Resolved</span>
            </div>
          </div>
          <div className="h-48 flex items-end justify-between gap-3">
            {data.last7Days.map((day) => (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                <div className="flex items-end gap-1 h-full w-full justify-center">
                  {[{ n: day.reported, cls: 'bg-blue-500' }, { n: day.resolved, cls: 'bg-teal-500' }].map((bar, i) => (
                    <div
                      key={i}
                      title={`${bar.n} ${i === 0 ? 'reported' : 'resolved'}`}
                      className={`w-3 md:w-4 rounded-t ${bar.cls} ${bar.n === 0 ? 'opacity-20' : ''}`}
                      style={{ height: `${Math.max(4, (bar.n / maxDaily) * 100)}%` }}
                    />
                  ))}
                </div>
                <span className="text-[10px] font-bold text-slate-400">{weekday(day.date)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="md:col-span-5 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-4">By category</h3>
          <ul className="space-y-3">
            {data.byCategory.map((c) => (
              <li key={c.category}>
                <div className="flex justify-between text-[11px] font-semibold text-slate-600 mb-1">
                  <span>{c.category}</span>
                  <span>{c.open} open · {c.resolved} fixed</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
                  <div className="bg-red-400" style={{ width: `${(c.open / maxCategory) * 100}%` }} />
                  <div className="bg-teal-500" style={{ width: `${(c.resolved / maxCategory) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="md:col-span-12 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-1">Waiting longest</h3>
          <p className="text-[11px] text-slate-400 mb-4">
            Open by urgency: {data.byUrgency.map((u) => `${u.open} ${u.urgency.toLowerCase()}`).join(', ')}.
          </p>
          {oldest.length === 0 ? (
            <p className="text-xs text-slate-500">No open reports nearby.</p>
          ) : (
            <ul className="divide-y divide-slate-50">
              {oldest.map((r) => (
                <li key={r.id} className="py-2.5 flex justify-between items-center gap-3 text-xs">
                  <span className="font-semibold text-slate-700 truncate">{r.title}</span>
                  <span className="text-slate-400 shrink-0">{r.category} · {r.urgency} · {r.timeAgo}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
