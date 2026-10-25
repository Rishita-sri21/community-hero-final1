import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import L from 'leaflet';
import { Mission, Report } from '../types';
import { api } from '../lib/api';
import { assetUrl, placeLabel } from '../config';
import CameraVerificationModal from './CameraVerificationModal';
import MissionPanel from './MissionPanel';
import AnalyticsPanel from './AnalyticsPanel';
import { toast, errorMessage } from '../lib/toast';
import { useReportActions } from '../hooks/useReportActions';
import { POINTS } from '../shared/catalog';
import { centerForDistrict, distanceBetweenKm } from '../shared/neighborhoods';
import { photoToDataUrl } from '../lib/image';
import TriageNote from './TriageNote';

interface MapViewProps {
  reports: Report[];
  setReports: React.Dispatch<React.SetStateAction<Report[]>>;
  // Sets the user's total to the value the server returned after it awarded points itself
  setPoints: (total: number) => void;
  innerTab: 'map' | 'feed' | 'analytics';
  setInnerTab: (t: 'map' | 'feed' | 'analytics') => void;
  userDistrict?: string;
  liveConnected?: boolean;
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

export default function MapView({
  reports,
  setReports,
  setPoints,
  innerTab,
  setInnerTab,
  userDistrict,
  liveConnected
}: MapViewProps) {
  // Feed Filters
  const [urgencyFilter, setUrgencyFilter] = useState<'All' | 'High' | 'Medium' | 'Low'>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // The planned walking route, drawn on the map while set
  const [mission, setMission] = useState<Mission | null>(null);
  
  // Submit New Report Modal state
  const [showNewReportModal, setShowNewReportModal] = useState(false);
  const [newReportTitle, setNewReportTitle] = useState('');
  const [newReportDesc, setNewReportDescription] = useState('');
  const [newReportUrgency, setNewReportUrgency] = useState<'High' | 'Medium' | 'Low' | 'auto'>('auto');
  const [newReportPhoto, setNewReportPhoto] = useState<string | null>(null);
  const [submittingReport, setSubmittingReport] = useState(false);
  const [newReportCategory, setNewReportCategory] = useState('auto');


  // The map opens on the user's neighborhood
  const { lat: centerLat, lng: centerLng } = centerForDistrict(userDistrict);
  const mapCenter: [number, number] = [centerLat, centerLng];

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
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [resolvingReport, setResolvingReport] = useState<Report | null>(null);

  // Map refs for Leaflet instances
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const selectionMarkerRef = useRef<L.Marker | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const fittedMissionRef = useRef<Mission | null>(null);

  // Synchronize Leaflet map lifecycle
  useEffect(() => {
    if (innerTab !== 'map' || !mapContainerRef.current) {
      // Cleanup map instance if we switch away from map tab
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markersGroupRef.current = null;
        selectionMarkerRef.current = null;
        routeLayerRef.current = null;
        fittedMissionRef.current = null;
      }
      return;
    }

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: mapCenter,
        zoom: 13,
        zoomControl: false,
      });

      // OpenStreetMap's standard tiles need no API key (CARTO's basemaps now require one)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map);

      // Top-right aligned zoom control buttons
      L.control.zoom({
        position: 'topright'
      }).addTo(map);

      const markersGroup = L.layerGroup().addTo(map);
      markersGroupRef.current = markersGroup;
      mapInstanceRef.current = map;

