import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Database, ShieldAlert, FileText, CheckCircle, RefreshCw, Server, Cpu, Search, Lock, AlertOctagon, Download, Play, Info } from 'lucide-react';

export default function AdminConsole() {
  const [logs, setLogs] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshingLogs, setRefreshingLogs] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [backupLoading, setBackupLoading] = useState<boolean>(false);
  const [backupResult, setBackupResult] = useState<any>(null);
  const [filterType, setFilterType] = useState<string>('ALL');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statusData, logsData] = await Promise.all([
        api.getDbStatus(),
        api.getAuditLogs()
      ]);
      setStatus(statusData);
      setLogs(logsData);
    } catch (err) {
      console.error('Failed to retrieve database status and audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshLogsOnly = async () => {
    try {
      setRefreshingLogs(true);
      const logsData = await api.getAuditLogs();
      setLogs(logsData);
    } catch (err) {
      console.error('Failed to refresh audit logs:', err);
    } finally {
      setRefreshingLogs(false);
    }
  };

  const handleBackup = async () => {
    try {
      setBackupLoading(true);
      setBackupResult(null);
      const res = await api.triggerDbBackup();
      setBackupResult(res);
      // Refresh status to show updated files or logs
      const updatedStatus = await api.getDbStatus();
      setStatus(updatedStatus);
      const updatedLogs = await api.getAuditLogs();
      setLogs(updatedLogs);
    } catch (err) {
      console.error('Database backup execution failed:', err);
    } finally {
      setBackupLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      (log.userEmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.message || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.event || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    if (filterType === 'ALL') return matchesSearch;
    return matchesSearch && log.event === filterType;
  });

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-12 flex flex-col items-center justify-center min-h-[400px]">
        <RefreshCw className="w-10 h-10 text-blue-600 animate-spin mb-4" />
        <p className="font-sans text-xs text-slate-500 font-bold uppercase tracking-widest animate-pulse">
          Decrypting Administrative Registry...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-8 animate-entrance">
      
      {/* Header Panel */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-600 font-bold text-xs uppercase tracking-wider mb-1">
            <Lock className="w-3.5 h-3.5" /> Security Operation Center
          </div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Database &amp; Audit Control Room</h2>
          <p className="text-slate-500 text-xs mt-0.5">
            Monitor low-latency JSON file databases, integrity indicators, PBKDF2 hash variables, and user session audit logs.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={fetchData}
            className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Full Sync
          </button>
          <button
            onClick={handleBackup}
            disabled={backupLoading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md shadow-blue-500/10 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            {backupLoading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            Trigger DB Backup Check
          </button>
        </div>
      </div>

      {/* Database Systems Visual & Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* DB Engine Stats */}
        <div className="bg-white border border-slate-150 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                <Server className="w-5 h-5 text-blue-600" />
              </div>
              <span className="bg-blue-50 text-blue-600 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-blue-100">
                ACTIVE
              </span>
            </div>
            <h3 className="font-black text-slate-800 text-sm tracking-tight mb-1">Storage Engine Engine</h3>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Highly responsive JSON file arrays wrapped inside robust thread-safe locks. Fully persisted in `/app/applet/`.
            </p>
          </div>
          <div className="border-t border-slate-50 pt-4 mt-6 grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">Status</div>
              <div className="text-xs font-bold text-emerald-600 flex items-center gap-1 mt-0.5">
                <CheckCircle className="w-3.5 h-3.5" /> Operational
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">Latency</div>
              <div className="text-xs font-mono font-bold text-slate-700 mt-0.5">&lt; 1.2ms</div>
            </div>
          </div>
        </div>

        {/* Cryptographic Variables */}
        <div className="bg-white border border-slate-150 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                <Cpu className="w-5 h-5 text-indigo-600" />
              </div>
              <span className="bg-indigo-50 text-indigo-600 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-indigo-100">
                SECURE
              </span>
            </div>
            <h3 className="font-black text-slate-800 text-sm tracking-tight mb-1">Hashing &amp; Signatures</h3>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Passwords hashed using PBKDF2 (SHA-512) with 1000 iterations and randomized 16-byte cryptographic salts.
            </p>
          </div>
          <div className="border-t border-slate-50 pt-4 mt-6 grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">Token Handshake</div>
              <div className="text-xs font-mono font-bold text-slate-700 mt-0.5">HMAC-SHA256</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">Salt length</div>
              <div className="text-xs font-mono font-bold text-slate-700 mt-0.5">128-bit Hex</div>
            </div>
          </div>
        </div>

        {/* Metrics Overview */}
        <div className="bg-white border border-slate-150 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                <Database className="w-5 h-5 text-amber-600" />
              </div>
              <span className="bg-slate-50 text-slate-500 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-slate-200">
                INTEGRITY CHECKED
              </span>
            </div>
            <h3 className="font-black text-slate-800 text-sm tracking-tight mb-1">Catalog Schema &amp; Sizes</h3>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Database contains multiple core registries which are automatically integrity-audited on startup and during write streams.
            </p>
          </div>
          <div className="border-t border-slate-50 pt-4 mt-6 grid grid-cols-3 gap-2 text-center">
            <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
              <div className="text-[9px] text-slate-400 font-bold uppercase">Users</div>
              <div className="text-sm font-black text-slate-800 font-mono mt-0.5">{status?.metrics?.usersCount || 0}</div>
            </div>
            <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
              <div className="text-[9px] text-slate-400 font-bold uppercase">Reports</div>
              <div className="text-sm font-black text-slate-800 font-mono mt-0.5">{status?.metrics?.reportsCount || 0}</div>
            </div>
            <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
              <div className="text-[9px] text-slate-400 font-bold uppercase">Logs</div>
              <div className="text-sm font-black text-slate-800 font-mono mt-0.5">{status?.metrics?.auditLogsCount || 0}</div>
            </div>
          </div>
        </div>

      </div>

      {/* Backup notification if triggered */}
      {backupResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-start gap-4 animate-shake">
          <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-black text-emerald-900 text-sm">System Backup Handshake Successful</h4>
            <p className="text-emerald-700 text-xs font-semibold">
              {backupResult.message}
            </p>
            <div className="flex flex-wrap gap-4 pt-1.5 text-[10px] font-mono text-emerald-600 font-bold">
              <span>Timestamp: {backupResult.timestamp}</span>
              <span>SHA-256 Checksum: {backupResult.checksum}</span>
            </div>
          </div>
        </div>
      )}

      {/* Database Files Register Table */}
      <div className="bg-white border border-slate-150 rounded-2xl p-6 shadow-sm space-y-4">
        <h3 className="font-black text-slate-800 text-sm tracking-tight flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-500" /> Catalog File Systems Status
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-bold font-sans uppercase text-[10px]">
                <th className="pb-3">File Category Name</th>
                <th className="pb-3">Path Address</th>
                <th className="pb-3 text-right">File Capacity Size</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 font-semibold text-slate-600">
              {status?.files?.map((file: any, index: number) => (
                <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3.5 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span>{file.name}</span>
                  </td>
                  <td className="py-3.5 font-mono text-slate-400 text-[10px]">{file.path}</td>
                  <td className="py-3.5 text-right font-mono font-bold text-slate-700">{file.size}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security Audit logs Feed */}
      <div className="bg-white border border-slate-150 rounded-2xl p-6 shadow-sm space-y-6">
        
        {/* Controls block */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <h3 className="font-black text-slate-800 text-sm tracking-tight flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-500" /> Security Audit Log Stream
            </h3>
            <p className="text-slate-400 text-[11px]">
              Secure trail of users logins, points transactions, rate blocks, and database checkpoints.
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto shrink-0">
            <button
              onClick={refreshLogsOnly}
              disabled={refreshingLogs}
              className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs p-2.5 rounded-xl transition-all cursor-pointer focus:outline-none flex items-center gap-1.5 shrink-0"
              title="Refresh security logs feed"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshingLogs ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <div className="relative flex-grow sm:flex-grow-0">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-60 bg-slate-50 border border-slate-200 focus:border-blue-500 rounded-xl pl-9 pr-4 py-2 text-xs font-semibold outline-none text-slate-700 placeholder:text-slate-400"
              />
            </div>
          </div>
        </div>

        {/* Tab Filters */}
        <div className="flex flex-wrap gap-1.5 border-b border-slate-100 pb-3">
          {['ALL', 'SECURITY_VIOLATION', 'AUTH_LOGIN', 'AUTH_REGISTER', 'DB_BACKUP', 'REPORT_CREATED', 'REPORT_VERIFIED', 'POINTS_TRANSACTION'].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                filterType === type
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              {type.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Logs Feed List */}
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <Info className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">No matching logs registered.</p>
              <p className="text-[11px] text-slate-400 mt-1">Adjust search filter criteria or trigger events on the platform.</p>
            </div>
          ) : (
            filteredLogs.map((log: any) => {
              const isViolation = log.event === 'SECURITY_VIOLATION';
              const isBackup = log.event === 'DB_BACKUP';
              const isAuth = log.event === 'AUTH_LOGIN' || log.event === 'AUTH_REGISTER';
              
              return (
                <div 
                  key={log.id} 
                  className={`border rounded-xl p-4 flex items-start gap-3 transition-colors ${
                    isViolation 
                      ? 'bg-rose-50/30 border-rose-100 hover:bg-rose-50/50' 
                      : isBackup 
                        ? 'bg-emerald-50/20 border-emerald-150 hover:bg-emerald-50/30' 
                        : 'bg-white border-slate-100 hover:border-slate-200'
                  }`}
                >
                  {isViolation ? (
                    <AlertOctagon className="w-5 h-5 text-rose-500 shrink-0 mt-0.5 animate-pulse" />
                  ) : isBackup ? (
                    <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1.5 flex-grow">
                    <div className="flex flex-wrap justify-between items-center gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-black uppercase font-sans px-2 py-0.5 rounded-full border ${
                          isViolation 
                            ? 'bg-rose-100 text-rose-700 border-rose-200' 
                            : isBackup 
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-200' 
                              : isAuth 
                                ? 'bg-blue-100 text-blue-700 border-blue-200' 
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}>
                          {log.event}
                        </span>
                        {log.userEmail && (
                          <span className="font-mono text-[10px] text-slate-400 font-bold bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md">
                            {log.userEmail}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono font-bold">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className={`text-xs font-semibold ${isViolation ? 'text-rose-900' : 'text-slate-700'}`}>
                      {log.message}
                    </p>
                    <div className="flex items-center gap-4 text-[9px] font-mono text-slate-400">
                      <span>IP Node: {log.ipAddress || '127.0.0.1'}</span>
                      <span>Log Key: {log.id}</span>
                      <span>Handshake Status: <span className={log.success ? "text-emerald-500 font-bold" : "text-rose-500 font-bold"}>{log.success ? "PASSED" : "REJECTED"}</span></span>
                    </div>
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
