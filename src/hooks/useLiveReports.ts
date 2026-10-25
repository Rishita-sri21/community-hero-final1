import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { API_URL } from '../config';
import { Report } from '../types';
import { distanceBetweenKm } from '../shared/neighborhoods';

type SetReports = Dispatch<SetStateAction<Report[]>>;

/**
 * Keeps the report list in sync with everyone else's activity, using the server's
 * Server-Sent Events stream (GET /api/events). Returns whether the stream is connected.
 *
 * Events never carry viewer-specific fields (isMine, hasUpvoted, hasVerified, distanceKm),
 * so merging an update keeps this user's own flags. `onReconnect` runs after the stream
 * drops and comes back, so anything missed while offline can be reloaded.
 */
export function useLiveReports(
  enabled: boolean,
  center: { lat: number; lng: number },
  setReports: SetReports,
  onReconnect: () => void
) {
  const [connected, setConnected] = useState(false);
  // Read through refs so a re-render doesn't tear down and reopen the stream
  const centerRef = useRef(center);
  const onReconnectRef = useRef(onReconnect);
  centerRef.current = center;
  onReconnectRef.current = onReconnect;

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;

    const source = new EventSource(`${API_URL}/api/events`);
    let hasConnectedBefore = false;

    source.onopen = () => {
      setConnected(true);
      if (hasConnectedBefore) onReconnectRef.current();
      hasConnectedBefore = true;
    };
    // EventSource retries by itself; this only updates the indicator meanwhile
    source.onerror = () => setConnected(false);

    const withDistance = (report: Report): Report => {
      if (report.lat === undefined || report.lng === undefined) return report;
      const km = distanceBetweenKm(centerRef.current, { lat: report.lat, lng: report.lng });
      return { ...report, distanceKm: Math.round(km * 10) / 10 };
    };

    source.addEventListener('report.created', (e) => {
      const { report } = JSON.parse((e as MessageEvent).data) as { report: Report };
      // The author already added it from their own request, which may arrive before or after this
      setReports((prev) => (prev.some((r) => r.id === report.id) ? prev : [withDistance(report), ...prev]));
    });

    source.addEventListener('report.updated', (e) => {
      const { report } = JSON.parse((e as MessageEvent).data) as { report: Report };
      setReports((prev) => prev.map((r) => (r.id === report.id ? { ...r, ...report } : r)));
    });

    source.addEventListener('report.merged', (e) => {
      const { id, into } = JSON.parse((e as MessageEvent).data) as { id: string; into: Report };
      setReports((prev) => prev.filter((r) => r.id !== id).map((r) => (r.id === into.id ? { ...r, ...into } : r)));
    });

    source.addEventListener('report.resolved', (e) => {
      const { id } = JSON.parse((e as MessageEvent).data) as { id: string };
      setReports((prev) => prev.filter((r) => r.id !== id));
    });

    return () => {
      source.close();
      setConnected(false);
    };
  }, [enabled, setReports]);

  return connected;
}