      // Re-measure once the layout settles, unless the user already left the map tab
      setTimeout(() => {
        if (mapInstanceRef.current === map) map.invalidateSize();
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
        const latLng = getLatLngFromReport(rep, mapCenter);
        const isSelected = activeReportId === rep.id;
        const pinIcon = createCustomMarkerIcon(rep.category, rep.urgency, isSelected);

        const marker = L.marker(latLng, { icon: pinIcon });
        
        marker.on('click', () => {
          setActiveReportId(rep.id);
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

  // Draw the planned mission: a dashed line from the start through each numbered stop
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (innerTab !== 'map' || !map) return;

    routeLayerRef.current?.remove();
    routeLayerRef.current = null;
    if (!mission) return;

    const layer = L.layerGroup().addTo(map);
    const path: L.LatLngExpression[] = [[mission.start.lat, mission.start.lng], ...mission.stops.map((s) => [s.lat, s.lng] as L.LatLngExpression)];
    L.polyline(path, { color: '#7c3aed', weight: 4, opacity: 0.85, dashArray: '8 8' }).addTo(layer);
    L.circleMarker([mission.start.lat, mission.start.lng], { radius: 7, color: '#ffffff', weight: 3, fillColor: '#7c3aed', fillOpacity: 1 })
      .bindTooltip('Start')
      .addTo(layer);
    mission.stops.forEach((stop, idx) => {
      L.marker([stop.lat, stop.lng], {
        icon: L.divIcon({
          html: `<div style="width:22px;height:22px;border-radius:9999px;background:#7c3aed;color:#fff;font:800 11px sans-serif;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)">${idx + 1}</div>`,
          className: 'mission-stop',
          iconSize: [22, 22],
          iconAnchor: [11, 30],
        }),
        zIndexOffset: 1000,
        interactive: false,
      }).addTo(layer);
    });
    routeLayerRef.current = layer;

    // Zoom to the route once per new mission, not on every re-render
    if (fittedMissionRef.current !== mission) {
      fittedMissionRef.current = mission;
      map.fitBounds(L.latLngBounds(path as L.LatLngTuple[]), { padding: [60, 60], maxZoom: 16 });
    }
  }, [innerTab, mission]);

  // Close the report form with the Escape key
  useEffect(() => {
    if (!showNewReportModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowNewReportModal(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showNewReportModal]);

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
    if (!newReportTitle || !newReportDesc || submittingReport) return;

    setSubmittingReport(true);
    try {
      const partialReport: Partial<Report> = {
        title: newReportTitle,
        description: newReportDesc,
        // "auto" leaves the field to the server's background triage
        urgency: newReportUrgency as Report['urgency'],
        district: userDistrict,
        category: newReportCategory,
        lat: selectedCoordinates?.lat,
        lng: selectedCoordinates?.lng,
        image: newReportPhoto || undefined,
      };

      const { report: created, points: updatedPoints } = await api.createReport(partialReport);
      // Same distance label as the reports loaded from the server
      if (created.lat !== undefined && created.lng !== undefined) {
        const km = distanceBetweenKm({ lat: centerLat, lng: centerLng }, { lat: created.lat, lng: created.lng });
        created.distanceKm = Math.round(km * 10) / 10;
      }
      // The live update for this report may have arrived first; keep a single copy
      setReports(prev => [created, ...prev.filter(r => r.id !== created.id)]);
      if (updatedPoints !== null) {
        setPoints(updatedPoints);
        toast.success(`Report posted! +${POINTS.REPORT_CREATED} Hero Points`);
      } else {
        toast.success('Report posted!');
      }

      // Reset fields
      setNewReportTitle('');
      setNewReportDescription('');
      setNewReportPhoto(null);
      setShowNewReportModal(false);
    } catch (err) {
      // Keep the form open with the user's text so they can retry; never show a fake report
      toast.error(errorMessage(err, 'Could not post your report. Please try again.'));
    } finally {
      setSubmittingReport(false);
    }
  };

  const handlePhotoChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be chosen again after removing it
    if (!file) return;
    try {
      setNewReportPhoto(await photoToDataUrl(file));
    } catch (err) {
      toast.error(errorMessage(err, 'That photo could not be read. Try another one.'));
    }
  };

  const { upvote: toggleUpvoteReport, verify: toggleVerifyReport } = useReportActions(setReports, setPoints);

  const filteredReports = reports.filter(r => {
    const matchesUrgency = urgencyFilter === 'All' || r.urgency === urgencyFilter;
    const matchesSearch = r.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          r.district.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesUrgency && matchesSearch;
  });

  return (
    <div className="w-full px-4 py-6 space-y-6">
      
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
            <span
              className={`ml-3 align-middle inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                liveConnected ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-500 border border-slate-200'
              }`}
              title={liveConnected ? 'New reports and votes appear here as they happen' : 'Reconnecting to live updates'}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${liveConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
              {liveConnected ? 'Live' : 'Offline'}
            </span>
          </h1>
          <p className="font-sans text-sm text-slate-500 max-w-2xl leading-relaxed">
            {innerTab === 'map' && "Interactive tactical community map. Drag, zoom, track reports, or click anywhere to drop a new issue pin."}
            {innerTab === 'feed' && "Real-time updates from your local heroes. Verify reports to help keep our community data clean."}
            {innerTab === 'analytics' && "Open and resolved reports around your neighborhood, straight from the database."}
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
      {innerTab === 'map' && (
        <MissionPanel
          userDistrict={userDistrict}
          mission={mission}
          setMission={setMission}
          onSelectStop={setActiveReportId}
        />
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
                    {rep.image ? (
                      <img 
                        alt="Issue" 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer"
                        src={assetUrl(rep.image)}
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-400 text-[11px] font-semibold gap-1">
                        <span className="material-symbols-outlined text-base">no_photography</span> No photo yet
                      </div>
                    )}
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

                    <div className="pt-2 border-t border-slate-50 flex justify-between items-center gap-2">
                      {rep.isMine ? (
                        <>
                          <p className="flex-1 text-[11px] font-semibold text-slate-400 leading-snug">
                            Your report. Fixed it yourself? Close it with a photo (no points).
                          </p>
                          <button
                            onClick={() => setResolvingReport(rep)}
                            className="py-2 px-3 bg-slate-800 text-white rounded-xl font-sans text-xs font-bold hover:bg-slate-900 transition-all flex items-center justify-center gap-1 cursor-pointer focus:outline-none shrink-0"
                          >
                            <span className="material-symbols-outlined text-xs">photo_camera</span>
                            Mark fixed
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => toggleVerifyReport(rep.id)}
                            disabled={rep.hasVerified}
                            className={`flex-1 py-2 px-3 rounded-xl font-sans text-xs font-bold transition-all focus:outline-none text-center border disabled:cursor-default ${
                              rep.hasVerified
                                ? 'bg-teal-50 text-teal-600 border-teal-100'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 cursor-pointer'
                            }`}
                          >
                            <span className="material-symbols-outlined text-xs align-middle mr-1">
                              {rep.hasVerified ? 'check_circle' : 'verified'}
                            </span>
                            {rep.hasVerified ? 'You verified' : 'Verify'}
                          </button>

                          <button
                            onClick={() => setResolvingReport(rep)}
                            className="flex-1 py-2 px-3 bg-indigo-600 text-white rounded-xl font-sans text-xs font-bold hover:bg-indigo-700 hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer focus:outline-none shadow-sm"
                          >
                            <span className="material-symbols-outlined text-xs">photo_camera</span>
                            Resolve
                          </button>
                        </>
                      )}
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
                        <p className="font-sans text-[10px] text-slate-400 font-semibold leading-none mt-1">{rep.timeAgo} • {placeLabel(rep)}</p>
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
                  <TriageNote report={rep} />

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
                      <img src={assetUrl(rep.image)} alt={rep.title} className="w-full h-full object-cover" />
                    </div>
                  )}

                  {/* Action bottom details row */}
                  <div className="flex justify-between items-center pt-3 border-t border-slate-50 mt-auto">
                    <div className="flex gap-4">
                      <button 
                        onClick={() => toggleUpvoteReport(rep.id)}
                        disabled={rep.isMine || rep.hasUpvoted}
                        title={rep.isMine ? 'This is your report' : rep.hasUpvoted ? 'You upvoted this' : 'Upvote'}
                        className={`flex items-center gap-1.5 text-xs font-bold focus:outline-none transition-colors disabled:cursor-default ${
                          rep.hasUpvoted ? 'text-blue-600' : 'text-slate-400 hover:text-blue-600 cursor-pointer'
                        }`}
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
                      disabled={rep.isMine || rep.hasVerified}
                      title={rep.isMine ? "You can't verify your own report" : undefined}
                      className={`px-3 py-1.5 rounded-full font-sans text-[10px] font-bold transition-all focus:outline-none border disabled:cursor-default ${
                        rep.hasVerified || (rep.verified && rep.isMine)
                          ? 'bg-teal-50 text-teal-600 border-teal-100'
                          : rep.isMine
                            ? 'bg-slate-50 text-slate-400 border-slate-100'
                            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 cursor-pointer'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[11px] align-middle mr-1">
                        {rep.verified ? 'check_circle' : 'verified'}
                      </span>
                      {rep.hasVerified ? 'You verified' : rep.verified ? 'Verified' : 'Verify'}
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
        <AnalyticsPanel center={{ lat: centerLat, lng: centerLng }} reports={reports} />
      )}

      {/* Submit New Report Modal Overlay.
          Rendered into document.body so it sits above the fixed header instead of inside <main>'s stacking context. */}
      {createPortal(
      <AnimatePresence>
        {showNewReportModal && (
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-start sm:items-center justify-center z-[100] p-4 overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowNewReportModal(false);
            }}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              role="dialog"
              aria-modal="true"
              className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6 md:p-8 space-y-6 relative border border-slate-100 my-auto"
            >
              <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                <h3 className="font-sans text-lg font-black text-slate-800 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-blue-600 text-2xl font-bold">add_road</span>
                  Report a Community Issue
                </h3>
                <button 
                  type="button"
                  aria-label="Close"
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
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Category</label>
                    <select
                      value={newReportCategory}
                      onChange={(e) => setNewReportCategory(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-sans text-xs focus:outline-none cursor-pointer focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="auto">✨ Let AI decide</option>
                      <option>Pothole</option>
                      <option>Graffiti</option>
                      <option>Streetlight</option>
                      <option>Park Maintenance</option>
                      <option>Waste Management</option>
                      <option>Water Leakage</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Urgency Level</label>
                    <select
                      value={newReportUrgency}
                      onChange={(e) => setNewReportUrgency(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-sans text-xs focus:outline-none cursor-pointer focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="auto">✨ Let AI decide</option>
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

                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Photo (optional)</span>
                  {newReportPhoto ? (
                    <div className="relative h-36 rounded-xl overflow-hidden border border-slate-200">
                      <img src={newReportPhoto} alt="Your photo of the issue" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setNewReportPhoto(null)}
                        className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-bold px-2.5 py-1 rounded-full cursor-pointer hover:bg-black/80"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 h-20 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 cursor-pointer hover:border-blue-400 hover:text-blue-600 transition-colors">
                      <span className="material-symbols-outlined text-lg">add_a_photo</span>
                      Add a photo of the problem
                      <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={handlePhotoChosen} />
                    </label>
                  )}
                  <p className="text-[10px] text-slate-400">A photo helps neighbors verify it, and lets the AI compare it with the fix photo later.</p>
                </div>

                <button 
                  type="submit"
                  disabled={submittingReport}
                  className="w-full py-3.5 rounded-full bg-blue-600 text-white font-sans text-xs font-bold shadow-md hover:bg-blue-700 transition-transform hover:scale-[1.01] cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                >
                  {submittingReport ? 'Posting...' : `Post Report (+${POINTS.REPORT_CREATED} Points)`}
                </button>
              </form>
            </motion.div>
          </div>
        )}
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
      </AnimatePresence>,
      document.body
      )}

    </div>
  );
}
