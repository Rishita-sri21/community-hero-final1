import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Report, Squad } from '../types';
import CameraVerificationModal from './CameraVerificationModal';

interface HomeViewProps {
  userName: string;
  points: number;
  addPoints: (amount: number) => void;
  setView: (v: string) => void;
  reports: Report[];
  setReports: React.Dispatch<React.SetStateAction<Report[]>>;
  squads: Squad[];
}

export default function HomeView({
  userName,
  points,
  addPoints,
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

  const logActionsList = [
    { title: 'Planted Native Seedling', points: 15, icon: 'nature' },
    { title: 'Sorted Food Bank Donations', points: 25, icon: 'volunteer_activism' },
    { title: 'Cleared Trail Debris', points: 20, icon: 'park' },
    { title: 'Checked Streetlight Repair', points: 10, icon: 'lightbulb' }
  ];

  const handleActionRedeem = (amount: number, title: string) => {
    addPoints(amount);
    setJustEarned(amount);
    setShowActionOptions(false);
    
    setTimeout(() => {
      setJustEarned(null);
    }, 3000);
  };

  const handleVerify = (reportId: string) => {
    setReports(prev => prev.map(rep => {
      if (rep.id === reportId) {
        return { ...rep, verified: true, upvotes: rep.upvotes + 1 };
      }
      return rep;
    }));
    addPoints(15);
  };

  const handleUpvote = (reportId: string) => {
    setReports(prev => prev.map(rep => {
      if (rep.id === reportId) {
        return { ...rep, upvotes: rep.upvotes + 1 };
      }
      return rep;
    }));
    addPoints(5);
  };

  // SVG circular properties
  const targetPercent = Math.min((points / 1200) * 100, 100);

  return (
    <div className="space-y-12 animate-entrance max-w-[1200px] mx-auto px-4 py-6">
      
      {/* Welcome Hero Section */}
      <section className="relative rounded-2xl overflow-hidden shadow-[0_15px_35px_rgba(37,99,235,0.08)] bg-gradient-to-br from-slate-50 to-blue-50/30 border border-slate-100">
        <div className="absolute inset-0 z-0 bg-gradient-to-tr from-blue-500/5 via-transparent to-indigo-500/5 opacity-80 mix-blend-overlay"></div>
        
        <div className="relative z-10 p-8 md:p-12 flex flex-col md:flex-row items-center gap-8 md:gap-16">
          <div className="flex-1 space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 text-blue-700 font-sans text-xs font-bold border border-blue-100">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse"></span>
              Weekly Impact Active
            </div>
            <h2 className="font-sans text-3xl md:text-4xl font-black text-slate-800 tracking-tight">
              Welcome back, {userName}!
            </h2>
            <p className="font-sans text-sm md:text-base text-slate-600 max-w-lg leading-relaxed">
              Your community energy is driving real change this week. Log new local actions or verify nearby reports to claim rewards.
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
              {logActionsList.map((act, idx) => (
                <div 
                  key={idx}
                  onClick={() => handleActionRedeem(act.points, act.title)}
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

      {/* Active Initiatives Horizontal Slideshow */}
      <section>
        <div className="flex justify-between items-end mb-6">
          <div>
            <h3 className="font-sans text-xl font-black text-slate-800">Active Initiatives</h3>
            <p className="font-sans text-xs text-slate-500 mt-1">Join local efforts happening right now.</p>
          </div>
          <button 
            onClick={() => setView('squads')}
            className="text-blue-600 font-sans text-xs font-bold flex items-center gap-1 hover:opacity-80 transition-opacity cursor-pointer focus:outline-none"
          >
            See All <span className="material-symbols-outlined text-sm align-middle">arrow_forward</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Initiative Card 1 */}
          <div 
            onClick={() => setView('squads')}
            className="bg-white rounded-2xl p-4 cursor-pointer hover:-translate-y-1 transition-all border border-slate-100 shadow-sm flex flex-col justify-between"
          >
            <div>
              <div className="h-40 rounded-xl overflow-hidden mb-4 relative">
                <img 
                  alt="River Cleanup" 
                  className="w-full h-full object-cover" 
                  referrerPolicy="no-referrer"
                  src="https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=600"
                />
                <div className="absolute top-3 left-3 px-2.5 py-1 bg-white/90 backdrop-blur-md rounded-full font-sans text-[10px] font-bold text-slate-800 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">group</span> 24 Joined
                </div>
              </div>
              <h4 className="font-sans text-sm font-bold text-slate-800 line-clamp-1">Downtown Park Revitalization</h4>
              <p className="font-sans text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">Help us plant over 200 new saplings and clear debris from the main walking trails.</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-50 flex justify-between items-center text-[10px] font-bold text-blue-600 uppercase">
              <span>Park Maintenance</span>
              <span>Join Team</span>
            </div>
          </div>

          {/* Initiative Card 2 */}
          <div 
            onClick={() => setView('squads')}
            className="bg-white rounded-2xl p-4 cursor-pointer hover:-translate-y-1 transition-all border border-slate-100 shadow-sm flex flex-col justify-between"
          >
            <div>
              <div className="h-40 rounded-xl overflow-hidden mb-4 relative">
                <img 
                  alt="Street repair" 
                  className="w-full h-full object-cover" 
                  referrerPolicy="no-referrer"
                  src="https://images.unsplash.com/photo-1515162305285-0293e4767cc2?w=600"
                />
                <div className="absolute top-3 left-3 px-2.5 py-1 bg-white/90 backdrop-blur-md rounded-full font-sans text-[10px] font-bold text-slate-800 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">group</span> 42 Joined
                </div>
              </div>
              <h4 className="font-sans text-sm font-bold text-slate-800 line-clamp-1">Downtown Revitalization Squad</h4>
              <p className="font-sans text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">Painting designated eco-friendly crosswalks and auditing pothole hazards around central blocks.</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-50 flex justify-between items-center text-[10px] font-bold text-blue-600 uppercase">
              <span>Infrastructure</span>
              <span>Join Team</span>
            </div>
          </div>

          {/* Initiative Card 3 */}
          <div 
            onClick={() => setView('squads')}
            className="bg-white rounded-2xl p-4 cursor-pointer hover:-translate-y-1 transition-all border border-slate-100 shadow-sm flex flex-col justify-between"
          >
            <div>
              <div className="h-40 rounded-xl overflow-hidden mb-4 relative">
                <img 
                  alt="Recycling" 
                  className="w-full h-full object-cover" 
                  referrerPolicy="no-referrer"
                  src="https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=600"
                />
                <div className="absolute top-3 left-3 px-2.5 py-1 bg-white/90 backdrop-blur-md rounded-full font-sans text-[10px] font-bold text-slate-800 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px]">group</span> 12 Joined
                </div>
              </div>
              <h4 className="font-sans text-sm font-bold text-slate-800 line-clamp-1">Riverside Trail Eco Cleanup</h4>
              <p className="font-sans text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">Clearing river trail plastic waste and setting up custom-built organic recycling bins.</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-50 flex justify-between items-center text-[10px] font-bold text-blue-600 uppercase">
              <span>Waste Management</span>
              <span>Join Team</span>
            </div>
          </div>
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
                      <p className="text-[10px] text-slate-400 font-medium">{rep.timeAgo} • {rep.district}</p>
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
                    <img src={rep.image} alt="Hazard" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-50 flex justify-between items-center">
                <div className="flex gap-4">
                  <button 
                    onClick={() => handleUpvote(rep.id)}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition-colors cursor-pointer focus:outline-none"
                  >
                    <span className="material-symbols-outlined text-sm">thumb_up</span>
                    <span>{rep.upvotes}</span>
                  </button>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={() => handleVerify(rep.id)}
                    disabled={rep.verified}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer focus:outline-none ${
                      rep.verified 
                        ? 'bg-teal-50 text-teal-600 border border-teal-100' 
                        : 'bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[12px]">verified</span>
                    <span>{rep.verified ? 'Verified' : 'Verify Match'}</span>
                  </button>
                  <button 
                    onClick={() => setResolvingReport(rep)}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-full text-[10px] font-bold hover:bg-indigo-700 transition-all flex items-center gap-1 cursor-pointer focus:outline-none"
                  >
                    <span className="material-symbols-outlined text-[12px]">photo_camera</span>
                    <span>Resolve</span>
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
            onSuccess={(earned) => {
              addPoints(earned);
              setReports(prev => prev.filter(r => r.id !== resolvingReport.id));
              setResolvingReport(null);
            }}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
