import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Report } from '../types';
import { api } from '../lib/api';

interface CameraVerificationModalProps {
  report: Report;
  onClose: () => void;
  onSuccess: (updatedPoints: number) => void;
}

export default function CameraVerificationModal({
  report,
  onClose,
  onSuccess
}: CameraVerificationModalProps) {
  const [step, setStep] = useState<'camera' | 'preview' | 'loading' | 'certificate' | 'error'>('camera');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<any>(null);
  const [heroPoints, setHeroPoints] = useState<number>(150);
  const [errorMessage, setErrorMessage] = useState<string>('');
  
  // Camera streams
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize camera
  const startCamera = async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      console.warn("Camera access denied or unavailable. Falling back to manual upload.", err);
      // Fallback is clean: the UI allows manual photo upload
    }
  };

  useEffect(() => {
    if (step === 'camera') {
      startCamera();
    }
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [step]);

  // Capture photo
  const handleCapture = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg');
      setCapturedImage(dataUrl);
      setStep('preview');
      
      // Stop camera stream to release device resource
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }
  };

  // Handle Manual File Upload (Fallback)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCapturedImage(reader.result as string);
      setStep('preview');
    };
    reader.readAsDataURL(file);
  };

  // Submit resolution to backend
  const handleSubmit = async () => {
    if (!capturedImage) return;
    setStep('loading');
    try {
      const response = await api.resolveReport(report.id, capturedImage);
      if (response.success && response.auditResult?.success) {
        setAuditResult(response.auditResult);
        setHeroPoints(response.heroPointsAwarded || 150);
        setStep('certificate');
      } else {
        setErrorMessage(response.message || "Civic AI Vision was unable to verify resolution of the reported issue. Please capture a clearer picture directly showing the completed repair.");
        setStep('error');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage("Municipal network coordinate issue. Please confirm database connectivity and try again.");
      setStep('error');
    }
  };

  const handleFinish = () => {
    onSuccess(heroPoints);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-white/20 overflow-hidden relative"
      >
        {/* Banner header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white flex justify-between items-center">
          <div>
            <span className="text-[10px] bg-white/20 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
              Verify Issue Resolution
            </span>
            <h3 className="font-sans text-lg font-bold mt-1 line-clamp-1">{report.title}</h3>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer transition-colors focus:outline-none"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="p-6 space-y-6">
          <AnimatePresence mode="wait">
            {/* Step 1: Camera Feed or Fallback upload */}
            {step === 'camera' && (
              <motion.div
                key="camera"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-4"
              >
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[18px]">photo_camera</span>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Instructions</h4>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Frame the resolved issue clearly in your camera. Capture the repaired pothole, cleaned street, or fixed infrastructure to claim your multiplier points.
                    </p>
                  </div>
                </div>

                {/* Video Stage with overlays */}
                <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-900 border border-slate-200 shadow-inner flex items-center justify-center">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="w-full h-full object-cover transform scale-x-[-1]"
                  />
                  
                  {/* Real-time scanning animation scanner overlay */}
                  <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-[pulse_2s_infinite] shadow-md"></div>
                  
                  <div className="absolute top-3 right-3 bg-black/60 px-2.5 py-1 rounded-full flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-ping"></span>
                    <span className="text-[10px] text-white font-bold tracking-wider uppercase font-mono">Live Feed</span>
                  </div>
                </div>

                {/* Control Buttons */}
                <div className="flex gap-4">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 py-3 border border-slate-200 rounded-full font-sans text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all flex items-center justify-center gap-1.5 cursor-pointer focus:outline-none"
                  >
                    <span className="material-symbols-outlined text-sm">upload_file</span>
                    Upload Photo
                  </button>
                  <button
                    onClick={handleCapture}
                    className="flex-1 py-3 bg-blue-600 text-white rounded-full font-sans text-xs font-bold shadow-md hover:bg-blue-700 hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer focus:outline-none"
                  >
                    <span className="material-symbols-outlined text-sm">photo_camera</span>
                    Capture Proof
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </motion.div>
            )}

            {/* Step 2: Preview Capture and Submit */}
            {step === 'preview' && capturedImage && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-4"
              >
                <div className="text-center">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Verify Capture Evidence</span>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">Review your resolution proof photo before submitting to the Civic Vision Audit AI.</p>
                </div>

                <div className="aspect-video rounded-xl overflow-hidden border border-slate-200 shadow-md bg-slate-100">
                  <img src={capturedImage} alt="Captured resolution proof" className="w-full h-full object-cover" />
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => setStep('camera')}
                    className="flex-1 py-3 border border-slate-200 rounded-full font-sans text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all flex items-center justify-center gap-1 cursor-pointer focus:outline-none"
                  >
                    <span className="material-symbols-outlined text-sm">replay</span>
                    Retake
                  </button>
                  <button
                    onClick={handleSubmit}
                    className="flex-1 py-3 bg-indigo-600 text-white rounded-full font-sans text-xs font-bold shadow-md hover:bg-indigo-700 hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer focus:outline-none"
                  >
                    <span className="material-symbols-outlined text-sm">verified_user</span>
                    Verify Resolution
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Loading AI Audit */}
            {step === 'loading' && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-12 space-y-4"
              >
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="material-symbols-outlined text-blue-600 text-2xl absolute inset-0 m-auto flex items-center justify-center animate-pulse">
                    psychology
                  </span>
                </div>
                <div className="text-center space-y-1.5 max-w-xs">
                  <h4 className="font-sans text-sm font-bold text-slate-800">Running Multi-Modal Vision Audit</h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Analyzing before-and-after spatial metrics and verifying municipal integrity...
                  </p>
                </div>
              </motion.div>
            )}

            {/* Step 4: HOLOGRAM CERTIFICATE */}
            {step === 'certificate' && auditResult && (
              <motion.div
                key="certificate"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                {/* Holographic glowing certificate card */}
                <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-950 p-6 rounded-2xl border-2 border-indigo-500/30 relative overflow-hidden shadow-2xl text-center text-white">
                  
                  <div className="absolute inset-0 bg-slate-950/20 pointer-events-none"></div>
                  <div className="absolute -top-10 -right-10 w-40 h-40 bg-indigo-600 rounded-full blur-[60px] opacity-25"></div>
                  <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-teal-500 rounded-full blur-[60px] opacity-20"></div>

                  <div className="relative z-10 space-y-5">
                    {/* Badge Icon with glowing circle */}
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-r from-indigo-400 to-teal-400 p-0.5 shadow-lg shadow-indigo-500/30">
                      <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center text-teal-400">
                        <span className="material-symbols-outlined text-[28px] animate-pulse">workspace_premium</span>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-sans text-[10px] uppercase tracking-widest text-teal-400 font-extrabold">
                        Civic Audit Resolution Certification
                      </h4>
                      <h3 className="font-sans text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-200 to-teal-100 tracking-tight mt-1">
                        Certificate of Civic Honor
                      </h3>
                    </div>

                    {/* Restoration Score badge & Detail */}
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-left space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-indigo-200 font-semibold uppercase tracking-wider text-[10px]">Audit Match Score</span>
                        <span className="text-teal-400 font-bold">{auditResult.confidenceScore}% Quality</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${auditResult.confidenceScore}%` }}
                          transition={{ duration: 1, ease: 'easeOut' }}
                          className="h-full bg-gradient-to-r from-indigo-500 to-teal-400 rounded-full"
                        />
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed italic pt-1">
                        "{auditResult.restorationDetails}"
                      </p>
                    </div>

                    {/* Green Environmental Impact Metrics */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-slate-900/50 border border-white/5 p-3 rounded-xl text-center space-y-1">
                        <span className="material-symbols-outlined text-teal-400 text-lg">co2</span>
                        <span className="block text-[10px] uppercase font-bold text-slate-400 leading-none">CO2 Offset</span>
                        <span className="block text-xs font-mono font-bold text-teal-300">-{auditResult.co2OffsetKg}kg</span>
                      </div>

                      <div className="bg-slate-900/50 border border-white/5 p-3 rounded-xl text-center space-y-1">
                        <span className="material-symbols-outlined text-indigo-400 text-lg">energy_savings_leaf</span>
                        <span className="block text-[10px] uppercase font-bold text-slate-400 leading-none">Eco-Index</span>
                        <span className="block text-xs font-mono font-bold text-indigo-300">+{auditResult.ecoIndexBoost}%</span>
                      </div>

                      <div className="bg-slate-900/50 border border-white/5 p-3 rounded-xl text-center space-y-1">
                        <span className="material-symbols-outlined text-rose-400 text-lg">health_and_safety</span>
                        <span className="block text-[10px] uppercase font-bold text-slate-400 leading-none">Safety Index</span>
                        <span className="block text-xs font-mono font-bold text-rose-300">+{auditResult.safetyScoreIncrease}%</span>
                      </div>
                    </div>

                    {/* Points Multiplier highlight */}
                    <div className="bg-teal-500/10 border border-teal-500/20 py-3 rounded-xl flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-teal-400 animate-bounce">rocket_launch</span>
                      <span className="text-xs font-sans font-bold text-teal-300">
                        Multiplier unlocked: <strong className="text-white text-sm">+{heroPoints} Hero Points</strong> (1.5x)
                      </span>
                    </div>

                  </div>
                </div>

                {/* Dismiss control */}
                <button
                  onClick={handleFinish}
                  className="w-full py-4 bg-blue-600 text-white rounded-full font-sans text-xs font-bold shadow-lg hover:bg-blue-700 hover:scale-[1.01] active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer focus:outline-none"
                >
                  <span className="material-symbols-outlined">auto_stories</span>
                  Save to Neighborhood Stories
                </button>
              </motion.div>
            )}

            {/* Step 5: Failed AI Audit / Error */}
            {step === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4 text-center"
              >
                <div className="w-16 h-16 rounded-full bg-red-100 text-red-700 flex items-center justify-center mx-auto shadow-md">
                  <span className="material-symbols-outlined text-4xl">warning_amber</span>
                </div>
                <div className="space-y-2 max-w-sm mx-auto">
                  <h4 className="font-sans text-sm font-bold text-slate-800">Audit Verification Unsatisfied</h4>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {errorMessage}
                  </p>
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    onClick={() => setStep('camera')}
                    className="flex-1 py-3 border border-slate-200 rounded-full font-sans text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all flex items-center justify-center gap-1 cursor-pointer focus:outline-none"
                  >
                    <span className="material-symbols-outlined text-sm">replay</span>
                    Try Again
                  </button>
                  <button
                    onClick={onClose}
                    className="flex-1 py-3 border border-slate-300 rounded-full font-sans text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all flex items-center justify-center gap-1 cursor-pointer focus:outline-none"
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
