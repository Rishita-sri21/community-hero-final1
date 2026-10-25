import React, { useState, useEffect } from 'react';
import { api, JobQueueStats } from '../lib/api';
import { toast, errorMessage } from '../lib/toast';
import { Database, ShieldAlert, CheckCircle, RefreshCw, Server, Search, Lock, AlertOctagon, Download, Info, Activity, ListChecks } from 'lucide-react';

const EVENT_FILTERS = ['ALL', 'SECURITY_VIOLATION', 'AUTH_LOGIN', 'AUTH_REGISTER', 'REPORT_CREATED', 'REPORT_VERIFIED', 'REPORT_RESOLVED', 'DB_EXPORT', 'JOB_RETRIED'];
const EXPORTABLE = [
  { id: 'reports', label: 'Reports' },
  { id: 'users', label: 'Users (no passwords)' },
  { id: 'auditlogs', label: 'Audit logs' },
] as const;

function formatBytes(bytes?: number) {
  if (bytes === undefined || bytes === null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatMs(ms: number) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function formatUptime(seconds?: number) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export default function AdminConsole() {
  const [logs, setLogs] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshingLogs, setRefreshingLogs] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [exporting, setExporting] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [queue, setQueue] = useState<JobQueueStats | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statusData, logsData, queueData] = await Promise.all([api.getDbStatus(), api.getAuditLogs(), api.getJobQueue()]);
      setStatus(statusData);
      setLogs(logsData);
      setQueue(queueData);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not load the admin console.'));
    } finally {
      setLoading(false);
    }
  };

  const refreshLogsOnly = async () => {
    try {
      setRefreshingLogs(true);
      setLogs(await api.getAuditLogs());
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRefreshingLogs(false);
    }
  };

  const handleExport = async (collection: (typeof EXPORTABLE)[number]['id']) => {
    try {
      setExporting(collection);
      const { lines, bytes } = await api.exportCollection(collection);
      toast.success(`Downloaded ${lines} ${collection} (${formatBytes(bytes)})`);
      const [statusData, logsData] = await Promise.all([api.getDbStatus(), api.getAuditLogs()]);
      setStatus(statusData);
      setLogs(logsData);
    } catch (err) {
      toast.error(errorMessage(err, 'Export failed.'));
    } finally {
      setExporting(null);
    }
  };

  const handleRetry = async (id: string) => {
    try {
      setRetrying(id);
      await api.retryJob(id);
      toast.success('Job queued again');
      setQueue(await api.getJobQueue());
    } catch (err) {
      toast.error(errorMessage(err, 'Could not retry the job.'));
    } finally {
      setRetrying(null);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // The queue changes by the second; refresh it on its own while the console is open
  useEffect(() => {
    const timer = setInterval(() => {
      api.getJobQueue().then(setQueue).catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const filteredLogs = logs.filter((log) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      (log.userEmail || '').toLowerCase().includes(term) ||
      (log.message || '').toLowerCase().includes(term) ||
      (log.event || '').toLowerCase().includes(term);
    return filterType === 'ALL' ? matchesSearch : matchesSearch && log.event === filterType;
  });

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-12 flex flex-col items-center justify-center min-h-[400px]">
        <RefreshCw className="w-10 h-10 text-blue-600 animate-spin mb-4" />
        <p className="font-sans text-xs text-slate-500 font-bold uppercase tracking-widest">Loading admin console…</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-8 animate-entrance">
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-600 font-bold text-xs uppercase tracking-wider mb-1">
            <Lock className="w-3.5 h-3.5" /> Civil Servants and Organizers only
          </div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Database &amp; Audit Console</h2>
          <p className="text-slate-500 text-xs mt-0.5">Live MongoDB measurements, data exports and the security audit trail.</p>
        </div>
        <button
          onClick={fetchData}
          className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex justify-between items-start">
            <div className="p-3 bg-blue-50 rounded-xl border border-blue-100"><Server className="w-5 h-5 text-blue-600" /></div>
            <span className="bg-emerald-50 text-emerald-700 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-emerald-100">CONNECTED</span>
          </div>
          <h3 className="font-black text-slate-800 text-sm">{status?.engine} {status?.version}</h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><div className="text-[10px] text-slate-400 font-bold uppercase">Ping</div><div className="font-mono font-bold text-slate-700">{status?.pingMs} ms</div></div>
            <div><div className="text-[10px] text-slate-400 font-bold uppercase">Server uptime</div><div className="font-mono font-bold text-slate-700">{formatUptime(status?.uptimeSeconds)}</div></div>
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex justify-between items-start">
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-100"><Database className="w-5 h-5 text-amber-600" /></div>
          </div>
          <h3 className="font-black text-slate-800 text-sm">Storage</h3>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div><div className="text-[10px] text-slate-400 font-bold uppercase">Data</div><div className="font-mono font-bold text-slate-700">{formatBytes(status?.dataSizeBytes)}</div></div>
            <div><div className="text-[10px] text-slate-400 font-bold uppercase">On disk</div><div className="font-mono font-bold text-slate-700">{formatBytes(status?.storageSizeBytes)}</div></div>
            <div><div className="text-[10px] text-slate-400 font-bold uppercase">Indexes</div><div className="font-mono font-bold text-slate-700">{formatBytes(status?.indexSizeBytes)}</div></div>
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex justify-between items-start">
            <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100"><Activity className="w-5 h-5 text-indigo-600" /></div>
          </div>
          <h3 className="font-black text-slate-800 text-sm">Live updates</h3>
          <div className="text-xs">
            <div className="text-[10px] text-slate-400 font-bold uppercase">Browsers connected now</div>
            <div className="font-mono font-bold text-slate-700">{status?.liveConnections}</div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row justify-between gap-3">
          <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-500" /> Collections
          </h3>
          <div className="flex flex-wrap gap-2">
            {EXPORTABLE.map((c) => (
              <button
                key={c.id}
                onClick={() => handleExport(c.id)}
                disabled={exporting !== null}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-[11px] px-3 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer"
              >
                {exporting === c.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Export {c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px]">
                <th className="pb-3">Collection</th>
                <th className="pb-3">Notes</th>
                <th className="pb-3 text-right">Documents</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 font-semibold text-slate-600">
              {status?.collections?.map((c: any) => (
                <tr key={c.name}>
                  <td className="py-3 font-mono">{c.name}</td>
                  <td className="py-3 text-slate-400 text-[11px]">{c.note}</td>
                  <td className="py-3 text-right font-mono font-bold text-slate-700">{c.documents.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400">
          Exports download as NDJSON (one JSON document per line), streamed from a database cursor.{' '}
          {status?.lastExport
            ? `Last export: ${new Date(status.lastExport.at).toLocaleString()} by ${status.lastExport.by} (${status.lastExport.message}).`
            : 'No exports yet.'}
        </p>
      </div>

      {queue && (
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="space-y-1">
            <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-indigo-500" /> Background jobs
            </h3>
            <p className="text-slate-400 text-[11px]">
              AI photo checks and report triage run from a queue in MongoDB, with retries and backoff. Refreshes every 5 seconds.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            {([
              ['Waiting', queue.pending],
              ['Running', queue.running],
              ['Done (7 days)', queue.done],
              ['Failed', queue.failed],
              ['Oldest waiting', queue.oldestDueSeconds === null ? '—' : `${queue.oldestDueSeconds} s`],
            ] as const).map(([label, value]) => (
              <div key={label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <div className="text-[10px] text-slate-400 font-bold uppercase">{label}</div>
                <div className={`font-mono font-bold ${label === 'Failed' && queue.failed > 0 ? 'text-rose-600' : 'text-slate-700'}`}>{value}</div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px]">
                  <th className="pb-3">Job type (last 24 h)</th>
                  <th className="pb-3 text-right">Completed</th>
                  <th className="pb-3 text-right">Needed a retry</th>
                  <th className="pb-3 text-right">Avg wait</th>
                  <th className="pb-3 text-right">Avg run</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 font-semibold text-slate-600">
                {queue.last24h.length === 0 && (
                  <tr><td colSpan={5} className="py-3 text-slate-400">No jobs finished in the last 24 hours.</td></tr>
                )}
                {queue.last24h.map((t) => (
                  <tr key={t.type}>
                    <td className="py-3 font-mono">{t.type}</td>
                    <td className="py-3 text-right font-mono">{t.completed}</td>
                    <td className="py-3 text-right font-mono">{t.retried}</td>
                    <td className="py-3 text-right font-mono">{formatMs(t.avgWaitMs)}</td>
                    <td className="py-3 text-right font-mono">{formatMs(t.avgRunMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {queue.recentFailures.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] text-slate-400 font-bold uppercase">Recent failures</div>
              {queue.recentFailures.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-3 bg-rose-50/60 border border-rose-100 rounded-xl px-3 py-2 text-[11px]">
                  <div className="min-w-0">
                    <span className="font-mono font-bold text-slate-700">{f.type}</span>
                    <span className="text-slate-500"> · {f.attempts} attempt{f.attempts === 1 ? '' : 's'} · {f.error}</span>
                  </div>
                  <button
                    onClick={() => handleRetry(f.id)}
                    disabled={retrying !== null}
                    className="shrink-0 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold px-2.5 py-1 rounded-lg disabled:opacity-50 cursor-pointer"
                  >
                    {retrying === f.id ? 'Retrying…' : 'Retry'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-500" /> Security audit log
            </h3>
            <p className="text-slate-400 text-[11px]">Logins, registrations, report actions, blocked access and exports. Kept for 90 days.</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto shrink-0">
            <button
              onClick={refreshLogsOnly}
              disabled={refreshingLogs}
              className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs p-2.5 rounded-xl cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshingLogs ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <div className="relative flex-grow sm:flex-grow-0">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-60 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl pl-9 pr-4 py-2 text-xs font-semibold outline-none text-slate-700"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 border-b border-slate-100 pb-3">
          {EVENT_FILTERS.map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer ${
                filterType === type ? 'bg-blue-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {type.replaceAll('_', ' ')}
            </button>
          ))}
        </div>

        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <Info className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">No matching log entries.</p>
            </div>
          ) : (
            filteredLogs.map((log: any) => {
              const isViolation = log.event === 'SECURITY_VIOLATION' || log.success === false;
              return (
                <div
                  key={log.id}
                  className={`border rounded-xl p-4 flex items-start gap-3 ${
                    isViolation ? 'bg-rose-50/30 border-rose-100' : 'bg-white border-slate-100'
                  }`}
                >
                  {isViolation
                    ? <AlertOctagon className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                    : <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />}
                  <div className="space-y-1.5 flex-grow">
                    <div className="flex flex-wrap justify-between items-center gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                          isViolation ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}>
                          {log.event}
                        </span>
                        {log.userEmail && (
                          <span className="font-mono text-[10px] text-slate-400 font-bold bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md">
                            {log.userEmail}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono font-bold">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <p className={`text-xs font-semibold ${isViolation ? 'text-rose-900' : 'text-slate-700'}`}>{log.message}</p>
                    {log.ipAddress && <div className="text-[9px] font-mono text-slate-400">IP {log.ipAddress}</div>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
