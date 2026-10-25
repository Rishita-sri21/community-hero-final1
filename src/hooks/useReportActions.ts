import React from 'react';
import { Report } from '../types';
import { api, ReportActionResponse } from '../lib/api';
import { toast, errorMessage } from '../lib/toast';
import { POINTS } from '../shared/catalog';

// Report actions shared by the Home and Map screens. The server decides whether points
// are awarded; these handlers only show the result. Nothing is faked when a request fails.
export function useReportActions(
  setReports: React.Dispatch<React.SetStateAction<Report[]>>,
  setPoints: (total: number) => void
) {
  const applyResult = ({ report, points }: ReportActionResponse) => {
    // The response has no distance (it depends on where the list was loaded from), so keep ours
    setReports((prev) => prev.map((r) => (r.id === report.id ? { ...report, distanceKm: r.distanceKm } : r)));
    if (points !== null) setPoints(points);
  };

  const upvote = async (id: string) => {
    try {
      applyResult(await api.upvoteReport(id));
      toast.success(`Upvoted! +${POINTS.REPORT_UPVOTED} Hero Points`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const verify = async (id: string) => {
    try {
      applyResult(await api.verifyReport(id));
      toast.success(`Thanks for verifying! +${POINTS.REPORT_VERIFIED} Hero Points`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return { upvote, verify };
}
