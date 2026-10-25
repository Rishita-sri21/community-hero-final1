import React, { useState } from 'react';
import { Mission } from '../types';
import { api } from '../lib/api';
import { toast, errorMessage } from '../lib/toast';
import { centerForDistrict } from '../shared/neighborhoods';

interface MissionPanelProps {
  userDistrict?: string;
  mission: Mission | null;
  setMission: (mission: Mission | null) => void;
  // Opens a stop's report on the map
  onSelectStop: (reportId: string) => void;
}

// Uses the browser's location when the user allows it, otherwise the center of their neighborhood
function currentPosition(fallback: { lat: number; lng: number }): Promise<{ start: { lat: number; lng: number }; fromDevice: boolean }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ start: fallback, fromDevice: false });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ start: { lat: pos.coords.latitude, lng: pos.coords.longitude }, fromDevice: true }),
      () => resolve({ start: fallback, fromDevice: false }),
      { timeout: 5000, maximumAge: 60_000 }
    );
  });
}

const URGENCY_STYLE: Record<string, string> = {
  High: 'bg-red-50 text-red-600 border-red-100',
  Medium: 'bg-amber-50 text-amber-600 border-amber-100',
  Low: 'bg-blue-50 text-blue-600 border-blue-100',
};

export default function MissionPanel({ userDistrict, mission, setMission, onSelectStop }: MissionPanelProps) {
  const [planning, setPlanning] = useState(false);
  const [startedFromDevice, setStartedFromDevice] = useState(false);

  const plan = async () => {
    setPlanning(true);
    try {
      const { start, fromDevice } = await currentPosition(centerForDistrict(userDistrict));
      const { mission: planned, searchRadiusKm } = await api.planMission(start);
      setStartedFromDevice(fromDevice);
      setMission(planned);
      if (!planned) toast.error(`No open reports within ${searchRadiusKm} km. Nothing to plan yet.`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not plan a mission.'));
    } finally {
      setPlanning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-violet-600 to-blue-600 rounded-2xl p-5 shadow-xl text-white flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-black">Mission Planner</h3>
          <p className="text-sm text-blue-100 mt-1 max-w-xl">
            Finds the cluster of open reports nearby that most needs attention, and orders the stops into a short walking route.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {mission && (
            <button
              onClick={() => setMission(null)}
              className="bg-white/15 text-white px-4 py-3 rounded-xl font-bold text-sm hover:bg-white/25 transition-colors cursor-pointer"
            >
              Clear
            </button>
          )}
          <button
            onClick={plan}
            disabled={planning}
            className="bg-white text-blue-600 px-5 py-3 rounded-xl font-bold text-sm hover:scale-105 transition-all cursor-pointer disabled:opacity-70 disabled:cursor-wait"
          >
            {planning ? 'Planning…' : mission ? 'Re-plan' : 'Plan a mission'}
          </button>
        </div>
      </div>

      {mission && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-5">
            <div className="max-w-2xl">
              <h2 className="text-xl font-black text-slate-800">{mission.title}</h2>
              <p className="text-sm text-slate-600 mt-1">{mission.briefing}</p>
              <p className="text-[11px] text-slate-400 mt-2">
                Starts from {startedFromDevice ? 'your current location' : 'the center of your neighborhood'}.
                {' '}Chose {mission.stops.length} of {mission.consideredReports} open reports, grouped into {mission.clusters} area{mission.clusters === 1 ? '' : 's'}.
                {mission.briefingSource === 'gemini' && ' Summary written by Gemini from these numbers.'}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center shrink-0">
              <div className="bg-slate-50 rounded-xl px-4 py-3">
                <div className="text-lg font-black text-slate-800">{mission.stops.length}</div>
                <div className="text-[10px] text-slate-500 font-bold uppercase">Stops</div>
              </div>
              <div className="bg-slate-50 rounded-xl px-4 py-3">
                <div className="text-lg font-black text-slate-800">{mission.totalKm.toFixed(1)} km</div>
                <div className="text-[10px] text-slate-500 font-bold uppercase">Walk</div>
              </div>
              <div className="bg-slate-50 rounded-xl px-4 py-3">
                <div className="text-lg font-black text-slate-800">~{mission.estimatedMinutes} min</div>
                <div className="text-[10px] text-slate-500 font-bold uppercase">Total</div>
              </div>
            </div>
          </div>

          <ol className="space-y-2">
            {mission.stops.map((stop, idx) => (
              <li key={stop.reportId}>
                <button
                  onClick={() => onSelectStop(stop.reportId)}
                  className="w-full text-left flex items-center gap-3 bg-slate-50 hover:bg-blue-50 rounded-xl p-3 transition-colors cursor-pointer"
                >
                  <span className="w-7 h-7 rounded-full bg-violet-600 text-white text-xs font-black flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-sm text-slate-800 truncate">{stop.title}</span>
                    <span className="block text-[11px] text-slate-500 truncate">
                      {stop.category} · {stop.reasons.join(' · ')}
                    </span>
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border shrink-0 ${URGENCY_STYLE[stop.urgency] || ''}`}>
                    {stop.urgency}
                  </span>
                  <span className="text-right shrink-0 w-16">
                    <span className="block text-sm font-black text-violet-600">{stop.score}</span>
                    <span className="block text-[10px] text-slate-400">+{stop.legKm.toFixed(2)} km</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <p className="text-[10px] text-slate-400 mt-3">
            Priority = urgency (3/2/1) × community support (log of upvotes + 2 × verifications) × waiting time (up to 2× after two weeks).
            Distances are straight-line; walking time assumes streets add 30%.
          </p>
        </div>
      )}
    </div>
  );
}
