import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import L from 'leaflet';
import { Report } from '../types';
import { api } from '../lib/api';
import CameraVerificationModal from './CameraVerificationModal';

interface MapViewProps {
  reports: Report[];
  setReports: React.Dispatch<React.SetStateAction<Report[]>>;
  addPoints: (amount: number) => void;
  innerTab: 'map' | 'feed' | 'analytics';
  setInnerTab: (t: 'map' | 'feed' | 'analytics') => void;
  userDistrict?: string;
}









// Helper to convert report coordinate styles or raw Lat/Lng to real Leaflet LatLng coordinates
function getLatLngFromReport(report: Report, center: [number, number]): L.LatLngExpression {
  if (report.lat && report.lng) {
    return [report.lat, report.lng];
  }
  // Convert percentage coordinates (e.g., top: '35%', left: '25%') to New York offsets deterministically
  const topVal = parseFloat(report.coordinates?.top || '50%') / 100;
  const leftVal = parseFloat(report.coordinates?.left || '50%') / 100;

  const lat = center[0] + (0.5 - topVal) * 0.03;
  const lng = center[1] + (leftVal - 0.5) * 0.05;
  return [lat, lng];
}

// Generate dynamic SVG Leaflet icon matching category and urgency
function createCustomMarkerIcon(category: string, urgency: string, isSelected: boolean) {
  const color = urgency === 'High' ? '#ef4444' : urgency === 'Medium' ? '#f59e0b' : '#3b82f6';
  const size = isSelected ? 44 : 36;
  const iconName = category === 'Pothole' ? 'warning' : category === 'Streetlight' ? 'lightbulb' : category === 'Park Maintenance' ? 'park' : category === 'Water Leakage' ? 'water_drop' : 'report';
  
  const iconHtml = `
    <div style="position: relative; width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease-in-out;">
      <div style="position: absolute; top: 0; left: 0; width: ${size}px; height: ${size}px; background-color: ${color}; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); border: 2px solid #ffffff; box-shadow: 0 4px 10px rgba(0,0,0,0.35);"></div>
      <span class="material-symbols-outlined" style="position: relative; z-index: 10; color: #ffffff; font-size: ${isSelected ? '20px' : '16px'}; display: block; margin-top: -4px;">
        ${iconName}
      </span>
      ${urgency === 'High' ? `<div style="position: absolute; -inset: 4px; border: 2px solid ${color}; border-radius: 50%; animation: pulse-marker 2s infinite; opacity: 0.6;"></div>` : ''}
    </div>
  `;

  return L.divIcon({
    html: iconHtml,
    className: 'custom-leaflet-pin',
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  });
}

const NYC_CENTER: [number, number] = [40.7128, -74.0060];

