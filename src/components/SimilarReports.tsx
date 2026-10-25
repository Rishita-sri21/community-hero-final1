import React, { useEffect, useState } from 'react';
import { SimilarReport } from '../types';
import { api } from '../lib/api';

interface SimilarReportsProps {
  at: { lat: number; lng: number } | null;
  title: string;
  description: string;
  category: string;
  // Called when the reporter decides an existing report already covers it
  onUpvoteInstead: (report: SimilarReport) => void;
}

// While a report is being written, shows open reports nearby that look like the same problem.
// Asks the server after the reporter stops typing for a moment, not on every key.
export default function SimilarReports({ at, title, description, category, onUpvoteInstead }: SimilarReportsProps) {
  const [matches, setMatches] = useState<SimilarReport[]>([]);

  useEffect(() => {
    if (!at || title.trim().length < 4) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .findSimilarReports({ ...at, title, description, category })
        .then((found) => !cancelled && setMatches(found))
        // A failed check shouldn't block posting; it just shows nothing
        .catch(() => !cancelled && setMatches([]));
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [at?.lat, at?.lng, title, description, category]);

  if (matches.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-2.5" role="status">
      <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
        <span className="material-symbols-outlined text-base">content_copy</span>
        This may already be reported nearby
      </p>
      {matches.map((m) => (
        <div key={m.id} className="bg-white rounded-lg border border-amber-100 p-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-800 truncate">{m.title}</p>
            <p className="text-[10px] text-slate-500">
              {Math.round(m.score * 100)}% match · {m.reasons.join(' · ')} · {m.upvotes} upvote{m.upvotes === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onUpvoteInstead(m)}
            className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-full cursor-pointer"
          >
            Upvote instead
          </button>
        </div>
      ))}
      <p className="text-[10px] text-amber-800">Different problem? Post it anyway.</p>
    </div>
  );
}
