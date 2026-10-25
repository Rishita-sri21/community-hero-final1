import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Report, Squad } from '../types';
import CameraVerificationModal from './CameraVerificationModal';
import { api } from '../lib/api';
import { assetUrl, placeLabel } from '../config';
import { toast, errorMessage } from '../lib/toast';
import { GREEN_ACTIONS } from '../shared/catalog';
import { useReportActions } from '../hooks/useReportActions';

interface HomeViewProps {
  userName: string;
  points: number;
  setPoints: (total: number) => void;
  setView: (v: string) => void;
  reports: Report[];
  setReports: React.Dispatch<React.SetStateAction<Report[]>>;
  squads: Squad[];
}

export default function HomeView({
  userName,
  points,
  setPoints,
  setView,
  reports,
  setReports,
  squads
}: HomeViewProps) {
  const [showActionOptions, setShowActionOptions] = useState(false);
  const [justEarned, setJustEarned] = useState<number | null>(null);
  const [resolvingReport, setResolvingReport] = useState<Report | null>(null);

  // local animated points indicator to match circular dial animation
  const [localDisplayPoints, setLocalDisplayPoints] = useState(0);

  useEffect(() => {
    // Animate points count up to actual points
    const duration = 1000;
    const steps = 30;
    const stepTime = duration / steps;
    let step = 0;
    const startPoints = localDisplayPoints;
    const endPoints = points;
    const diff = endPoints - startPoints;

    const timer = setInterval(() => {
      step++;
      const progress = step / steps;
      // easeOutQuad
      const easedProgress = progress * (2 - progress);
      const current = Math.floor(startPoints + diff * easedProgress);
      
      setLocalDisplayPoints(current);

      if (step >= steps) {
        clearInterval(timer);
        setLocalDisplayPoints(endPoints);
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [points]);

  const { upvote: handleUpvote, verify: handleVerify } = useReportActions(setReports, setPoints);

  // The server checks the action exists and hasn't been logged today, then awards its points
  const handleActionRedeem = async (actionId: string) => {
    try {
      const { points: total, awarded } = await api.logGreenAction(actionId);
      setPoints(total);
      setJustEarned(awarded);
      setShowActionOptions(false);
      setTimeout(() => {
        setJustEarned(null);
      }, 3000);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  // SVG circular properties
  // Progress toward the next 500-point milestone
  const nextMilestone = (Math.floor(points / 500) + 1) * 500;
  const targetPercent = ((points % 500) / 500) * 100;

  return (
    <div className="space-y-12 animate-entrance max-w-[1200px] mx-auto px-4 py-6">
      
      {/* Welcome Hero Section */}
      <section className="relative rounded-2xl overflow-hidden shadow-[0_15px_35px_rgba(37,99,235,0.08)] bg-gradient-to-br from-slate-50 to-blue-50/30 border border-slate-100">
        <div className="absolute inset-0 z-0 bg-gradient-to-tr from-blue-500/5 via-transparent to-indigo-500/5 opacity-80 mix-blend-overlay"></div>
        
        <div className="relative z-10 p-8 md:p-12 flex flex-col md:flex-row items-center gap-8 md:gap-16">
          <div className="flex-1 space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 text-blue-700 font-sans text-xs font-bold border border-blue-100">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse"></span>
              {reports.length} open report{reports.length === 1 ? '' : 's'} near you
            </div>
            <h2 className="font-sans text-3xl md:text-4xl font-black text-slate-800 tracking-tight">
              Welcome back, {userName}!
            </h2>
            <p className="font-sans text-sm md:text-base text-slate-600 max-w-lg leading-relaxed">
              Report problems on the map, verify your neighbors' reports, and fix what you can. Every point is awarded by the server for something you actually did.
            </p>

            <div className="relative space-y-3 pt-2">
              <div className="flex flex-wrap items-center gap-3">
                <button 
                  onClick={() => setShowActionOptions(!showActionOptions)}
                  className="px-6 py-3.5 rounded-full bg-blue-600 text-white font-sans text-xs font-bold shadow-[0_10px_20px_rgba(37,99,235,0.2)] hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2 cursor-pointer focus:outline-none"
                >
                  <span>Log Completed Action</span>
                  <span className="material-symbols-outlined font-semibold" style={{ fontVariationSettings: "'FILL' 1" }}>
                    add_circle
                  </span>
                </button>

                <button 
                  onClick={() => setView('map')}
                  className="px-6 py-3.5 rounded-full bg-white text-blue-600 border border-blue-200 font-sans text-xs font-bold shadow-sm hover:bg-blue-50/30 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2 cursor-pointer focus:outline-none"
                >
                  <span>Report Local Problem / Hazard</span>
                  <span className="material-symbols-outlined text-blue-600 text-sm">
                    report_problem
                  </span>
                </button>
              </div>

              {/* Floating success banner after logging an action */}
              <AnimatePresence>
                {justEarned && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute top-16 left-0 right-0 md:right-auto md:w-80 bg-teal-500 text-white p-3.5 rounded-xl shadow-lg flex items-center gap-2 z-30 border border-teal-400/20"
                  >
                    <span className="material-symbols-outlined">celebration</span>
                    <span className="font-sans text-xs font-semibold">Action logged successfully! +{justEarned} Points earned.</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            </div>

          {/* Impact Dial */}
          <div className="w-full md:w-1/3 flex flex-col items-center justify-center">
            <div className="relative w-40 h-40">
              <svg className="text-blue-100 w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f1f5f9" strokeWidth="3" />
                <circle 
                  cx="18" 
                  cy="18" 
                  r="15.915" 
                  fill="none" 
                  stroke="#2563eb" 
                  strokeWidth="3" 
                  strokeDasharray={`${targetPercent}, 100`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-sans text-3xl font-black text-slate-800 tracking-tight" id="impact-score">
                  {localDisplayPoints}
                </span>
                <span className="font-sans text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-1">
                  Points
                </span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 font-semibold mt-2">{nextMilestone - points} to {nextMilestone.toLocaleString()}</p>
          </div>
        </div>
      </section>

      {/* Log Action Sheet / Slider */}
      <AnimatePresence>
        {showActionOptions && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-white rounded-xl p-6 shadow-md border border-slate-100"
          >
            <h3 className="font-sans text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-600">volunteer_activism</span>
              What positive impact did you make today?
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {GREEN_ACTIONS.map((act) => (
                <div 
                  key={act.id}
                  onClick={() => handleActionRedeem(act.id)}
                  className="bg-slate-50 p-4 rounded-xl cursor-pointer hover:bg-blue-50/50 hover:shadow-sm hover:-translate-y-1 transition-all flex flex-col justify-between items-start h-32 border border-slate-100"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-lg">{act.icon}</span>
                  </div>
                  <div>
                    <h4 className="font-sans text-xs font-bold text-slate-800 leading-tight mb-1">{act.title}</h4>
                    <span className="font-sans text-xs font-bold text-teal-600">+{act.points} Points</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Squads, with numbers counted from the database */}
      <section>
        <div className="flex justify-between items-end mb-6">
          <div>
            <h3 className="font-sans text-xl font-black text-slate-800">Squads near you</h3>
            <p className="font-sans text-xs text-slate-500 mt-1">Each squad looks after a few kinds of problems in your area.</p>
          </div>
          <button
            onClick={() => setView('squads')}
            className="text-blue-600 font-sans text-xs font-bold flex items-center gap-1 hover:opacity-80 transition-opacity cursor-pointer focus:outline-none"
          >
            See all <span className="material-symbols-outlined text-sm align-middle">arrow_forward</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {squads.map((sq) => (
            <button
              key={sq.id}
              onClick={() => setView('squads')}
              className="text-left bg-white rounded-2xl p-5 cursor-pointer hover:-translate-y-1 transition-all border border-slate-100 shadow-sm flex flex-col gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                  <span className="material-symbols-outlined text-base">{sq.icon}</span>
                </div>
                <div>
                  <h4 className="font-sans text-sm font-bold text-slate-800">{sq.name}</h4>
                  <p className="text-[10px] font-bold text-slate-400">{sq.members} member{sq.members === 1 ? '' : 's'}{sq.joined ? ' · you joined' : ''}</p>
                </div>
              </div>
              <p className="font-sans text-xs text-slate-500 leading-relaxed">{sq.description}</p>
              <div className="flex justify-between text-[10px] font-bold uppercase mt-auto pt-3 border-t border-slate-50">
                <span className="text-red-500">{sq.openNearby} open near you</span>
                <span className="text-teal-600">{sq.fixedByMembers} fixed</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Community Hazards / Reports Area */}
      <section className="space-y-6">
        <div className="flex justify-between items-end">
          <div>
            <h3 className="font-sans text-xl font-black text-slate-800">Recent Hazard Reports</h3>
            <p className="font-sans text-xs text-slate-500 mt-1">Verify near-by issues to keep city datasets clean.</p>
          </div>
          <button 
            onClick={() => setView('map')}
            className="text-blue-600 font-sans text-xs font-bold flex items-center gap-1 hover:opacity-80 transition-opacity cursor-pointer focus:outline-none"
          >
            Map View <span className="material-symbols-outlined text-sm align-middle">map</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {reports.slice(0, 2).map((rep) => (
            <div key={rep.id} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2.5">
                    <img src={rep.reporter.avatar} alt="User" className="w-8 h-8 rounded-full object-cover" />
                    <div>
                      <p className="text-xs font-bold text-slate-800">{rep.reporter.name}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{rep.timeAgo} • {placeLabel(rep)}</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${
                    rep.urgency === 'High' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                    {rep.urgency} Urgency
                  </span>
                </div>

                <h4 className="font-sans text-sm font-bold text-slate-800 mt-1">{rep.title}</h4>
                <p className="font-sans text-xs text-slate-500 leading-relaxed line-clamp-3">{rep.description}</p>
                
                {rep.image && (
                  <div className="h-28 rounded-xl overflow-hidden bg-slate-100">
                    <img src={assetUrl(rep.image)} alt="Hazard" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-50 flex justify-between items-center">
                <div className="flex gap-4">
                  <button 
                    onClick={() => handleUpvote(rep.id)}
                    disabled={rep.isMine || rep.hasUpvoted}
                    title={rep.isMine ? 'This is your report' : rep.hasUpvoted ? 'You upvoted this' : 'Upvote'}
                    className={`flex items-center gap-1 text-xs transition-colors focus:outline-none disabled:cursor-default ${
                      rep.hasUpvoted ? 'text-blue-600' : 'text-slate-500 hover:text-blue-600 cursor-pointer'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">thumb_up</span>
                    <span>{rep.upvotes}</span>
                  </button>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={() => handleVerify(rep.id)}
                    disabled={rep.isMine || rep.hasVerified}
                    title={rep.isMine ? 'You can\'t verify your own report' : undefined}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-1 transition-all focus:outline-none disabled:cursor-default ${
                      rep.hasVerified 
                        ? 'bg-teal-50 text-teal-600 border border-teal-100' 
                        : rep.isMine
                          ? 'bg-slate-50 text-slate-400 border border-slate-100'
                          : 'bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 cursor-pointer'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[12px]">verified</span>
                    <span>{rep.hasVerified ? 'You verified' : rep.verified ? 'Verified · Confirm' : 'Verify Match'}</span>
                  </button>
                  <button 
                    onClick={() => setResolvingReport(rep)}
                    title={rep.isMine ? 'Close your own report with a photo of the fix (no points)' : undefined}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-full text-[10px] font-bold hover:bg-indigo-700 transition-all flex items-center gap-1 cursor-pointer focus:outline-none"
                  >
                    <span className="material-symbols-outlined text-[12px]">photo_camera</span>
                    <span>{rep.isMine ? 'Mark fixed' : 'Resolve'}</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Render Camera Resolution Proof modal if active */}
      <AnimatePresence>
        {resolvingReport && (
          <CameraVerificationModal 
            report={resolvingReport}
            onClose={() => setResolvingReport(null)}
            onSuccess={(totalPoints) => {
              if (totalPoints !== null) setPoints(totalPoints);
              setReports(prev => prev.filter(r => r.id !== resolvingReport.id));
              setResolvingReport(null);
            }}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
