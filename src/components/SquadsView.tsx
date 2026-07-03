import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Squad, Citizen, Transformation } from '../types';

interface SquadsViewProps {
  squads: Squad[];
  setSquads: React.Dispatch<React.SetStateAction<Squad[]>>;
  leaderboard: Citizen[];
  setLeaderboard: React.Dispatch<React.SetStateAction<Citizen[]>>;
  transformations: Transformation[];
  addPoints: (amount: number) => void;
  innerTab: 'squads' | 'stories';
  setInnerTab: (t: 'squads' | 'stories') => void;
}

export default function SquadsView({
  squads,
  setSquads,
  leaderboard,
  setLeaderboard,
  transformations,
  addPoints,
  innerTab,
  setInnerTab
}: SquadsViewProps) {
  
  // Squad interactive joining state
  const [activeSquadJoined, setActiveSquadJoined] = useState(false);
  const [joinedSquadIds, setJoinedSquadIds] = useState<string[]>([]);
  
  // High-five tracking counts
  const [highFives, setHighFives] = useState<Record<string, number>>({
    'Elena M.': 4,
    'Marcus T.': 2,
    'Samira K.': 0
  });

  // Story before-after toggle states (active side-by-side vs layered)
  const [storyToggle, setStoryToggle] = useState<Record<string, 'after' | 'before'>>({
    'trf-1': 'after',
    'trf-2': 'after'
  });

  const handleActiveSquadToggle = () => {
    setActiveSquadJoined(!activeSquadJoined);
    if (!activeSquadJoined) {
      addPoints(50);
    } else {
      addPoints(-50);
    }
  };

  const handleJoinSquad = (id: string) => {
    if (joinedSquadIds.includes(id)) {
      // Leave
      setJoinedSquadIds(joinedSquadIds.filter(sid => sid !== id));
      setSquads(prev => prev.map(sq => {
        if (sq.id === id) {
          return { ...sq, volunteersCount: sq.volunteersCount - 1 };
        }
        return sq;
      }));
      addPoints(-30);
    } else {
      // Join
      setJoinedSquadIds([...joinedSquadIds, id]);
      setSquads(prev => prev.map(sq => {
        if (sq.id === id) {
          return { ...sq, volunteersCount: sq.volunteersCount + 1 };
        }
        return sq;
      }));
      addPoints(30);
    }
  };

  const sendHighFive = (name: string) => {
    setHighFives(prev => ({
      ...prev,
      [name]: prev[name] + 1
    }));
    addPoints(5);
  };

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

      {/* -------------------- TAB 2: IMPACT HALL OF FAME (SUCCESS STORIES) -------------------- */}
      {innerTab === 'stories' && (
        <div className="space-y-12">
          
          {/* Local Positivity Vibe Check meter */}
          <div className="bg-white rounded-2xl p-6 max-w-sm mx-auto flex flex-col items-center gap-4 text-center border border-slate-100 shadow-sm">
            <span className="font-sans text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Local Positivity Vibe Check
            </span>
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden relative shadow-inner">
              <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-600 to-teal-500 rounded-full" style={{ width: '85%' }}></div>
            </div>
            <div className="flex justify-between w-full text-[10px] text-slate-400 font-sans font-bold">
              <span>Needs Love</span>
              <span className="text-teal-600">Thriving!</span>
            </div>
          </div>

          {/* Transformations Showcase */}
          <section className="space-y-6">
            <div className="flex justify-between items-end border-b border-slate-100 pb-3">
              <h2 className="font-sans text-lg font-black text-slate-800">Recent Transformations</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {transformations.map((trf) => {
                const isAfter = storyToggle[trf.id] === 'after';
                return (
                  <div key={trf.id} className="bg-white rounded-2xl overflow-hidden flex flex-col border border-slate-100 shadow-sm">
                    {/* Sliding Split-screen image view */}
                    <div className="relative h-60 md:h-72 w-full overflow-hidden border-b border-slate-50 bg-slate-50">
                      
                      {/* Before frame */}
                      <img 
                        alt="Before state"
                        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
                          !isAfter ? 'opacity-100 z-10' : 'opacity-0 z-0'
                        }`}
                        referrerPolicy="no-referrer"
                        src={trf.beforeImage}
                      />

                      {/* After frame */}
                      <img 
                        alt="After state"
                        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
                          isAfter ? 'opacity-100 z-10' : 'opacity-0 z-0'
                        }`}
                        referrerPolicy="no-referrer"
                        src={trf.afterImage}
                      />

                      {/* Overlay badges */}
                      <span className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-sm px-2.5 py-1 rounded-full font-sans text-[10px] font-bold text-white z-20">
                        Before
                      </span>
                      <span className="absolute top-4 right-4 bg-teal-500/90 backdrop-blur-sm px-2.5 py-1 rounded-full font-sans text-[10px] font-bold text-white z-20">
                        After
                      </span>

                      {/* Swipe / toggle trigger helper in middle */}
                      <div className="absolute inset-x-0 bottom-4 flex justify-center z-20">
                        <div className="flex bg-white/95 backdrop-blur-md p-1 rounded-full shadow-lg border border-slate-100">
                          <button 
                            onClick={() => setStoryToggle(p => ({ ...p, [trf.id]: 'before' }))}
                            className={`px-3 py-1.5 rounded-full font-sans text-[9px] font-bold cursor-pointer transition-colors focus:outline-none ${
                              !isAfter ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-blue-600'
                            }`}
                          >
                            Before
                          </button>
                          <button 
                            onClick={() => setStoryToggle(p => ({ ...p, [trf.id]: 'after' }))}
                            className={`px-3 py-1.5 rounded-full font-sans text-[9px] font-bold cursor-pointer transition-colors focus:outline-none ${
                              isAfter ? 'bg-teal-500 text-white' : 'text-slate-500 hover:text-teal-600'
                            }`}
                          >
                            After
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Meta info */}
                    <div className="p-6 space-y-3.5">
                      <div className="flex gap-2">
                        <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-sans text-[9px] font-bold border border-slate-200 shadow-xs">
                          {trf.category}
                        </span>
                      </div>
                      
                      <h3 className="font-sans text-sm font-bold text-slate-800 leading-tight">{trf.title}</h3>
                      <p className="font-sans text-xs text-slate-500 leading-relaxed">{trf.description}</p>
                      
                      <div className="pt-4 border-t border-slate-50 flex items-center gap-3">
                        <div className="flex -space-x-2.5">
                          {trf.heroesAvatars.map((av, idx) => (
                            <img 
                              key={idx} 
                              alt="Hero Avatar" 
                              className="w-8 h-8 rounded-full border border-white object-cover" 
                              referrerPolicy="no-referrer"
                              src={av}
                            />
                          ))}
                        </div>
                        <span className="font-sans text-[10px] font-bold text-slate-400">
                          {trf.reportedBy || `+${trf.heroesCount} Heroes participated`}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Top Weekly Contributors shoutouts */}
          <section className="space-y-6 relative pb-8">
            <div className="text-center">
              <h2 className="font-sans text-lg font-black text-slate-800">This Week's Top Contributors</h2>
              <p className="font-sans text-xs text-slate-500 mt-1">The folks making the most active impact for good.</p>
            </div>

            <div className="flex flex-wrap gap-6 justify-center">
              
              {/* Elena M. */}
              <div className="w-64 bg-white rounded-2xl p-6 flex flex-col items-center text-center gap-4 relative overflow-hidden border border-slate-100 shadow-sm">
                <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-bl-full opacity-60 z-0"></div>
                <div className="relative z-10">
                  <img alt="Top Hero" className="w-16 h-16 rounded-full border-2 border-white object-cover shadow-sm" referrerPolicy="no-referrer" src="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150" />
                  <div className="absolute bottom-0 right-0 bg-blue-100 text-blue-700 rounded-full w-5 h-5 flex items-center justify-center border border-white font-bold text-[9px] shadow-xs">
                    1
                  </div>
                </div>
                <div className="relative z-10">
                  <h3 className="font-sans text-sm font-bold text-slate-800 leading-none">Elena M.</h3>
                  <p className="font-sans text-[10px] text-blue-600 font-bold uppercase mt-1">Local Legend</p>
                </div>
                <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-100">3,100 pts earned</span>
                
                <button 
                  onClick={() => sendHighFive('Elena M.')}
                  className="px-4 py-2 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 font-sans text-[10px] font-bold transition-all flex items-center gap-1.5 focus:outline-none cursor-pointer border border-blue-100"
                >
                  <span className="material-symbols-outlined text-xs">waving_hand</span> 
                  High Five ({highFives['Elena M.']})
                </button>
              </div>

              {/* Marcus T. */}
              <div className="w-64 bg-white rounded-2xl p-6 flex flex-col items-center text-center gap-4 relative overflow-hidden border border-slate-100 shadow-sm">
                <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-bl-full opacity-60 z-0"></div>
                <div className="relative z-10">
                  <img alt="Hero 2" className="w-16 h-16 rounded-full border-2 border-white object-cover shadow-sm" referrerPolicy="no-referrer" src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150" />
                  <div className="absolute bottom-0 right-0 bg-slate-200 text-slate-700 rounded-full w-5 h-5 flex items-center justify-center border border-white font-bold text-[9px] shadow-xs">
                    2
                  </div>
                </div>
                <div className="relative z-10">
                  <h3 className="font-sans text-sm font-bold text-slate-800 leading-none">Marcus T.</h3>
                  <p className="font-sans text-[10px] text-blue-600 font-bold uppercase mt-1">Pavement Pioneer</p>
                </div>
                <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-100">2,450 pts earned</span>
                
                <button 
                  onClick={() => sendHighFive('Marcus T.')}
                  className="px-4 py-2 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 font-sans text-[10px] font-bold transition-all flex items-center gap-1.5 focus:outline-none cursor-pointer border border-blue-100"
                >
                  <span className="material-symbols-outlined text-xs">waving_hand</span> 
                  High Five ({highFives['Marcus T.']})
                </button>
              </div>

              {/* Samira K. */}
              <div className="w-64 bg-white rounded-2xl p-6 flex flex-col items-center text-center gap-4 relative overflow-hidden border border-slate-100 shadow-sm">
                <div className="relative z-10">
                  <div className="w-16 h-16 rounded-full border border-slate-100 bg-slate-50 text-blue-600 flex items-center justify-center font-bold shadow-sm">
                    <span className="material-symbols-outlined text-2xl">person</span>
                  </div>
                  <div className="absolute bottom-0 right-0 bg-slate-200 text-slate-700 rounded-full w-5 h-5 flex items-center justify-center border border-white font-bold text-[9px] shadow-xs">
                    3
                  </div>
                </div>
                <div className="relative z-10">
                  <h3 className="font-sans text-sm font-bold text-slate-800 leading-none">Samira K.</h3>
                  <p className="font-sans text-[10px] text-slate-500 font-bold uppercase mt-1">Eco Guardian</p>
                </div>
                <span className="text-[10px] font-bold text-teal-600 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-100">1,800 pts earned</span>
                
                <button 
                  onClick={() => sendHighFive('Samira K.')}
                  className="px-4 py-2 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-600 font-sans text-[10px] font-bold transition-all flex items-center gap-1.5 focus:outline-none cursor-pointer border border-blue-100"
                >
                  <span className="material-symbols-outlined text-xs">waving_hand</span> 
                  High Five ({highFives['Samira K.']})
                </button>
              </div>

            </div>
          </section>

        </div>
      )}

    </div>
  );
}
