import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Squad, Citizen, Story } from '../types';
import { assetUrl } from '../config';
import { api } from '../lib/api';
import { toast, errorMessage } from '../lib/toast';

interface SquadsViewProps {
  squads: Squad[];
  setSquads: React.Dispatch<React.SetStateAction<Squad[]>>;
  leaderboard: Citizen[];
  setPoints: (total: number) => void;
  // Squads the user has joined, as stored on the server
  joinedSquadIds: string[];
  onJoinedSquadsChange: (ids: string[]) => void;
  innerTab: 'squads' | 'stories';
  setInnerTab: (t: 'squads' | 'stories') => void;
}

export default function SquadsView({
  squads,
  setSquads,
  leaderboard,
  setPoints,
  joinedSquadIds,
  onJoinedSquadsChange,
  innerTab,
  setInnerTab
}: SquadsViewProps) {
  
  // Squad interactive joining state
  const FEATURED_SQUAD_ID = 'sq-featured';
  const activeSquadJoined = joinedSquadIds.includes(FEATURED_SQUAD_ID);
  const [pendingSquadId, setPendingSquadId] = useState<string | null>(null);
  
  // Resolved reports with before and after photos, loaded when the stories tab opens
  const [stories, setStories] = useState<Story[] | null>(null);
  const [storyToggle, setStoryToggle] = useState<Record<string, 'after' | 'before'>>({});

  useEffect(() => {
    if (innerTab !== 'stories') return;
    api.getStories()
      .then(setStories)
      .catch((err) => {
        toast.error(errorMessage(err, 'Could not load stories.'));
        setStories([]);
      });
  }, [innerTab]);

  // Join or leave a squad on the server. The join bonus is paid only the first time;
  // leaving never costs points, and re-joining never pays again.
  const toggleSquad = async (id: string) => {
    if (pendingSquadId) return;
    setPendingSquadId(id);
    const isJoined = joinedSquadIds.includes(id);
    try {
      if (isJoined) {
        const { joinedSquads } = await api.leaveSquad(id);
        onJoinedSquadsChange(joinedSquads);
      } else {
        const { joinedSquads, points, awarded } = await api.joinSquad(id);
        onJoinedSquadsChange(joinedSquads);
        setPoints(points);
        toast.success(awarded > 0 ? `Welcome to the squad! +${awarded} Hero Points` : 'Welcome back to the squad!');
      }
      setSquads(prev => prev.map(sq => (
        sq.id === id ? { ...sq, volunteersCount: sq.volunteersCount + (isJoined ? -1 : 1) } : sq
      )));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPendingSquadId(null);
    }
  };

  const handleActiveSquadToggle = () => toggleSquad(FEATURED_SQUAD_ID);
  const handleJoinSquad = (id: string) => toggleSquad(id);

  return (
    <div className="space-y-12 animate-entrance max-w-[1200px] mx-auto px-4 py-6">
      
      {/* Header and Sub-tab toggler */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-slate-100 pb-6">
        <div>
          <h1 className="font-sans text-3xl font-black text-slate-800 mb-2">
            {innerTab === 'squads' && "Community Squads"}
            {innerTab === 'stories' && "Impact Hall of Fame"}
          </h1>
          <p className="font-sans text-sm text-slate-500 max-w-2xl leading-relaxed">
            {innerTab === 'squads' && "Join active civic mobilization teams to tackle neighborhood priorities together."}
            {innerTab === 'stories' && "Celebrating the incredible transformations driven by everyday heroes in our neighborhoods."}
          </p>
        </div>

        {/* Cohesive Sub-tab Toggler */}
        <div className="flex bg-slate-100 p-1 rounded-full border border-slate-200 shadow-inner w-full md:w-auto">
          <button 
            onClick={() => setInnerTab('squads')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-full font-sans text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer focus:outline-none ${
              innerTab === 'squads' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:text-blue-600'
            }`}
          >
            <span className="material-symbols-outlined text-sm">groups</span> Active Squads
          </button>
          <button 
            onClick={() => setInnerTab('stories')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-full font-sans text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer focus:outline-none ${
              innerTab === 'stories' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:text-blue-600'
            }`}
          >
            <span className="material-symbols-outlined text-sm">workspace_premium</span> Hall of Fame
          </button>
        </div>
      </div>

      {/* -------------------- TAB 1: COMMUNITY SQUADS -------------------- */}
      {innerTab === 'squads' && (
        <>
          {/* Active Mission Card */}
          <section>
            <div className="bg-slate-50 rounded-2xl p-8 md:p-10 relative overflow-hidden border border-slate-100">
              <div className="relative z-10 grid md:grid-cols-2 gap-12 items-center">
                <div className="space-y-6">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full font-sans text-xs font-bold border border-blue-200">
                    <span className="material-symbols-outlined text-sm">verified</span>
                    Active Mission
                  </div>
                  <h1 className="font-sans text-2xl md:text-3xl font-black text-slate-800 leading-tight">
                    Downtown Revitalization Squad
                  </h1>
                  <p className="font-sans text-xs md:text-sm text-slate-600 max-w-lg leading-relaxed">
                    We are mobilizing to paint crosswalks and clear debris in the historic district. Join {activeSquadJoined ? 43 : 42} other citizens making a difference today.
                  </p>
                  
                  {/* Mission progress tracking */}
                  <div className="space-y-3">
                    <div className="flex justify-between font-sans text-xs font-bold text-slate-500">
                      <span>Mission Progress</span>
                      <span className="font-black text-blue-600">{activeSquadJoined ? '80%' : '75%'}</span>
                    </div>
                    <div className="h-3.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full transition-all duration-500" 
                        style={{ width: activeSquadJoined ? '80%' : '75%' }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 items-center">
                    <button 
                      onClick={handleActiveSquadToggle}
                      className={`font-sans text-xs font-bold px-6 py-3.5 rounded-full transition-all flex items-center gap-2 cursor-pointer shadow-md focus:outline-none ${
                        activeSquadJoined 
                          ? 'bg-teal-500 text-white hover:bg-teal-600' 
                          : 'bg-blue-600 text-white hover:bg-blue-700 hover:scale-[1.02]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {activeSquadJoined ? 'check_circle' : 'add_task'}
                      </span>
                      {activeSquadJoined ? 'Joined Squad ✓' : 'Join Squad'}
                    </button>

                    {/* Member Avatars Row */}
                    <div className="flex -space-x-3 pl-2">
                      <img alt="Member" className="w-10 h-10 rounded-full border-2 border-white object-cover shadow-sm" referrerPolicy="no-referrer" src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150" />
                      <img alt="Member" className="w-10 h-10 rounded-full border-2 border-white object-cover shadow-sm" referrerPolicy="no-referrer" src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150" />
                      <img alt="Member" className="w-10 h-10 rounded-full border-2 border-white object-cover shadow-sm" referrerPolicy="no-referrer" src="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150" />
                      <div className="w-10 h-10 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center font-sans text-xs text-slate-700 font-bold shadow-sm z-10">
                        +{activeSquadJoined ? 40 : 39}
                      </div>
                    </div>
                  </div>
                </div>

                {/* District map representation */}
                <div className="relative h-[280px] rounded-2xl overflow-hidden border border-slate-200 shadow-md select-none">
                  <div 
                    className="bg-cover bg-center w-full h-full absolute inset-0 pointer-events-none" 
                    style={{ 
                      backgroundImage: "url('https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/-122.4194,37.7749,12,0/800x600?access_token=mock')",
                      filter: 'grayscale(0.1)'
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent"></div>
                  
                  <div className="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur-sm p-4 rounded-xl flex items-center gap-3 border border-slate-100 shadow-lg">
                    <div className="bg-blue-50 text-blue-600 p-2 rounded-xl flex-shrink-0 leading-none">
                      <span className="material-symbols-outlined text-lg">location_on</span>
                    </div>
                    <div>
                      <h3 className="font-sans text-xs font-bold text-slate-800">Historic District</h3>
                      <p className="font-sans text-[10px] text-slate-500 mt-0.5">Meeting at Main &amp; 4th</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Bento grid containing recommended squads and Your Impact / Leaderboard sidebar */}
          <section className="grid md:grid-cols-12 gap-6">
            
            {/* Squads listing column (8 columns) */}
            <div className="md:col-span-8 space-y-6">
              <h2 className="font-sans text-lg font-black text-slate-800">Explore Squads</h2>
              <div className="grid sm:grid-cols-2 gap-6">
                
                {squads.map((sq) => {
                  const isJoined = joinedSquadIds.includes(sq.id);
                  const progressPercentage = Math.min((sq.volunteersCount / sq.volunteersMax) * 100, 100);
                  return (
                    <div 
                      key={sq.id} 
                      className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <div className={`p-2.5 rounded-xl ${
                            sq.category === 'park' ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-blue-50 text-blue-600 border border-blue-100'
                          }`}>
                            <span className="material-symbols-outlined text-base">{sq.icon}</span>
                          </div>
                          <span className="bg-slate-50 text-slate-500 px-2.5 py-1 rounded-full font-sans text-[9px] font-bold border border-slate-100">{sq.distance}</span>
                        </div>

                        <h3 className="font-sans text-sm font-bold text-slate-800 mb-1.5">{sq.name}</h3>
                        <p className="font-sans text-xs text-slate-500 mb-6 leading-relaxed">{sq.description}</p>
                      </div>
                      
                      <div className="space-y-4 mt-auto">
                        <div className="flex justify-between font-sans text-[10px] font-bold text-slate-500">
                          <span>{sq.volunteersCount}/{sq.volunteersMax} Volunteers</span>
                          <span>{Math.round(progressPercentage)}%</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${sq.category === 'park' ? 'bg-green-500' : 'bg-blue-600'}`} 
                            style={{ width: `${progressPercentage}%` }}
                          />
                        </div>

                        <button 
                          onClick={() => handleJoinSquad(sq.id)}
                          className={`w-full py-2.5 rounded-full font-sans text-xs font-bold transition-all border cursor-pointer focus:outline-none ${
                            isJoined 
                              ? 'bg-teal-500 text-white border-teal-600 hover:bg-teal-600' 
                              : 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                          }`}
                        >
                          {isJoined ? 'Joined Team ✓' : 'Volunteer Now'}
                        </button>
                      </div>
                    </div>
                  );
                })}

              </div>
            </div>

            {/* Sidebar Your Impact Leaderboard (4 columns) */}
            <div className="md:col-span-4 space-y-6">
              <h2 className="font-sans text-lg font-black text-slate-800">Your Impact</h2>
              
              <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-6">
                <div className="text-center border-b border-slate-50 pb-6">
                  <div className="inline-block relative">
                    <img 
                      alt="Your Profile" 
                      className="w-16 h-16 rounded-full border border-slate-100 shadow-md object-cover mb-2" 
                      referrerPolicy="no-referrer"
                      src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150" 
                    />
                    <div className="absolute bottom-0 right-0 bg-blue-100 text-blue-600 rounded-full w-6 h-6 flex items-center justify-center border-2 border-white font-bold text-[10px] shadow-xs">
                      12
                    </div>
                  </div>
                  <h3 className="font-sans text-sm font-bold text-slate-800">Sarah Jenkins</h3>
                  <p className="font-sans text-[10px] text-blue-600 font-bold tracking-wider uppercase mt-0.5">Local Legend Rank</p>
                </div>

                <div className="space-y-4">
                  <h4 className="font-sans text-[10px] text-slate-400 uppercase tracking-wider font-bold">Recent Badges</h4>
                  <div className="grid grid-cols-3 gap-3">
                    
                    <div className="flex flex-col items-center gap-1 group cursor-pointer">
                      <div className="w-11 h-11 bg-green-50 border border-green-100 rounded-full flex items-center justify-center shadow-xs text-green-600">
                        <span className="material-symbols-outlined text-[18px]">eco</span>
                      </div>
                      <span className="font-sans text-[9px] text-center leading-tight font-bold text-slate-500">Eco Warrior</span>
                    </div>

                    <div className="flex flex-col items-center gap-1 group cursor-pointer">
                      <div className="w-11 h-11 bg-blue-50 border border-blue-100 rounded-full flex items-center justify-center shadow-xs text-blue-600">
                        <span className="material-symbols-outlined text-[18px]">construction</span>
                      </div>
                      <span className="font-sans text-[9px] text-center leading-tight font-bold text-slate-500">Pavement Pioneer</span>
                    </div>

                    <div className="flex flex-col items-center gap-1 group cursor-pointer opacity-40">
                      <div className="w-11 h-11 bg-slate-50 border border-dashed border-slate-200 rounded-full flex items-center justify-center text-slate-400">
                        <span className="material-symbols-outlined text-[18px]">group</span>
                      </div>
                      <span className="font-sans text-[9px] text-center leading-tight font-bold text-slate-400">Squad Leader</span>
                    </div>

                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <h4 className="font-sans text-[10px] text-slate-400 uppercase tracking-wider font-bold">Top Citizens</h4>
                  <ul className="space-y-2.5">
                    {leaderboard.map((cit) => (
                      <li 
                        key={cit.rank}
                        className={`flex items-center gap-2.5 p-1.5 rounded-xl transition-all ${
                          cit.isCurrentUser 
                            ? 'bg-blue-50/50 border border-blue-100 text-blue-700' 
                            : 'hover:bg-slate-50/50'
                        }`}
                      >
                        <span className="font-bold text-[10px] w-4 text-center text-slate-400">{cit.rank}</span>
                        <img 
                          alt={cit.name} 
                          className="w-7 h-7 rounded-full object-cover border border-slate-100" 
                          referrerPolicy="no-referrer"
                          src={cit.avatar} 
                        />
                        <span className="font-sans flex-grow text-xs font-semibold truncate text-slate-700">{cit.name}</span>
                        <span className="font-sans text-xs font-black text-blue-600">
                          {cit.points.toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

          </section>
        </>
      )}

      {/* -------------------- TAB 2: BEFORE & AFTER STORIES -------------------- */}
      {innerTab === 'stories' && (
        <div className="space-y-12">
          <section className="space-y-6">
            <div className="flex justify-between items-end border-b border-slate-100 pb-3">
              <h2 className="font-sans text-lg font-black text-slate-800">Recently fixed</h2>
              <span className="text-[11px] text-slate-400">Every story is a real report, closed with a verified photo</span>
            </div>

            {stories === null && <p className="text-sm text-slate-500">Loading stories…</p>}
            {stories?.length === 0 && (
              <div className="bg-white rounded-2xl p-8 border border-slate-100 text-center text-sm text-slate-500">
                No fixes yet. When someone resolves a report with a photo, it shows up here with its before and after pictures.
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {stories?.map((story) => {
                const showBefore = !!story.beforeImage && storyToggle[story.id] === 'before';
                return (
                  <article key={story.id} className="bg-white rounded-2xl overflow-hidden flex flex-col border border-slate-100 shadow-sm">
                    <div className="relative h-60 md:h-72 w-full overflow-hidden border-b border-slate-50 bg-slate-100">
                      <img
                        alt={showBefore ? 'Before the fix' : 'After the fix'}
                        className="absolute inset-0 w-full h-full object-cover"
                        src={assetUrl(showBefore ? story.beforeImage! : story.afterImage)}
                      />
                      <span className={`absolute top-4 left-4 backdrop-blur-sm px-2.5 py-1 rounded-full font-sans text-[10px] font-bold text-white z-20 ${showBefore ? 'bg-slate-900/80' : 'bg-teal-500/90'}`}>
                        {showBefore ? 'Before' : 'After'}
                      </span>
                      {story.beforeImage ? (
                        <div className="absolute inset-x-0 bottom-4 flex justify-center z-20">
                          <div className="flex bg-white/95 backdrop-blur-md p-1 rounded-full shadow-lg border border-slate-100">
                            {(['before', 'after'] as const).map((side) => (
                              <button
                                key={side}
                                onClick={() => setStoryToggle((p) => ({ ...p, [story.id]: side }))}
                                className={`px-3 py-1.5 rounded-full font-sans text-[9px] font-bold cursor-pointer transition-colors focus:outline-none capitalize ${
                                  (side === 'before') === showBefore ? (side === 'before' ? 'bg-blue-600 text-white' : 'bg-teal-500 text-white') : 'text-slate-500'
                                }`}
                              >
                                {side}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className="absolute bottom-4 left-4 bg-white/90 px-2.5 py-1 rounded-full text-[10px] font-semibold text-slate-500 z-20">
                          No photo was taken when this was reported
                        </span>
                      )}
                    </div>

                    <div className="p-6 space-y-3">
                      <div className="flex flex-wrap gap-2 text-[9px] font-bold">
                        <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full border border-slate-200">{story.category}</span>
                        <span className="bg-teal-50 text-teal-700 px-2.5 py-1 rounded-full border border-teal-100">
                          Fixed in {story.hoursToResolve < 1 ? 'under an hour' : story.hoursToResolve < 48 ? `${Math.round(story.hoursToResolve)} h` : `${Math.round(story.hoursToResolve / 24)} days`}
                        </span>
                      </div>
                      <h3 className="font-sans text-sm font-bold text-slate-800 leading-tight">{story.title}</h3>
                      {story.details && <p className="font-sans text-xs text-slate-500 leading-relaxed">{story.details}</p>}
                      <p className="pt-3 border-t border-slate-50 text-[11px] text-slate-500">
                        Reported by <strong className="text-slate-700">{story.reportedBy.name}</strong>, fixed by <strong className="text-slate-700">{story.resolvedBy.name}</strong>
                        {' '}on {new Date(story.resolvedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          {leaderboard.length > 0 && (
            <section className="space-y-6 pb-8">
              <div className="text-center">
                <h2 className="font-sans text-lg font-black text-slate-800">Top contributors</h2>
                <p className="font-sans text-xs text-slate-500 mt-1">Ranked by Hero Points earned.</p>
              </div>
              <div className="flex flex-wrap gap-6 justify-center">
                {leaderboard.slice(0, 3).map((cit) => (
                  <div key={cit.rank} className="w-56 bg-white rounded-2xl p-6 flex flex-col items-center text-center gap-3 border border-slate-100 shadow-sm">
                    <div className="relative">
                      <img alt={cit.name} className="w-16 h-16 rounded-full border-2 border-white object-cover shadow-sm" referrerPolicy="no-referrer" src={cit.avatar} />
                      <div className="absolute bottom-0 right-0 bg-blue-100 text-blue-700 rounded-full w-5 h-5 flex items-center justify-center border border-white font-bold text-[9px]">
                        {cit.rank}
                      </div>
                    </div>
                    <h3 className="font-sans text-sm font-bold text-slate-800">{cit.name}</h3>
                    <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-100">
                      {cit.points.toLocaleString()} pts
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

    </div>
  );
}
