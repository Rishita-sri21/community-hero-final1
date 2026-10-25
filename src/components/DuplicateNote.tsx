import React, { useState } from 'react';
import { Report } from '../types';
import { api } from '../lib/api';
import { toast, errorMessage } from '../lib/toast';

interface DuplicateNoteProps {
  report: Report;
  // Receives the report this one was merged into, with the combined votes
  onMerged: (into: Report) => void;
}

// Shown on a report that looked like a duplicate when it was posted. Its reporter can merge it
// into the original, which closes it and moves its upvotes and verifications over.
export default function DuplicateNote({ report, onMerged }: DuplicateNoteProps) {
  const [merging, setMerging] = useState(false);
  const match = report.possibleDuplicate;
  if (!match) return null;

  const merge = async () => {
    setMerging(true);
    try {
      onMerged(await api.mergeDuplicate(report.id, match.id));
      toast.success(`Merged into "${match.title}"`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not merge the reports.'));
      setMerging(false);
    }
  };

  return (
    <div className="text-[10px] bg-amber-50 border border-amber-100 text-amber-900 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
      <span className="min-w-0">
        Possible duplicate of <span className="font-bold">“{match.title}”</span> ({Math.round(match.score * 100)}% match)
      </span>
      {report.isMine && (
        <button
          type="button"
          onClick={merge}
          disabled={merging}
          className="shrink-0 bg-white border border-amber-200 hover:bg-amber-100 font-bold px-2 py-0.5 rounded-full cursor-pointer disabled:opacity-50"
        >
          {merging ? 'Merging…' : 'Merge into it'}
        </button>
      )}
    </div>
  );
}
