import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import HomeView from './components/HomeView';
import MapView from './components/MapView';
import SquadsView from './components/SquadsView';
import RewardsView from './components/RewardsView';
import { LoginView } from './components/LoginView';
import { OnboardingLocationSetup } from './components/OnboardingLocationSetup';
import AdminConsole from './components/AdminConsole';
import AIAssistantWidget from './components/AIAssistantWidget';
import Toaster from './components/Toaster';
import { Report, Squad, Citizen, Transformation } from './types';
import { api } from './lib/api';
import { toast, errorMessage } from './lib/toast';
import { centerForDistrict } from './shared/neighborhoods';
import { useLiveReports } from './hooks/useLiveReports';

export default function App() {
  const [view, setView] = useState<string>('home');
  const [mapTab, setMapTab] = useState<'map' | 'feed' | 'analytics'>('map');
  const [squadsTab, setSquadsTab] = useState<'squads' | 'stories'>('squads');
  
  const [points, setPoints] = useState<number>(480);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Authentication states
  const [currentUser, setCurrentUser] = useState<{ _id: string; name: string; email: string; points: number; avatar: string; joinedSquads?: string[]; district?: string; role?: string } | null>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(true);

  // Initialize Squads list
  const [squads, setSquads] = useState<Squad[]>([
    {
      id: 'sq-1',
      name: 'Downtown Revitalization Squad',
      description: 'Painting designated eco-friendly crosswalks and auditing pothole hazards around central blocks.',
      volunteersCount: 42,
      volunteersMax: 50,
      distance: '0.2 miles',
      category: 'road',
      icon: 'paint',
    },
    {
      id: 'sq-2',
      name: 'Centennial Park Greening',
      description: 'Help us plant native wildflowers and set up a new community compost system.',
      volunteersCount: 15,
      volunteersMax: 30,
      distance: '1.5 miles',
      category: 'park',
      icon: 'nature_people',
    },
    {
      id: 'sq-3',
      name: 'Riverside Trail Cleanup',
      description: 'Clearing waste along the banks of the river to protect local bird habitats.',
      volunteersCount: 8,
      volunteersMax: 20,
      distance: '2.1 miles',
      category: 'cleanup',
      icon: 'cleaning',
    },
  ]);

  // Check active user session on startup
  useEffect(() => {
    const checkSession = async () => {
      try {
        const user = await api.getMe();
        setCurrentUser(user);
        setPoints(user.points);
      } catch (err) {
        console.log('No active authenticated session found.');
        setCurrentUser(null);
      } finally {
        setAuthChecking(false);
      }
    };
    checkSession();
  }, []);

  // Leaderboard comes from the server (ranked by real points in MongoDB)
  const [leaderboard, setLeaderboard] = useState<Citizen[]>([]);

  useEffect(() => {
    if (!currentUser || view !== 'squads') return;
    api.getLeaderboard()
      .then((entries) => {
        setLeaderboard(entries.map((e) => ({
          rank: e.rank,
          name: e.userId === currentUser._id ? `${e.name} (You)` : e.name,
          avatar: e.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
          points: e.points,
          isCurrentUser: e.userId === currentUser._id,
        })));
      })
      .catch((err) => console.warn('Could not load leaderboard', err));
  }, [currentUser, view, points]);

  // Initialize transformations success stories
  const [transformations] = useState<Transformation[]>([
    {
      id: 'trf-1',
      title: 'Historic District Crosswalk Painting',
      description: 'The Downtown Revitalization Squad repainted faded, dangerous crosswalks with high-contrast, eco-friendly paint. Pedestrian safety index surged by 12%!',
      beforeImage: 'https://images.unsplash.com/photo-1515162305285-0293e4767cc2?w=600',
      afterImage: 'https://images.unsplash.com/photo-1494145904049-0dca59b4bbad?w=600',
      category: 'Road Infrastructure',
      heroesAvatars: [
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
        'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150',
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150'
      ],
      reportedBy: 'Elena M. and 4 others',
      heroesCount: 5,
    },
    {
      id: 'trf-2',
      title: 'Centennial Park Compost Launch',
      description: 'We organized a park workshop to install three large-capacity composting bins. Over 200kg of organic waste diverted from landfills so far!',
      beforeImage: 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=600',
      afterImage: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600',
      category: 'Waste & Recycling',
      heroesAvatars: [
        'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150',
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150'
      ],
      reportedBy: 'Samira K. and 2 others',
      heroesCount: 3,
    }
  ]);

  // Load reports, nearest to the user's neighborhood first
  useEffect(() => {
    if (!currentUser) return; // Wait until logged in
    const fetchReports = async () => {
      try {
        setLoading(true);
        setReports(await api.getReports(centerForDistrict(currentUser.district)));
      } catch (err) {
        console.warn('Could not load reports', err);
        toast.error(errorMessage(err, 'Could not load reports. Please refresh to try again.'));
        setReports([]);
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, [currentUser?._id, currentUser?.district]);

  // Other people's new reports, votes and fixes arrive live. After a dropped connection
  // comes back, reload quietly in case something was missed while offline.
  const reportsCenter = centerForDistrict(currentUser?.district);
  const liveConnected = useLiveReports(!!currentUser, reportsCenter, setReports, () => {
    api.getReports(reportsCenter).then(setReports).catch(() => {});
  });

  const handleNavClick = (targetView: string) => {
    if (targetView.includes(':')) {
      const [main, sub] = targetView.split(':');
      setView(main);
      if (main === 'map') {
        setMapTab(sub as any);
      } else if (main === 'squads') {
        setSquadsTab(sub as any);
      }
    } else {
      setView(targetView);
    }
  };

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
    setView('home');
  };

  const handleLoginSuccess = (user: any) => {
    setCurrentUser(user);
    setPoints(user.points);
  };

  // Rendering Session Checker splash screen
  if (authChecking) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white space-y-4">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="font-sans text-xs text-slate-400 font-bold uppercase tracking-widest animate-pulse">
          Validating Secure Municipal Tokens...
        </p>
      </div>
    );
  }

  // Intercept with beautiful Login & Registration Experience
  if (!currentUser) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  // Intercept with beautiful Location/Neighborhood Onboarding Setup before Dashboard opens
  if (!currentUser.district) {
    return (
      <OnboardingLocationSetup 
        currentUser={currentUser} 
        onComplete={(updated) => {
          setCurrentUser(updated);
          setPoints(updated.points);
        }} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col relative">
      
      {/* Absolute background accent blobs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/5 rounded-full filter blur-[100px] pointer-events-none"></div>
      <div className="absolute top-1/2 right-1/4 w-[500px] h-[500px] bg-indigo-500/5 rounded-full filter blur-[120px] pointer-events-none"></div>

      {/* Main Layout Header */}
      <Header 
        points={points} 
        currentView={view} 
        setView={handleNavClick} 
        userAvatar={currentUser.avatar || "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150"}
        notificationCount={3}
        clearNotifications={() => {}}
        onLogout={handleLogout}
        userRole={currentUser?.role}
      />

      {/* Dynamic Main Body Routing Engine */}
      <main className="flex-grow relative z-10 w-full pt-16">
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[400px] py-20 space-y-4">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="font-sans text-xs text-slate-500 font-bold uppercase tracking-widest animate-pulse">
              Syncing Municipal Core Databases...
            </p>
          </div>
        ) : (
          <>
            {view === 'home' && (
              <HomeView 
                userName={currentUser.name.split(' ')[0]} 
                points={points} 
                setPoints={setPoints}
                setView={handleNavClick}
                reports={reports}
                setReports={setReports}
                squads={squads}
              />
            )}

            {view === 'map' && (
              <MapView 
                reports={reports}
                setReports={setReports}
                setPoints={setPoints}
                innerTab={mapTab}
                setInnerTab={setMapTab}
                userDistrict={currentUser?.district}
                liveConnected={liveConnected}
              />
            )}

            {view === 'squads' && (
              <SquadsView 
                squads={squads}
                setSquads={setSquads}
                leaderboard={leaderboard}
                transformations={transformations}
                setPoints={setPoints}
                joinedSquadIds={currentUser.joinedSquads || []}
                onJoinedSquadsChange={(ids) => setCurrentUser(u => (u ? { ...u, joinedSquads: ids } : u))}
                innerTab={squadsTab}
                setInnerTab={setSquadsTab}
              />
            )}

            {view === 'rewards' && (
              <RewardsView 
                points={points} 
                setPoints={setPoints}
              />
            )}

            {view === 'admin' && (
              <AdminConsole />
            )}
          </>
        )}
      </main>

      {/* Footer Branding Line */}
      <footer className="shrink-0 border-t border-slate-100 bg-white/60 backdrop-blur-md py-6 text-center select-none z-10">
        <div className="max-w-[1200px] mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-semibold text-slate-400">
          <p>© 2026 Community Hero Inc. Dedicated to green, safe, connected municipal spaces.</p>
          <p className="font-mono text-[10px] bg-slate-50 border border-slate-100 px-3 py-1 rounded-full text-slate-500">
            Node-Engine &amp; Gemini 3.5 Fully Operational
          </p>
        </div>
      </footer>

      {/* High-Fidelity Floating AI Assistant Engine */}
      <AIAssistantWidget userDistrict={currentUser?.district} activeReports={reports} />

      <Toaster />

    </div>
  );
}
