import React, { useEffect, useState } from 'react';
import { Squad, Citizen, Story, UserStats } from '../types';
import { assetUrl } from '../config';
import { api } from '../lib/api';
import { toast, errorMessage } from '../lib/toast';

interface SquadsViewProps {
  squads: Squad[];
  leaderboard: Citizen[];
  user: { name: string; avatar?: string };
  setPoints: (total: number) => void;
  // Squads the user has joined, as stored on the server
  joinedSquadIds: string[];
  onJoinedSquadsChange: (ids: string[]) => void;
  innerTab: 'squads' | 'stories';
  setInnerTab: (t: 'squads' | 'stories') => void;
}

export default function SquadsView({
  squads,
  leaderboard,
  user,
  setPoints,
  joinedSquadIds,
  onJoinedSquadsChange,
  innerTab,
  setInnerTab
}: SquadsViewProps) {
  
  const [pendingSquadId, setPendingSquadId] = useState<string | null>(null);

  // What the user has actually done, counted by the server
  const [stats, setStats] = useState<UserStats | null>(null);
  useEffect(() => {
    if (innerTab !== 'squads') return;
    api.getMyStats().then(setStats).catch((err) => console.warn('Could not load stats', err));
  }, [innerTab, joinedSquadIds.length]);
  
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
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPendingSquadId(null);
    }
  };

  // Badges are earned from real activity; locked ones say what they need
  const badges = stats ? [
    { name: 'First Report', icon: 'flag', earned: stats.reportsCreated >= 1, need: 'Post a report' },
    { name: 'Verifier', icon: 'verified', earned: stats.verificationsGiven >= 5, need: `Verify 5 reports (${stats.verificationsGiven}/5)` },
    { name: 'Fixer', icon: 'construction', earned: stats.reportsFixed >= 1, need: "Fix a neighbor's report" },
    { name: 'Squad Member', icon: 'group', earned: stats.squadsJoined >= 1, need: 'Join a squad' },
    { name: 'Community Voice', icon: 'thumb_up', earned: stats.upvotesReceived >= 10, need: `Get 10 upvotes (${stats.upvotesReceived}/10)` },
    { name: 'Top 10', icon: 'military_tech', earned: stats.rank <= 10, need: `Reach the top 10 (now #${stats.rank})` },
  ] : [];

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
            {innerTab === 'squads' && "Teams that each look after a few kinds of problems. Numbers below are counted live from reports."}
            {innerTab === 'stories' && "Reports that neighbors fixed and proved with a photo."}
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
        <section className="grid md:grid-cols-12 gap-6">
          <div className="md:col-span-8 space-y-4">
            <h2 className="font-sans text-lg font-black text-slate-800">Squads</h2>
            {squads.length === 0 && <p className="text-sm text-slate-500">Loading squads…</p>}
            <div className="grid sm:grid-cols-2 gap-6">
              {squads.map((sq) => {
                const isJoined = joinedSquadIds.includes(sq.id);
                return (
                  <div key={sq.id} className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                      <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                        <span className="material-symbols-outlined text-base">{sq.icon}</span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-500">
                        {sq.members} member{sq.members === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-sans text-sm font-bold text-slate-800 mb-1">{sq.name}</h3>
                      <p className="font-sans text-xs text-slate-500 leading-relaxed">{sq.description}</p>
                      <p className="text-[10px] text-slate-400 mt-2">Looks after: {sq.categories.join(', ')}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      <div className="bg-red-50 rounded-xl py-2">
                        <div className="text-base font-black text-red-600">{sq.openNearby}</div>
                        <div className="text-[9px] font-bold text-red-400 uppercase">Open near you</div>
                      </div>
                      <div className="bg-teal-50 rounded-xl py-2">
                        <div className="text-base font-black text-teal-600">{sq.fixedByMembers}</div>
                        <div className="text-[9px] font-bold text-teal-500 uppercase">Fixed by members</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 mt-auto">
                      <div className="flex -space-x-2">
                        {sq.memberAvatars.map((src, i) => (
                          <img key={i} alt="Member" referrerPolicy="no-referrer" src={src} className="w-7 h-7 rounded-full border-2 border-white object-cover bg-slate-100" />
                        ))}
                      </div>
                      <button
                        onClick={() => toggleSquad(sq.id)}
                        disabled={pendingSquadId === sq.id}
                        className={`px-4 py-2 rounded-full font-sans text-xs font-bold transition-all border cursor-pointer focus:outline-none disabled:opacity-60 ${
                          isJoined ? 'bg-teal-500 text-white border-teal-600 hover:bg-teal-600' : 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                        }`}
                      >
                        {isJoined ? 'Joined ✓' : `Join (+${sq.joinPoints} first time)`}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="md:col-span-4 space-y-4">
            <h2 className="font-sans text-lg font-black text-slate-800">Your impact</h2>
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm space-y-6">
              <div className="text-center border-b border-slate-50 pb-5">
                <img alt="You" referrerPolicy="no-referrer" src={user.avatar} className="w-16 h-16 rounded-full border border-slate-100 shadow-md object-cover mx-auto mb-2 bg-slate-100" />
                <h3 className="font-sans text-sm font-bold text-slate-800">{user.name}</h3>
                {stats && <p className="text-[10px] text-blue-600 font-bold uppercase mt-0.5">Rank #{stats.rank} · {stats.points.toLocaleString()} pts</p>}
              </div>

              {stats && (
                <div className="grid grid-cols-2 gap-2 text-center">
                  {[
                    ['Reports posted', stats.reportsCreated],
                    ['Fixes', stats.reportsFixed],
                    ['Verifications', stats.verificationsGiven],
                    ['Upvotes received', stats.upvotesReceived],
                  ].map(([label, value]) => (
                    <div key={label} className="bg-slate-50 rounded-xl py-2.5">
                      <div className="text-base font-black text-slate-800">{value}</div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase">{label}</div>
                    </div>
                  ))}
                </div>
              )}

              {badges.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Badges</h4>
                  <div className="grid grid-cols-3 gap-3">
                    {badges.map((b) => (
                      <div key={b.name} title={b.earned ? 'Earned' : b.need} className={`flex flex-col items-center gap-1 ${b.earned ? '' : 'opacity-40'}`}>
                        <div className={`w-11 h-11 rounded-full flex items-center justify-center ${b.earned ? 'bg-blue-50 border border-blue-100 text-blue-600' : 'bg-slate-50 border border-dashed border-slate-200 text-slate-400'}`}>
                          <span className="material-symbols-outlined text-[18px]">{b.icon}</span>
                        </div>
                        <span className="text-[9px] text-center leading-tight font-bold text-slate-500">{b.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3 pt-2">
                <h4 className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Top citizens</h4>
                <ul className="space-y-2.5">
                  {leaderboard.map((cit) => (
                    <li key={cit.rank} className={`flex items-center gap-2.5 p-1.5 rounded-xl ${cit.isCurrentUser ? 'bg-blue-50/50 border border-blue-100' : ''}`}>
                      <span className="font-bold text-[10px] w-4 text-center text-slate-400">{cit.rank}</span>
                      <img alt={cit.name} className="w-7 h-7 rounded-full object-cover border border-slate-100" referrerPolicy="no-referrer" src={cit.avatar} />
                      <span className="flex-grow text-xs font-semibold truncate text-slate-700">{cit.name}</span>
                      <span className="text-xs font-black text-blue-600">{cit.points.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
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