export default function MapView({
  reports,
  setReports,
  addPoints,
  innerTab,
  setInnerTab,
  userDistrict
}: MapViewProps) {
  // Feed Filters
  const [urgencyFilter, setUrgencyFilter] = useState<'All' | 'High' | 'Medium' | 'Low'>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const [mission, setMission] = useState<any>(null);
const [loadingMission, setLoadingMission] = useState(false);
  
  // Submit New Report Modal state
  const [showNewReportModal, setShowNewReportModal] = useState(false);
  const [newReportTitle, setNewReportTitle] = useState('');
  const [newReportDesc, setNewReportDescription] = useState('');
  const [newReportUrgency, setNewReportUrgency] = useState<'High' | 'Medium' | 'Low'>('Medium');
  const [newReportDistrict, setNewReportDistrict] = useState(userDistrict || 'Downtown');
  const [newReportCategory, setNewReportCategory] = useState('Pothole');


  const generateMission = () => {
  const missions = [
    {
      title: "Green Corridor Recovery Initiative",
      priorityScore: 94,
      estimatedTime: "2 Hours",
      impact: "Improve neighborhood cleanliness and public safety."
    },
    {
      title: "Downtown Safety Sweep",
      priorityScore: 88,
      estimatedTime: "1.5 Hours",
      impact: "Reduce hazards around busy intersections."
    },
    {
      title: "Community Infrastructure Rescue",
      priorityScore: 91,
      estimatedTime: "3 Hours",
      impact: "Address multiple high-priority citizen reports."
    }
  ];

  const selected =
    missions[Math.floor(Math.random() * missions.length)];

  setMission({
    ...selected,
    tasks: [
      {
        title: "Verify local reports",
        category: "Verification",
        reward: 20
      },
      {
        title: "Capture evidence photos",
        category: "Documentation",
        reward: 15
      },
      {
        title: "Coordinate community response",
        category: "Action",
        reward: 30
      }
    ]
  });
};
  // Sync district with user's selected neighborhood
  useEffect(() => {
    if (userDistrict) {
      setNewReportDistrict(userDistrict);
    }
  }, [userDistrict]);

  useEffect(() => {
  if (innerTab === 'map' && mapInstanceRef.current) {
    setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 100);
  }
}, [innerTab]);

  // Selected Pin Coordinates for exact geo reports
  const [selectedCoordinates, setSelectedCoordinates] = useState<{ lat: number; lng: number } | null>(null);

  // Map Active Popup issue
  const [activeReportId, setActiveReportId] = useState<string | null>('rep-1');
  const [smartScanVerified, setSmartScanVerified] = useState(false);
  const [resolvingReport, setResolvingReport] = useState<Report | null>(null);

  // Weekly Issue trends active bar chart day selection
  const [activeChartDay, setActiveChartDay] = useState<'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'>('Thu');

  // Map refs for Leaflet instances
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const selectionMarkerRef = useRef<L.Marker | null>(null);

  const chartData = {
    Mon: { count: 12, percentage: '40%', active: false },
    Tue: { count: 18, percentage: '60%', active: false },
    Wed: { count: 10, percentage: '35%', active: false },
    Thu: { count: 24, percentage: '80%', active: true },
    Fri: { count: 15, percentage: '50%', active: false },
    Sat: { count: 6, percentage: '20%', active: false },
    Sun: { count: 9, percentage: '30%', active: false }
  };

  // Synchronize Leaflet map lifecycle
  useEffect(() => {
    if (innerTab !== 'map' || !mapContainerRef.current) {
      // Cleanup map instance if we switch away from map tab
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersGroupRef.current = null;
        selectionMarkerRef.current = null;
      }
      return;
    }

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: NYC_CENTER,
        zoom: 13,
        zoomControl: false,
      });

      // Render modern high-contrast Voyager tile overlays
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(map);

      // Top-right aligned zoom control buttons
      L.control.zoom({
        position: 'topright'
      }).addTo(map);

      const markersGroup = L.layerGroup().addTo(map);
      markersGroupRef.current = markersGroup;
      mapInstanceRef.current = map;

      setTimeout(() => {
  map.invalidateSize();
}, 500);

   

      // Handle map clicks to place exact pins for community issues
      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        setSelectedCoordinates({ lat, lng });

        // Update pin location indicator on map
        if (selectionMarkerRef.current) {
          selectionMarkerRef.current.setLatLng([lat, lng]);
        } else {
          const selectionIcon = L.divIcon({
            html: `
              <div class="relative flex items-center justify-center">
                <div class="absolute w-8 h-8 bg-emerald-500/30 rounded-full animate-ping"></div>
                <div class="w-4 h-4 bg-emerald-500 border-2 border-white rounded-full shadow-md z-10"></div>
              </div>
            `,
            className: 'selection-pin',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          });
          selectionMarkerRef.current = L.marker([lat, lng], { icon: selectionIcon }).addTo(map);
        }

        // Open creation modal
        setShowNewReportModal(true);
      });
    }

    // Refresh markers on reports database or active selection updates
    const map = mapInstanceRef.current;
    const markersGroup = markersGroupRef.current;

    if (map && markersGroup) {
      markersGroup.clearLayers();

      reports.forEach((rep) => {
        const latLng = getLatLngFromReport(rep, NYC_CENTER);
        const isSelected = activeReportId === rep.id;
        const pinIcon = createCustomMarkerIcon(rep.category, rep.urgency, isSelected);
        console.log(reports);

        const marker = L.marker(latLng, { icon: pinIcon });
        
        marker.on('click', () => {
          setActiveReportId(rep.id);
          setSmartScanVerified(false);
          map.panTo(latLng);
        });

        marker.addTo(markersGroup);

        // Smoothly pan when selection is updated elsewhere
        if (isSelected) {
          map.panTo(latLng);
        }
      });
    }
  }, [innerTab, reports, activeReportId]);

  // Clean selection pin marker when modal closes
  useEffect(() => {
    if (!showNewReportModal && selectionMarkerRef.current && mapInstanceRef.current) {
      selectionMarkerRef.current.remove();
      selectionMarkerRef.current = null;
      setSelectedCoordinates(null);
    }
  }, [showNewReportModal]);

  const handleCreateReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReportTitle || !newReportDesc) return;

    

    try {
      const partialReport: Partial<Report> = {
  title: newReportTitle,
  description: newReportDesc,
  urgency: newReportUrgency,
  district: newReportDistrict,
  category: newReportCategory,
  lat: selectedCoordinates?.lat,
  lng: selectedCoordinates?.lng,
};

      const created = await api.createReport(partialReport);
      setReports([created, ...reports]);
      addPoints(20);

      // Reset fields
      setNewReportTitle('');
      setNewReportDescription('');
      setShowNewReportModal(false);
    } catch (err) {
      console.error(err);
      // Fallback locally
      const newRep: Report = {
        id: `rep-${Date.now()}`,
        reporter: {
          name: 'Sarah Johnson',
          avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150'
        },
        timeAgo: 'Just now',
        district: newReportDistrict,
        urgency: newReportUrgency,
        category: newReportCategory,
        title: newReportTitle,
        description: newReportDesc,
        upvotes: 0,
        comments: 0,
        verified: false,
        lat: selectedCoordinates?.lat,
        lng: selectedCoordinates?.lng,
        coordinates: selectedCoordinates ? undefined : { 
          top: `${30 + Math.random() * 40}%`, 
          left: `${20 + Math.random() * 60}%` 
        },
        icon: newReportCategory === 'Pothole' ? 'warning' : 'potted_plant'
      };

      setReports([newRep, ...reports]);
      addPoints(20);
      setNewReportTitle('');
      setNewReportDescription('');
      setShowNewReportModal(false);
    }
  };

  const toggleVerifyReport = async (id: string) => {
    try {
      const { report: updated, points: updatedPoints } = await api.verifyReport(id);
      setReports(prev => prev.map(rep => rep.id === id ? updated : rep));
      if (updatedPoints !== null) {
        addPoints(15);
      }
    } catch (err) {
      console.error('Verify error:', err);
      // fallback
      setReports(prev => prev.map(rep => {
        if (rep.id === id) {
          const nextState = !rep.verified;
          if (nextState) addPoints(15);
          return { ...rep, verified: nextState };
        }
        return rep;
      }));
    }
  };

  const toggleUpvoteReport = async (id: string) => {
    try {
      const updated = await api.upvoteReport(id);
      setReports(prev => prev.map(rep => rep.id === id ? updated : rep));
      addPoints(5);
    } catch (err) {
      console.error('Upvote error:', err);
      // fallback
      setReports(prev => prev.map(rep => {
        if (rep.id === id) {
          return { ...rep, upvotes: rep.upvotes + 1 };
        }
        return rep;
      }));
      addPoints(5);
    }
  };

  const filteredReports = reports.filter(r => {
    const matchesUrgency = urgencyFilter === 'All' || r.urgency === urgencyFilter;
    const matchesSearch = r.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          r.district.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesUrgency && matchesSearch;
  });

  return (
    <div className="w-full px-4 py-6">
      
      {/* Styles for pulse animations inside leaflet marker */}
      <style>{`
        @keyframes pulse-marker {
          0% { transform: scale(0.9); opacity: 0.9; }
          50% { transform: scale(1.3); opacity: 0.3; }
          100% { transform: scale(0.9); opacity: 0.9; }
        }
        .leaflet-container {
          font-family: inherit !important;
        }
      `}</style>

      {/* Page Header and Sub-tab toggler */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-slate-100 pb-6">
        <div>
          <h1 className="font-sans text-3xl font-black text-slate-800 mb-2">
            {innerTab === 'map' && "Tactical Map"}
            {innerTab === 'feed' && "Live Impact Feed"}
            {innerTab === 'analytics' && "Impact Analytics"}
          </h1>
          <p className="font-sans text-sm text-slate-500 max-w-2xl leading-relaxed">
            {innerTab === 'map' && "Interactive tactical community map. Drag, zoom, track reports, or click anywhere to drop a new issue pin."}
            {innerTab === 'feed' && "Real-time updates from your local heroes. Verify reports to help keep our community data clean."}
            {innerTab === 'analytics' && "Real-time insights and predictive forecasting for our neighborhoods."}
          </p>
        </div>

        {/* Cohesive Sub-tab Pill Toggler */}
        <div className="flex bg-slate-100 p-1 rounded-full border border-slate-200 shadow-inner w-full md:w-auto">
          <button 
            onClick={() => setInnerTab('map')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-full font-sans text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer focus:outline-none ${
              innerTab === 'map' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:text-blue-600'
            }`}
          >
            <span className="material-symbols-outlined text-sm">map</span> Map View
          </button>
          <button 
            onClick={() => setInnerTab('feed')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-full font-sans text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer focus:outline-none ${
              innerTab === 'feed' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:text-blue-600'
            }`}
          >
            <span className="material-symbols-outlined text-sm">feed</span> Live Feed
          </button>
          <button 
            onClick={() => setInnerTab('analytics')}
            className={`flex-1 md:flex-none px-4 py-2 rounded-full font-sans text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer focus:outline-none ${
              innerTab === 'analytics' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:text-blue-600'
            }`}
          >
            <span className="material-symbols-outlined text-sm">analytics</span> Analytics
          </button>
        </div>
      </div>
<div className="bg-gradient-to-r from-violet-600 to-blue-600 rounded-2xl p-5 shadow-xl mb-6 text-white">
  <div className="flex justify-between items-center">
    <div>
      <h3 className="text-lg font-black">
        AI Mission Commander
      </h3>

      <p className="text-sm text-blue-100 mt-1">
        Generate an optimized community action plan from live reports.
      </p>
    </div>

    <button
      onClick={generateMission}
      disabled={loadingMission}
      className="bg-white text-blue-600 px-5 py-3 rounded-xl font-bold hover:scale-105 transition-all"
    >
      {loadingMission
        ? "Analyzing..."
        : "Generate Mission"}
    </button>
  </div>
</div>

{mission && (
  <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-6 mb-6">

    <div className="flex justify-between items-center mb-5">
      <div>
        <p className="text-xs uppercase tracking-widest text-violet-600 font-bold">
          AI Generated Mission
        </p>

        <h2 className="text-2xl font-black text-slate-800">
          {mission.title}
        </h2>
      </div>

      <div className="text-right">
        <div className="text-3xl font-black text-green-600">
          {mission.priorityScore}
        </div>
        <div className="text-xs text-slate-500">
          Priority Score
        </div>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-4 mb-6">
      <div className="bg-slate-50 rounded-xl p-4">
        <div className="text-xs text-slate-500">
          Estimated Time
        </div>
        <div className="font-bold">
          {mission.estimatedTime}
        </div>
      </div>

      <div className="bg-slate-50 rounded-xl p-4">
        <div className="text-xs text-slate-500">
          Community Impact
        </div>
        <div className="font-bold">
          High
        </div>
      </div>
    </div>

    <p className="text-slate-600 mb-6">
      {mission.impact}
    </p>

    <div className="space-y-3">
      {mission.tasks?.map((task: any, idx: number) => (
        <div
          key={idx}
          className="flex justify-between items-center bg-slate-50 rounded-xl p-4"
        >
          <div>
            <div className="font-semibold">
              {task.title}
            </div>
            <div className="text-sm text-slate-500">
              {task.category}
            </div>
          </div>

          <div className="font-bold text-violet-600">
            +{task.reward}
          </div>
        </div>
      ))}
    </div>
  </div>
)}


      {/* -------------------- TAB 1: TACTICAL MAP -------------------- */}
      {innerTab === 'map' && (
        <div className="relative h-[550px] w-full rounded-2xl overflow-hidden shadow-2xl border border-slate-200 bg-slate-100">
          
          {/* Real Live Leaflet Map Container */}
          <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-10" />

          {/* Interactive Map Info Glass Popup Detail Card */}
          <AnimatePresence>
            {activeReportId && reports.find(r => r.id === activeReportId) && (() => {
              const rep = reports.find(r => r.id === activeReportId)!;
              return (
                <motion.div 
                  initial={{ opacity: 0, y: 30, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute bottom-6 left-6 right-6 md:left-8 md:bottom-8 md:w-[380px] bg-white rounded-2xl shadow-xl overflow-hidden z-30 border border-slate-100"
                >
                  {/* Photo area */}
                  <div className="relative h-28 w-full overflow-hidden bg-slate-100 border-b border-slate-50">
                    <img 
                      alt="Issue" 
                      className="w-full h-full object-cover" 
                      referrerPolicy="no-referrer"
                      src={rep.image || 'https://images.unsplash.com/photo-1515162305285-0293e4767cc2?w=600'}
                    />
                    <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-full text-[10px] font-bold text-slate-800 flex items-center gap-1 shadow-sm">
                      <span className="material-symbols-outlined text-[12px]">schedule</span> Reported {rep.timeAgo}
                    </div>
                    <button 
                      onClick={() => setActiveReportId(null)}
                      className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center backdrop-blur-md hover:bg-black/60 transition-colors focus:outline-none cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                  </div>

                  <div className="p-5 space-y-3.5">
                    <div className="flex justify-between items-start">
                      <div className="max-w-[70%]">
                        <h2 className="font-sans text-sm font-bold text-slate-800 line-clamp-1">{rep.title}</h2>
                        <p className="font-sans text-[11px] text-slate-400 flex items-center gap-1 mt-0.5 line-clamp-1">
                          <span className="material-symbols-outlined text-[12px] text-blue-500">location_on</span> {rep.locationDetails || rep.district}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase border shrink-0 ${
                        rep.urgency === 'High' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                      }`}>
                        {rep.urgency}
                      </span>
                    </div>

                    <p className="font-sans text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {rep.description}
                    </p>

                    {/* AI Deduplication Nudge */}
                    {rep.id === 'rep-1' && !smartScanVerified && (
                      <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3.5 relative overflow-hidden group">
                        <div className="flex items-start gap-3 relative z-10">
                          <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                            <span className="material-symbols-outlined text-sm">smart_toy</span>
                          </div>
                          <div className="flex-1 space-y-2">
                            <p className="font-sans text-[11px] text-slate-700 leading-snug">
                              <span className="text-blue-600 font-bold">Smart Scan:</span> Is this the same pothole reported 15m away by Marcus Thompson?
                            </p>
                            <div className="flex gap-2 pt-1">
                              <button 
                                onClick={() => {
                                  setSmartScanVerified(true);
                                  addPoints(15);
                                }}
                                className="flex-1 bg-blue-600 text-white py-1.5 px-3 rounded-lg font-sans text-[10px] font-bold hover:bg-blue-700 hover:shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1 cursor-pointer focus:outline-none"
                              >
                                <span className="material-symbols-outlined text-[12px]">check_circle</span> Yes, Merge
                              </button>
                              <button 
                                onClick={() => {
                                  setSmartScanVerified(true);
                                }}
                                className="flex-1 bg-white text-slate-600 border border-slate-200 py-1.5 px-3 rounded-lg font-sans text-[10px] font-bold hover:bg-slate-50 transition-all active:scale-95 text-center cursor-pointer focus:outline-none"
                              >
                                No, Separate
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {rep.id === 'rep-1' && smartScanVerified && (
                      <div className="bg-teal-50 border border-teal-100 rounded-xl p-2.5 text-center text-[10px] font-bold text-teal-600 flex items-center justify-center gap-1">
                        <span className="material-symbols-outlined text-xs">check_circle</span>
                        Verified and merged with local report database! +15 Points
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-50 flex justify-between items-center gap-2">
                      <button
                        onClick={() => toggleVerifyReport(rep.id)}
                        className={`flex-1 py-2 px-3 rounded-xl font-sans text-xs font-bold transition-all focus:outline-none cursor-pointer text-center border ${
                          rep.verified
                            ? 'bg-teal-50 text-teal-600 border-teal-100'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span className="material-symbols-outlined text-xs align-middle mr-1">
                          {rep.verified ? 'check_circle' : 'verified'}
                        </span>
                        {rep.verified ? 'Verified' : 'Verify'}
                      </button>

                      <button
                        onClick={() => setResolvingReport(rep)}
                        className="flex-1 py-2 px-3 bg-indigo-600 text-white rounded-xl font-sans text-xs font-bold hover:bg-indigo-700 hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer focus:outline-none shadow-sm"
                      >
                        <span className="material-symbols-outlined text-xs">photo_camera</span>
                        Resolve
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })()}
          </AnimatePresence>

          {/* Quick instructions HUD on top left */}
          <div className="absolute top-4 left-4 z-20 bg-slate-900/80 backdrop-blur-md px-3.5 py-2.5 rounded-xl border border-slate-700/50 shadow-lg text-[11px] text-slate-200 max-w-[220px] pointer-events-none">
            <div className="font-bold text-emerald-400 flex items-center gap-1 mb-1">
              <span className="material-symbols-outlined text-[13px]">my_location</span>
              Live Tactical Mapping
            </div>
            Click anywhere on the map to drop a precise GPS pin and instantly file a localized citizen report!
          </div>
        </div>
      )}

      {/* -------------------- TAB 2: LIVE IMPACT FEED -------------------- */}
      {innerTab === 'feed' && (
        <div className="space-y-8">
          
          {/* Feed Filter controls & actions row */}
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div className="flex flex-wrap gap-2">
              {(['All', 'High', 'Medium', 'Low'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setUrgencyFilter(filter)}
                  className={`px-4 py-2 rounded-full font-sans text-xs font-bold transition-all cursor-pointer focus:outline-none ${
                    urgencyFilter === filter
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {filter} Urgency
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              {/* Search Bar */}
              <div className="relative flex-grow sm:flex-none">
                <input 
                  type="text"
                  placeholder="Search updates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-56 bg-white border border-slate-200 px-4 py-2 pl-9 rounded-full font-sans text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-base">
                  search
                </span>
              </div>

              {/* Submit report button */}
              <button 
                onClick={() => { setSelectedCoordinates(null); setShowNewReportModal(true); }}
                className="px-5 py-2.5 rounded-full bg-blue-600 text-white font-sans text-xs font-bold hover:bg-blue-700 shadow-sm flex items-center gap-1 cursor-pointer focus:outline-none"
              >
                <span className="material-symbols-outlined text-sm">add_circle</span> Report Issue
              </button>
            </div>
          </div>

          {/* Feed List Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredReports.map((rep) => (
                <motion.article 
                  layout
                  key={rep.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white rounded-2xl p-6 flex flex-col gap-4 relative overflow-hidden border border-slate-100 shadow-sm"
                >
                  {/* Top card bar with reporter info */}
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2.5">
                      <img 
                        alt={rep.reporter.name} 
                        className="w-10 h-10 rounded-full border border-slate-100 object-cover shadow-sm" 
                        referrerPolicy="no-referrer"
                        src={rep.reporter.avatar || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150'}
                      />
                      <div>
                        <p className="font-sans text-xs font-bold text-slate-800">{rep.reporter.name}</p>
                        <p className="font-sans text-[10px] text-slate-400 font-semibold leading-none mt-1">{rep.timeAgo} • {rep.district}</p>
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 border ${
                      rep.urgency === 'High' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}>
                      {rep.urgency === 'High' && <span className="w-1 h-1 rounded-full bg-red-600 animate-pulse"></span>}
                      {rep.urgency} Urgency
                    </span>
                  </div>

                  {/* Body Content */}
                  <div className="space-y-1">
                    <h3 className="font-sans text-sm font-bold text-slate-800 line-clamp-1">{rep.title}</h3>
                    <p className="font-sans text-xs text-slate-500 leading-relaxed line-clamp-3 h-15">
                      {rep.description}
                    </p>
                  </div>

                  {/* Optional coordinates indicator */}
                  {(rep.lat || rep.lng) && (
                    <div className="text-[10px] font-mono text-emerald-600 bg-emerald-50 rounded-lg p-2 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">location_on</span>
                      GPS Match: {rep.lat?.toFixed(4)}, {rep.lng?.toFixed(4)}
                    </div>
                  )}

                  {/* Optional Report Image */}
                  {rep.image && (
                    <div className="h-40 w-full overflow-hidden rounded-xl border border-slate-100 mt-2">
                      <img src={rep.image} alt={rep.title} className="w-full h-full object-cover" />
                    </div>
                  )}

                  {/* Action bottom details row */}
                  <div className="flex justify-between items-center pt-3 border-t border-slate-50 mt-auto">
                    <div className="flex gap-4">
                      <button 
                        onClick={() => toggleUpvoteReport(rep.id)}
                        className="flex items-center gap-1.5 text-slate-400 hover:text-blue-600 cursor-pointer text-xs font-bold focus:outline-none transition-colors"
                      >
                        <span className="material-symbols-outlined text-base">thumb_up</span>
                        <span>{rep.upvotes}</span>
                      </button>
                      <button className="flex items-center gap-1.5 text-slate-400 hover:text-blue-600 cursor-pointer text-xs font-bold focus:outline-none transition-colors">
                        <span className="material-symbols-outlined text-base">chat_bubble</span>
                        <span>{rep.comments}</span>
                      </button>
                    </div>

                    <button
                      onClick={() => toggleVerifyReport(rep.id)}
                      className={`px-3 py-1.5 rounded-full font-sans text-[10px] font-bold transition-all focus:outline-none cursor-pointer border ${
                        rep.verified
                          ? 'bg-teal-50 text-teal-600 border-teal-100'
                          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[11px] align-middle mr-1">
                        {rep.verified ? 'check_circle' : 'verified'}
                      </span>
                      {rep.verified ? 'Verified' : 'Verify'}
                    </button>
                  </div>
                </motion.article>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* -------------------- TAB 3: IMPACT ANALYTICS -------------------- */}
      {innerTab === 'analytics' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          
          {/* Bento Stats row */}
          <div className="md:col-span-12 grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <span className="material-symbols-outlined text-blue-600 text-3xl mb-3 block">verified_user</span>
              <p className="font-sans text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Global Health Index</p>
              <h2 className="font-sans text-3xl font-black text-slate-800">92.4%</h2>
              <p className="font-sans text-[10px] font-bold text-teal-600 flex items-center gap-1 mt-1">
                <span className="material-symbols-outlined text-sm">trending_up</span> +1.8% from last month
              </p>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <span className="material-symbols-outlined text-green-600 text-3xl mb-3 block">eco</span>
              <p className="font-sans text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">CO2 Footprint Offset</p>
              <h2 className="font-sans text-3xl font-black text-slate-800">452 kg</h2>
              <p className="font-sans text-[10px] font-bold text-teal-600 flex items-center gap-1 mt-1">
                <span className="material-symbols-outlined text-sm">trending_up</span> Active carbon capture growth
              </p>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
              <span className="material-symbols-outlined text-purple-600 text-3xl mb-3 block">speed</span>
              <p className="font-sans text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Avg Resolution Speed</p>
              <h2 className="font-sans text-3xl font-black text-slate-800">14.2 hrs</h2>
              <p className="font-sans text-[10px] font-bold text-teal-600 flex items-center gap-1 mt-1">
                <span className="material-symbols-outlined text-sm">check_circle</span> Faster than city average
              </p>
            </div>
          </div>

          {/* Bar Chart: Weekly Issue Trends */}
          <div className="md:col-span-8 bg-white rounded-2xl p-8 border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-sans text-sm font-bold text-slate-800">Weekly Issue Trends</h3>
              <select className="bg-slate-50 rounded-full border border-slate-200 text-slate-600 font-sans text-[10px] font-bold py-1.5 pl-3 pr-8 focus:ring-2 focus:ring-blue-600 focus:outline-none cursor-pointer">
                <option>This Week</option>
                <option>Last Week</option>
                <option>This Month</option>
              </select>
            </div>

            {/* Interactive Bar Chart Representation */}
            <div className="h-52 flex items-end justify-between gap-4 relative pt-4">
              <div className="absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between pointer-events-none border-b border-slate-100 pb-2">
                <div className="w-full h-px bg-slate-50"></div>
                <div className="w-full h-px bg-slate-50"></div>
                <div className="w-full h-px bg-slate-50"></div>
                <div className="w-full h-px bg-slate-50"></div>
              </div>

              {(Object.keys(chartData) as Array<keyof typeof chartData>).map((day) => {
                const info = chartData[day];
                const isActive = activeChartDay === day;
                return (
                  <div 
                    key={day} 
                    onClick={() => setActiveChartDay(day)}
                    className="w-full flex flex-col items-center gap-2 group relative z-10 cursor-pointer"
                  >
                    <div 
                      className={`w-full md:w-10 rounded-t-md transition-all duration-300 relative ${
                        isActive 
                          ? 'bg-blue-600 shadow-md scale-102' 
                          : 'bg-slate-100 group-hover:bg-blue-200'
                      }`}
                      style={{ height: `${info.count * 6}px`, minHeight: '12px' }}
                    >
                      <div className={`absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-2 py-0.5 rounded text-[9px] font-bold transition-opacity whitespace-nowrap pointer-events-none ${
                        isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}>
                        {info.count} Issues
                      </div>
                    </div>
                    <span className={`font-sans text-[10px] font-bold ${isActive ? 'text-blue-600' : 'text-slate-400'}`}>
                      {day}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AI Predictive Forecast Card */}
          <div className="md:col-span-4 bg-white rounded-2xl overflow-hidden flex flex-col border border-slate-100 shadow-sm">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50/50 p-6 text-slate-800 relative overflow-hidden border-b border-slate-100">
              <span className="material-symbols-outlined absolute right-4 top-4 text-5xl opacity-10">magic_button</span>
              <h3 className="font-sans text-sm font-bold mb-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-base align-middle">psychology</span>
                AI Forecast
              </h3>
              <p className="font-sans text-[10px] text-slate-500">Predicted Neighborhood Issues in Next 24h</p>
            </div>

            <div className="p-6 flex-1 flex flex-col gap-4">
              {/* Forecast Item 1 */}
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-sm">water_drop</span>
                </div>
                <div className="space-y-1">
                  <h4 className="font-sans text-xs font-bold text-slate-800">Centennial Sprinkler Leak</h4>
                  <p className="font-sans text-[10px] text-slate-500 leading-relaxed">
                    High probability based on localized pressure logs and aging infrastructure sensors.
                  </p>
                  <span className="inline-block text-[9px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                    85% Likelihood
                  </span>
                </div>
              </div>

              {/* Forecast Item 2 */}
              <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-sm">delete</span>
                </div>
                <div className="space-y-1">
                  <h4 className="font-sans text-xs font-bold text-slate-800">Overflowing Bins near Park</h4>
                  <p className="font-sans text-[10px] text-slate-500 leading-relaxed">
                    Expected rise in central waste volume due to upcoming weekend Farmers Market event.
                  </p>
                  <span className="inline-block text-[9px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                    62% Likelihood
                  </span>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Submit New Report Modal Overlay */}
      <AnimatePresence>
        {showNewReportModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 md:p-8 space-y-6 relative overflow-hidden border border-slate-100"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                <h3 className="font-sans text-lg font-black text-slate-800 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-blue-600 text-2xl font-bold">add_road</span>
                  Report a Community Issue
                </h3>
                <button 
                  onClick={() => setShowNewReportModal(false)}
                  className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors focus:outline-none cursor-pointer"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* Pin drop coordinates alert indicator */}
              {selectedCoordinates && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3.5 text-xs text-emerald-800 flex gap-2.5 items-center">
                  <span className="material-symbols-outlined text-emerald-600 text-lg">my_location</span>
                  <div>
                    <span className="font-bold">📍 Tactical Pin Coordinates Attached:</span>
                    <span className="font-mono ml-1">Lat {selectedCoordinates.lat.toFixed(5)}, Lng {selectedCoordinates.lng.toFixed(5)}</span>
                    <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">Includes coordinate synchronization bonus points!</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleCreateReportSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Issue Title</label>
                  <input 
                    type="text"
                    required
                    placeholder="e.g. Broken bench, overflowing dumpster..."
                    value={newReportTitle}
                    onChange={(e) => setNewReportTitle(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-sans text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">District / Area</label>
                    <select
                      value={newReportDistrict}
                      onChange={(e) => setNewReportDistrict(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-sans text-xs focus:outline-none cursor-pointer focus:ring-2 focus:ring-blue-600"
                    >
                      {userDistrict && !['Downtown', 'Riverside Park', 'Westside', 'Oakwood'].includes(userDistrict) && (
                        <option value={userDistrict}>{userDistrict}</option>
                      )}
                      <option value="Downtown">Downtown</option>
                      <option value="Riverside Park">Riverside Park</option>
                      <option value="Westside">Westside</option>
                      <option value="Oakwood">Oakwood</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Category</label>
                    <select
                      value={newReportCategory}
                      onChange={(e) => setNewReportCategory(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-sans text-xs focus:outline-none cursor-pointer focus:ring-2 focus:ring-blue-600"
                    >
                      <option>Pothole</option>
                      <option>Graffiti</option>
                      <option>Streetlight</option>
                      <option>Park Maintenance</option>
                      <option>Water Leakage</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Urgency Level</label>
                    <select
                      value={newReportUrgency}
                      onChange={(e) => setNewReportUrgency(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-sans text-xs focus:outline-none cursor-pointer focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="High">🔴 High Urgency</option>
                      <option value="Medium">🟡 Medium Urgency</option>
                      <option value="Low">🟢 Low Urgency</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Detailed Description</label>
                  <textarea 
                    required
                    rows={4}
                    placeholder="Provide details about the issue to help volunteers and city staff resolve it..."
                    value={newReportDesc}
                    onChange={(e) => setNewReportDescription(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-sans text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full py-3.5 rounded-full bg-blue-600 text-white font-sans text-xs font-bold shadow-md hover:bg-blue-700 transition-transform hover:scale-[1.01] cursor-pointer"
                >
                  Post Report (+20 Points)
                </button>
              </form>
            </motion.div>
          </div>
        )}
        {resolvingReport && (
          <CameraVerificationModal 
            report={resolvingReport}
            onClose={() => setResolvingReport(null)}
            onSuccess={(updatedPoints) => {
              addPoints(updatedPoints);
              setReports(prev => prev.filter(r => r.id !== resolvingReport.id));
              setResolvingReport(null);
            }}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
