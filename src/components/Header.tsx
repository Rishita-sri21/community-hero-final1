import { useState } from 'react';

interface HeaderProps {
  currentView: string;
  setView: (v: string) => void;
  userAvatar: string;
  notificationCount: number;
  clearNotifications: () => void;
  points: number;
  onLogout?: () => void;
  userRole?: string;
}

export default function Header({
  currentView,
  setView,
  userAvatar,
  notificationCount,
  clearNotifications,
  points,
  onLogout,
  userRole
}: HeaderProps) {
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const notifications = [
    { id: 1, text: "🌟 12 potholes fixed this week!", time: "5 mins ago" },
    { id: 2, text: "🎉 New park cleanup organized in Downtown.", time: "1 hr ago" },
    { id: 3, text: "💡 Community garden proposal reached 500 votes.", time: "3 hrs ago" }
  ];

  return (
    <header className="fixed top-0 w-full z-50 bg-white/90 backdrop-blur-xl border-b border-slate-100 shadow-xs">
      <div className="flex justify-between items-center px-6 md:px-12 h-16 w-full max-w-[1200px] mx-auto relative">
        
        {/* Leading Brand Area */}
        <div className="flex items-center gap-3">
          <div 
            onClick={() => setView('rewards')} 
            className="w-9 h-9 rounded-full overflow-hidden border-2 border-white shadow-sm shrink-0 cursor-pointer hover:scale-105 transition-transform"
          >
            <img 
              alt="User Avatar" 
              className="w-full h-full object-cover" 
              referrerPolicy="no-referrer"
              src={userAvatar}
            />
          </div>
          <h1 
            onClick={() => { setView('home'); setMobileMenuOpen(false); }} 
            className="font-sans text-lg font-black text-blue-600 cursor-pointer tracking-tight hover:opacity-90 flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-blue-600 text-2xl font-bold">volunteer_activism</span>
            <span>Community Hero</span>
          </h1>
        </div>

        {/* Desktop Navigation Link Row */}
        <nav className="hidden md:flex gap-6">
          <button 
            onClick={() => setView('home')}
            className={`font-sans text-xs font-bold transition-all pb-1 cursor-pointer ${
              currentView === 'home' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-slate-600 hover:text-blue-600'
            }`}
          >
            Home
          </button>
          
          <button 
            onClick={() => setView('map')}
            className={`font-sans text-xs font-bold transition-all pb-1 cursor-pointer ${
              ['map', 'feed', 'analytics'].includes(currentView) 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-slate-600 hover:text-blue-600'
            }`}
          >
            Map &amp; Insights
          </button>

          <button 
            onClick={() => setView('squads')}
            className={`font-sans text-xs font-bold transition-all pb-1 cursor-pointer ${
              ['squads', 'stories'].includes(currentView) 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-slate-600 hover:text-blue-600'
            }`}
          >
            Community Squads
          </button>

          <button 
            onClick={() => setView('rewards')}
            className={`font-sans text-xs font-bold transition-all pb-1 cursor-pointer ${
              currentView === 'rewards' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-slate-600 hover:text-blue-600'
            }`}
          >
            Rewards Market
          </button>

          {(userRole === 'Civil Servant' || userRole === 'Organizer') && (
            <button 
              onClick={() => setView('admin')}
              className={`font-sans text-xs font-bold transition-all pb-1 cursor-pointer flex items-center gap-1 ${
                currentView === 'admin' 
                  ? 'text-blue-600 border-b-2 border-blue-600' 
                  : 'text-indigo-600 hover:text-indigo-700'
              }`}
            >
              <span className="material-symbols-outlined text-xs">admin_panel_settings</span>
              <span>Admin &amp; DB Console</span>
            </button>
          )}
        </nav>

        {/* Desktop Trailing Elements: Points & Notifications & Burger */}
        <div className="flex items-center gap-3">
          
          {/* Header Points Badge */}
          <div 
            onClick={() => setView('rewards')}
            className="hidden sm:flex items-center gap-1.5 bg-blue-50 border border-blue-100 hover:bg-blue-100 px-3 py-1.5 rounded-full cursor-pointer transition-colors shadow-xs"
          >
            <span className="material-symbols-outlined text-blue-600 text-sm">payments</span>
            <span className="font-sans text-[11px] font-black text-slate-700 leading-none">
              {points} <span className="text-[10px] text-blue-600 font-bold">PTS</span>
            </span>
          </div>

          {onLogout && (
            <button 
              onClick={onLogout}
              className="hidden sm:flex items-center justify-center p-1.5 rounded-full hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer focus:outline-none"
              title="Logout Session"
            >
              <span className="material-symbols-outlined text-base">logout</span>
            </button>
          )}

          <div className="relative">
            <button 
              onClick={() => {
                setShowNotifications(!showNotifications);
                if (notificationCount > 0) clearNotifications();
              }}
              className="text-blue-600 hover:opacity-80 transition-opacity p-2 hover:scale-110 duration-200 focus:outline-none cursor-pointer"
            >
              <span className="material-symbols-outlined align-middle" style={{ fontVariationSettings: "'FILL' 1" }}>
                notifications
              </span>
              {notificationCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border border-white shadow-sm animate-pulse"></span>
              )}
            </button>

            {/* Notification Dropdown Panel */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-100 rounded-xl shadow-xl p-4 z-50">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-2">
                  <span className="font-bold text-xs text-slate-800">Municipal Alerts</span>
                  <button 
                    onClick={() => setShowNotifications(false)}
                    className="text-[10px] text-blue-600 hover:underline cursor-pointer"
                  >
                    Close
                  </button>
                </div>
                <div className="space-y-3">
                  {notifications.map((notif) => (
                    <div key={notif.id} className="text-xs border-b border-slate-50 pb-2 last:border-b-0 last:pb-0">
                      <p className="text-slate-600 mb-1 font-sans">{notif.text}</p>
                      <span className="text-[9px] text-slate-400 font-mono">{notif.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Mobile Burger Menu Toggler */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-blue-600 p-2 focus:outline-none cursor-pointer"
          >
            <span className="material-symbols-outlined">
              {mobileMenuOpen ? 'close' : 'menu'}
            </span>
          </button>
        </div>

      </div>

      {/* Mobile Menu Panel */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-t border-slate-100 p-4 space-y-3 shadow-lg absolute w-full left-0 z-40 animate-entrance">
          <button 
            onClick={() => { setView('home'); setMobileMenuOpen(false); }}
            className={`w-full text-left py-2 px-3 rounded-lg font-sans text-xs font-bold ${
              currentView === 'home' ? 'bg-blue-50 text-blue-600' : 'text-slate-600'
            }`}
          >
            Home
          </button>
          <button 
            onClick={() => { setView('map'); setMobileMenuOpen(false); }}
            className={`w-full text-left py-2 px-3 rounded-lg font-sans text-xs font-bold ${
              ['map', 'feed', 'analytics'].includes(currentView) ? 'bg-blue-50 text-blue-600' : 'text-slate-600'
            }`}
          >
            Map &amp; Insights
          </button>
          <button 
            onClick={() => { setView('squads'); setMobileMenuOpen(false); }}
            className={`w-full text-left py-2 px-3 rounded-lg font-sans text-xs font-bold ${
              ['squads', 'stories'].includes(currentView) ? 'bg-blue-50 text-blue-600' : 'text-slate-600'
            }`}
          >
            Community Squads
          </button>
          <button 
            onClick={() => { setView('rewards'); setMobileMenuOpen(false); }}
            className={`w-full text-left py-2 px-3 rounded-lg font-sans text-xs font-bold ${
              currentView === 'rewards' ? 'bg-blue-50 text-blue-600' : 'text-slate-600'
            }`}
          >
            Rewards Market
          </button>

          {(userRole === 'Civil Servant' || userRole === 'Organizer') && (
            <button 
              onClick={() => { setView('admin'); setMobileMenuOpen(false); }}
              className={`w-full text-left py-2 px-3 rounded-lg font-sans text-xs font-bold flex items-center gap-1.5 ${
                currentView === 'admin' ? 'bg-indigo-50 text-indigo-700' : 'text-indigo-600'
              }`}
            >
              <span className="material-symbols-outlined text-sm">admin_panel_settings</span>
              <span>Admin &amp; DB Console</span>
            </button>
          )}

          {/* Mobile Points Counter */}
          <div className="pt-2 border-t border-slate-50 flex items-center justify-between px-3">
            <span className="text-xs text-slate-500 font-bold">Your Balance</span>
            <span className="text-xs font-black text-blue-600 font-sans">{points} PTS</span>
          </div>

          {onLogout && (
            <div className="pt-2 border-t border-slate-50 px-3">
              <button 
                onClick={() => { onLogout(); setMobileMenuOpen(false); }}
                className="w-full text-left py-2 px-3 rounded-lg font-sans text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-1.5 cursor-pointer focus:outline-none"
              >
                <span className="material-symbols-outlined text-sm">logout</span> Log Out Session
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
