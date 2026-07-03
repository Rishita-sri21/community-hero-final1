import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Report } from '../types';
import { api, AnalysisResult } from '../lib/api';

interface ReportViewProps {
  reports: Report[];
  setReports: React.Dispatch<React.SetStateAction<Report[]>>;
  addPoints: (amount: number) => void;
  setView: (v: string) => void;
  addNotification: (text: string) => void;
}

export default function ReportView({
  reports,
  setReports,
  addPoints,
  setView,
  addNotification
}: ReportViewProps) {
  
  const [image, setImage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanCompleted, setScanCompleted] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [duplicateMessage, setDuplicateMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sample quick images they can select to bypass file upload
  const sampleIssues = [
    {
      title: 'Pothole',
      img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuANUInoxPD65_hoNIvj7p8Xgrq-xNlw7timAYxPgVo4VH2kpRsG66Vm8Xy4ObhzQkzgoCY35eD5lJiW8Lz4BTLZRvOqNQqu1cTLIrKCArF0stbB0qLZceM6I6L-2biKGR0tdgXesrp9SX5Ipjrwc3IbHoUcZvnU3OFwpUtnpBXlo1QKP9SFgEAmiQPwg8J_gdoIW42rfp_YjmRSL3Cr4GQL8qEQ9p8D_E2zEuepljg7x3s4PeldJHmDgqLxvx_xKEdLidxZvSgDd1M'
    },
    {
      title: 'Graffiti',
      img: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBWg4qilF0NOAP66LLBier1AeQDuN6h5gWjEbcz1Vd7FzIoGlVThB7VAsb-Q_MaNavbJjo_I7R9ChLNWsnZS2dF_KkVtLC5fRZNOLKs6ksAgxsbIXeka5aGKaW5DzGyd14WRqDxYZ6RdPJ6Y3Ky4IcMhdrZHEt9yaPfV076tiZtMHGpHwJWLmr3l9U_pPgn3MdbJpZQMZIx-Y8idAjlUuj12D8sOjVc3Lpv6XjtJyRfBJHxZKwIThlG_JtLX_i2DWANjZ4Abdm0AkUg'
    }
  ];

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          handleImageSelected(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          handleImageSelected(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageSelected = async (imgUrl: string) => {
    setImage(imgUrl);
    setScanning(true);
    setScanProgress(0);
    setScanCompleted(false);
    setAnalysisResult(null);
    setDuplicateMessage(null);
    setAiLoading(true);

    try {
      const result = await api.analyzeImage(imgUrl);
      setAnalysisResult(result);
    } catch (err) {
      console.error("Gemini AI Analysis Error, using fallback:", err);
      const isPothole = imgUrl === sampleIssues[0].img;
      setAnalysisResult({
        title: isPothole ? "Pothole in Neighborhood Corridor" : "Graffiti Near Recreation Benches",
        description: isPothole 
          ? "Large corridor cavity detected causing severe alignment risks. Merged and localized via Vision intelligence pinpointing." 
          : "Visual marker and graffiti tagging identified on park picnic structures. Requesting cleanup crew.",
        category: isPothole ? "Vision AI: Pothole" : "Vision AI: Graffiti",
        urgency: isPothole ? "High" : "Medium",
        locationDetails: 'Oakwood & 5th Ave',
        icon: isPothole ? 'warning' : 'potted_plant',
        matchPercentage: 94
      });
    } finally {
      setAiLoading(false);
    }
  };

  // Scan progress bar ticker
  useEffect(() => {
    if (!scanning) return;

    const interval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setScanning(false);
          setScanCompleted(true);
          return 100;
        }
        return prev + 4;
      });
    }, 80);

    return () => clearInterval(interval);
  }, [scanning]);

  const handleDeployIssue = async () => {
    const title = analysisResult?.title || "Civic Hazard";
    const category = analysisResult?.category || "Civic Request";
    const urgency = analysisResult?.urgency || "Medium";
    const desc = analysisResult?.description || "Civic maintenance reported by local Hero.";
    const icon = analysisResult?.icon || "warning";
    const locationStr = analysisResult?.locationDetails || "Oakwood & 5th Ave";

    const newReportData = {
      title,
      description: desc,
      category,
      urgency,
      image: image!,
      locationDetails: locationStr,
      icon,
      coordinates: {
        top: `${30 + Math.random() * 40}%`,
        left: `${20 + Math.random() * 60}%`
      }
    };

    try {
      const response = await api.createReport(newReportData);
      
      if (response.duplicateDetected) {
        setDuplicateMessage(response.message || "A similar issue was already reported nearby!");
        addNotification(`⚠️ Duplicate Detected! Your signal is aggregated to bolster urgency.`);
        setTimeout(() => {
          setView('feed');
        }, 4000);
        return;
      }

      if (response.report) {
        setReports([response.report, ...reports]);
        addPoints(35);
        addNotification(`🚀 Deployed Mission: ${title}`);
        setView('feed');
      }
    } catch (err) {
      console.error("Deploy report failed: ", err);
      // Fallback
      const deployedRep: Report = {
        id: `rep-${Date.now()}`,
        reporter: {
          name: 'Sarah J. (You)',
          avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC_lAp8z4bNL3A35euAejA4P4Jp-c_46htfSECdf0e2OahOosB1nASedDS7AIskfRGj8SYzUcydfuRT1Dr-yu_Z6VzuOt-Ap9rRQlNzdZFKv3IFZsybhe-_4NlOtyv2BuNBboqAJXJv3wN303mFXyl2riZr3fcJqKxzh7KQS8Tl-fQqhGGkUTyQiAdH8irxUlSS1h1f-HR-2mRxm444aOQ_R7wtX5Ta9G21tUMSZL9yOkGchSPsR8azAFc7YANDl4LgauEhxgUYX9A'
        },
        timeAgo: 'Just now',
        district: 'Downtown',
        urgency: urgency as any,
        category: category,
        title: title,
        description: desc,
        image: image!,
        locationDetails: locationStr,
        upvotes: 1,
        comments: 0,
        verified: true,
        coordinates: { top: '38%', left: '44%' },
        icon: icon
      };

      setReports([deployedRep, ...reports]);
      addPoints(35);
      addNotification(`🚀 Deployed Mission: ${title}`);
      setView('feed');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-entrance">
      
      <div className="text-center space-y-3">
        <h1 className="font-sans text-display-lg text-on-surface">Report a Mission</h1>
        <p className="font-sans text-body-lg text-on-surface-variant max-w-lg mx-auto leading-relaxed">
          Initialize a vision analysis scan to catalog and track local neighborhood issues instantly.
        </p>
      </div>

      {/* Initialize Scan Box Area */}
      {!image && (
        <div 
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`h-80 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-8 text-center cursor-pointer transition-all relative overflow-hidden group ${
            dragActive 
              ? 'border-primary bg-primary/5 shadow-inner' 
              : 'border-outline-variant hover:border-primary hover:bg-surface-container-low'
          }`}
        >
          <input 
            type="file" 
            accept="image/*"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="space-y-4">
            <div className="w-16 h-16 bg-primary-fixed text-primary rounded-full flex items-center justify-center mx-auto shadow-md group-hover:scale-110 transition-transform duration-200">
              <span className="material-symbols-outlined text-[32px]">photo_camera</span>
            </div>
            <div>
              <p className="font-sans text-label-md font-bold text-on-surface">Drag &amp; Drop or Click to Scan Image</p>
              <p className="font-sans text-xs text-outline mt-1 leading-none">Supports JPG, PNG up to 10MB</p>
            </div>
          </div>

          {/* Quick choose selection sample buttons in bottom corner */}
          <div className="absolute bottom-4 inset-x-4 flex justify-center gap-3" onClick={(e) => e.stopPropagation()}>
            <span className="text-[10px] font-bold text-outline uppercase tracking-wider self-center mr-2">Quick Sample:</span>
            {sampleIssues.map((sm, idx) => (
              <button 
                key={idx}
                onClick={() => handleImageSelected(sm.img)}
                className="px-4 py-2 bg-white hover:bg-surface border border-outline-variant rounded-lg font-sans text-xs font-semibold shadow-sm text-on-surface transition-colors cursor-pointer focus:outline-none"
              >
                {sm.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active laser scanning progress simulation viewport */}
      {image && (
        <div className="glass-panel rounded-2xl overflow-hidden shadow-2xl border border-white/50 relative">
          
          <div className="relative h-80 w-full overflow-hidden bg-black/10">
            <img 
              alt="Uploaded file scan" 
              className="w-full h-full object-cover select-none pointer-events-none" 
              referrerPolicy="no-referrer"
              src={image}
            />

            {/* Scanning Laser Line Indicator */}
            {scanning && (
              <motion.div 
                animate={{ top: ['0%', '100%', '0%'] }}
                transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-tertiary to-transparent shadow-[0_0_15px_#2563eb] z-10"
              />
            )}

            {/* Scanning blur backdrop */}
            {scanning && (
              <div className="absolute inset-0 bg-primary/5 backdrop-blur-[1px]"></div>
            )}
          </div>

          {/* Scan Processing status row */}
          <div className="p-8 space-y-6">
            
            {/* Ticker percentage or status */}
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-sans text-headline-md font-bold text-on-surface">
                  {scanning ? 'Processing Environment...' : 'Vision Diagnostic Complete'}
                </h3>
                <p className="font-sans text-xs text-on-surface-variant leading-none mt-1">
                  {scanning ? 'Correlating neural telemetry coordinates...' : 'Pinpoint verification verified'}
                </p>
              </div>

              <span className="font-sans text-headline-md font-bold text-primary">
                {scanProgress}%
              </span>
            </div>

            {/* Actual dynamic loader bar */}
            <div className="w-full h-3 bg-surface-container rounded-full overflow-hidden shadow-inner">
              <div 
                className="h-full bg-gradient-to-r from-primary via-secondary to-tertiary rounded-full transition-all duration-100" 
                style={{ width: `${scanProgress}%` }}
              />
            </div>

            {/* Revealed detection info once scan completes */}
            <AnimatePresence>
              {scanCompleted && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0 }}
                  className="space-y-6 border-t border-surface-variant pt-6"
                >
                  <div className="flex justify-between items-center">
                    <h4 className="font-sans text-label-md uppercase tracking-wider text-[11px] font-bold text-on-surface-variant">
                      AI Live Analysis Results
                    </h4>
                    {analysisResult?.matchPercentage && (
                      <span className="text-xs bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">
                        AI Match: {analysisResult.matchPercentage}%
                      </span>
                    )}
                  </div>

                  {aiLoading ? (
                    <div className="flex flex-col items-center justify-center py-6 space-y-3">
                      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                      <p className="text-xs font-semibold text-outline">Synthesizing multimodal vision matrices...</p>
                    </div>
                  ) : duplicateMessage ? (
                    <div className="bg-error/10 border border-error/20 rounded-xl p-5 text-center space-y-3">
                      <span className="material-symbols-outlined text-error text-4xl">warning_amber</span>
                      <h5 className="font-bold text-error text-sm">Intelligent Deduplication Engine Signal</h5>
                      <p className="text-xs text-on-surface-variant leading-relaxed">
                        {duplicateMessage}
                      </p>
                      <p className="text-[10px] text-error uppercase font-extrabold tracking-wider">
                        Redirecting to main feed in seconds...
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4 flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-error-container text-on-error-container flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-[18px]">psychology</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-outline block leading-none mb-1">Detected Issue</span>
                            <span className="font-sans text-sm font-semibold text-on-surface leading-tight block">
                              {analysisResult?.title || 'Severe Road Corridor Cavity'}
                            </span>
                            <span className="text-[11px] text-on-surface-variant leading-tight block mt-1">
                              {analysisResult?.category || 'Vision AI: Pothole'}
                            </span>
                          </div>
                        </div>

                        <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4 flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-secondary-container/30 text-secondary flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-[18px]">pin_drop</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-outline block leading-none mb-1">Location Pinpoint</span>
                            <span className="font-sans text-sm font-semibold text-on-surface leading-tight block">
                              {analysisResult?.locationDetails || 'Oakwood & 5th Ave'}
                            </span>
                            <span className="text-xs font-bold text-primary block mt-1">
                              Urgency: {analysisResult?.urgency || 'High'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {analysisResult?.description && (
                        <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4">
                          <span className="text-[10px] uppercase font-bold text-outline block leading-none mb-2">Issue Context</span>
                          <p className="text-xs text-on-surface-variant leading-relaxed">
                            {analysisResult.description}
                          </p>
                        </div>
                      )}

                      <div className="flex gap-4">
                        <button 
                          onClick={() => {
                            setImage(null);
                            setScanCompleted(false);
                            setAnalysisResult(null);
                          }}
                          className="flex-1 py-4 border border-outline-variant rounded-full font-sans text-xs font-bold text-on-surface-variant hover:bg-surface-container transition-colors focus:outline-none cursor-pointer text-center"
                        >
                          Scan Another
                        </button>
                        <button 
                          onClick={handleDeployIssue}
                          className="flex-1 py-4 bg-primary text-on-primary rounded-full font-sans text-xs font-bold shadow-lg hover:bg-primary-container transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-1 cursor-pointer focus:outline-none"
                        >
                          <span className="material-symbols-outlined text-xs">rocket_launch</span>
                          Deploy Hero (+35 Points)
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </div>
      )}

    </div>
  );
}
