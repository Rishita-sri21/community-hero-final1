import React from 'react';
import { Report } from '../types';

// One line under a report saying what the background triage concluded, and from what.
export default function TriageNote({ report }: { report: Report }) {
  const triage = report.triage;
  if (!triage) return null;

  if (triage.status === 'pending') {
    return (
      <p className="text-[10px] text-slate-500 flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>
        Sorting this report{triage.autoFields.length > 0 ? ` (${triage.autoFields.join(' and ')})` : ''}…
      </p>
    );
  }
  if (triage.status !== 'done') return null;

  const by = triage.source === 'gemini' ? 'Gemini' : 'Keyword rules';
  const applied = triage.autoFields.length > 0;
  const differs = !applied && (triage.category !== report.category || triage.urgency !== report.urgency);
  return (
    <p className="text-[10px] text-slate-500 leading-snug" title={triage.reason}>
      <span className="material-symbols-outlined text-[12px] align-[-2px] mr-1 text-indigo-500">auto_awesome</span>
      <span className="font-semibold text-slate-600">{by}</span>
      {applied
        ? ` set ${triage.autoFields.join(' and ')}: `
        : differs
          ? ` would file this as ${triage.category}, ${triage.urgency} urgency: `
          : ' agrees: '}
      {triage.reason}
    </p>
  );
}
