import React, { useState } from 'react';
import { api } from '../lib/api';
import { ONBOARDING_DATA, districtLabel, Country, Area, Neighborhood } from '../shared/neighborhoods';
import { motion, AnimatePresence } from 'motion/react';
import { MapPin, Navigation, Map, Shield, HelpCircle, ArrowRight, ArrowLeft, Check, Globe } from 'lucide-react';

interface OnboardingLocationSetupProps {
  currentUser: any;
  onComplete: (updatedUser: any) => void;
}

export const OnboardingLocationSetup: React.FC<OnboardingLocationSetupProps> = ({ currentUser, onComplete }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [selectedArea, setSelectedArea] = useState<Area | null>(null);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<Neighborhood | null>(null);
  
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const handleCountrySelect = (country: Country) => {
    setSelectedCountry(country);
    setSelectedArea(null);
    setSelectedNeighborhood(null);
    setStep(2);
  };

  const handleAreaSelect = (area: Area) => {
    setSelectedArea(area);
    setSelectedNeighborhood(null);
    setStep(3);
  };

  const handleNeighborhoodSelect = (neighborhood: Neighborhood) => {
    setSelectedNeighborhood(neighborhood);
  };

  const handleBack = () => {
    if (step === 3) {
      setStep(2);
      setSelectedNeighborhood(null);
    } else if (step === 2) {
      setStep(1);
      setSelectedArea(null);
    }
  };

  const handleCompleteSetup = async () => {
    if (!selectedCountry || !selectedArea || !selectedNeighborhood) return;
    setLoading(true);
    setError('');

    // Format final full location path to provide hyper-localized action experience
    const fullDistrictName = districtLabel(selectedCountry, selectedArea, selectedNeighborhood);

    try {
      const res = await api.updateDistrict(fullDistrictName);
      if (res.success) {
        onComplete(res.user);
      } else {
        setError('Unable to lock-in neighborhood parameters. Please try again.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Connection error while saving location to municipal registry.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Dynamic ambient radial background glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-4xl bg-white/90 backdrop-blur-xl border border-slate-200/60 rounded-3xl shadow-2xl p-6 sm:p-8 relative z-10 flex flex-col justify-between min-h-[580px]">
        
        <div>
          {/* Onboarding Stage Header */}
          <div className="flex flex-col sm:flex-row items-center justify-between border-b border-slate-100 pb-5 mb-6 gap-4">
            <div className="flex items-center gap-4 text-center sm:text-left">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shrink-0">
                <Globe className="w-6 h-6 text-white animate-spin-slow" style={{ animationDuration: '8s' }} />
              </div>
              <div>
                <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest font-sans">GLOBAL COMMUNITY INTEGRATION</p>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Lock-In Your Action Location</h2>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-slate-100 border border-slate-200/40 rounded-full px-4 py-1.5 text-xs text-slate-500 font-medium">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></span>
              Citizen: <span className="font-bold text-indigo-600">{currentUser.name}</span>
            </div>
          </div>

          {/* Stepper progress indicator */}
          <div className="flex items-center gap-2 mb-6 bg-slate-50 border border-slate-100 p-2 rounded-2xl">
            <div className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all duration-300 ${step === 1 ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/10' : 'text-slate-400'}`}>
              <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-[10px] shrink-0">1</span>
              <span>Country</span>
              {selectedCountry && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
            </div>
            <div className="w-4 h-0.5 bg-slate-200" />
            <div className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all duration-300 ${step === 2 ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/10' : 'text-slate-400'}`}>
              <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-[10px] shrink-0">2</span>
              <span>Area / City</span>
              {selectedArea && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
            </div>
            <div className="w-4 h-0.5 bg-slate-200" />
            <div className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all duration-300 ${step === 3 ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/10' : 'text-slate-400'}`}>
              <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-[10px] shrink-0">3</span>
              <span>Community</span>
              {selectedNeighborhood && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
            </div>
          </div>

          {/* Breadcrumb path select */}
          {(selectedCountry || selectedArea) && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mb-5 bg-indigo-50/50 border border-indigo-100/30 px-3 py-2 rounded-xl w-fit">
              <span className="font-mono text-[10px] text-indigo-600 font-bold uppercase">PATH:</span>
              {selectedCountry && (
                <span className="font-semibold text-slate-800 flex items-center gap-1">
                  {selectedCountry.flag} {selectedCountry.name}
                </span>
              )}
              {selectedArea && (
                <>
                  <span className="text-slate-300">/</span>
                  <span className="font-semibold text-slate-800">{selectedArea.name}</span>
                </>
              )}
              {selectedNeighborhood && (
                <>
                  <span className="text-slate-300">/</span>
                  <span className="font-extrabold text-indigo-600">{selectedNeighborhood.name}</span>
                </>
              )}
            </div>
          )}

          {error && (
            <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 text-rose-800 text-xs mb-5 font-semibold">
              {error}
            </div>
          )}

          {/* Step 1: Country View */}
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
              >
                <p className="text-slate-500 text-sm mb-4">
                  Select your country to display available cities and localized community sectors:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                  {ONBOARDING_DATA.map((c) => (
                    <motion.div
                      key={c.id}
                      onClick={() => handleCountrySelect(c)}
                      whileHover={{ y: -3, scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={`p-5 rounded-2xl border-2 cursor-pointer transition-all duration-300 flex flex-col items-center justify-center text-center bg-white ${
                        selectedCountry?.id === c.id
                          ? 'border-indigo-600 shadow-lg'
                          : 'border-slate-100 hover:border-slate-300 shadow-sm hover:shadow-md'
                      }`}
                    >
                      <span className="text-4xl mb-3 filter drop-shadow-md select-none">{c.flag}</span>
                      <h3 className="text-xs font-extrabold text-slate-800 tracking-tight">{c.name}</h3>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 2: Area / City View */}
            {step === 2 && selectedCountry && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
              >
                <p className="text-slate-500 text-sm mb-4">
                  Select your regional metropolitan sector in <span className="font-bold text-slate-800">{selectedCountry.name}</span>:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {selectedCountry.areas.map((a) => (
                    <motion.div
                      key={a.id}
                      onClick={() => handleAreaSelect(a)}
                      whileHover={{ y: -3, scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={`p-5 rounded-2xl border-2 cursor-pointer transition-all duration-300 flex flex-col justify-between min-h-[110px] bg-white ${
                        selectedArea?.id === a.id
                          ? 'border-indigo-600 shadow-lg'
                          : 'border-slate-100 hover:border-slate-300 shadow-sm hover:shadow-md'
                      }`}
                    >
                      <div>
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100 mb-2">
                          <MapPin className="w-4 h-4" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-800 tracking-tight">{a.name}</h3>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2 font-mono">{a.neighborhoods.length} Active Neighborhoods</p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 3: Neighborhood Community View */}
            {step === 3 && selectedArea && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.2 }}
              >
                <p className="text-slate-500 text-sm mb-4">
                  Select your neighborhood. This joins you to their local community issues & reports queue:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {selectedArea.neighborhoods.map((n) => {
                    const isSelected = selectedNeighborhood?.id === n.id;
                    return (
                      <motion.div
                        key={n.id}
                        onClick={() => handleNeighborhoodSelect(n)}
                        whileHover={{ y: -3, scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        className={`group relative overflow-hidden rounded-2xl border-2 p-5 cursor-pointer transition-all duration-300 flex flex-col justify-between min-h-[170px] bg-white ${
                          isSelected
                            ? 'border-indigo-600 shadow-xl shadow-indigo-500/5'
                            : 'border-slate-100 hover:border-slate-200 hover:shadow-md'
                        }`}
                      >
                        {/* Accent glow corner */}
                        <div className={`absolute top-0 right-0 w-16 h-16 bg-gradient-to-br ${n.color} opacity-0 group-hover:opacity-5 transition-opacity duration-300 rounded-bl-full`} />

                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <div className={`w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100 transition-colors ${
                              isSelected ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'
                            }`}>
                              <span className="material-symbols-outlined text-[20px]">{n.icon}</span>
                            </div>
                            {isSelected && (
                              <span className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] shadow-sm">
                                <Check className="w-3 h-3 stroke-[3]" />
                              </span>
                            )}
                          </div>

                          <h3 className="text-sm font-bold text-slate-800 tracking-tight">{n.name}</h3>
                          <p className="text-[10px] text-slate-400 font-mono tracking-wide mt-0.5">{n.tagline}</p>
                          
                          <p className="text-[11px] text-slate-500 leading-snug mt-2.5 line-clamp-2">
                            {n.description}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer actions and navigation control */}
        <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-100 pt-6 mt-6 gap-4">
          <div>
            {step > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 transition-colors duration-200 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Go Back</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 text-slate-400 text-xs text-center sm:text-left">
                <Shield className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Join neighborhood networks anywhere to sync reporting sensors and earn multipliers.</span>
              </div>
            )}
          </div>

          <div>
            {step < 3 ? (
              <div className="text-xs text-slate-400 font-mono">
                Step {step} of 3
              </div>
            ) : (
              <button
                type="button"
                disabled={!selectedNeighborhood || loading}
                onClick={handleCompleteSetup}
                className={`w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-sm tracking-wide transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer ${
                  selectedNeighborhood && !loading
                    ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-lg shadow-indigo-500/20 hover:shadow-xl hover:scale-[1.02]'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200/40'
                }`}
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Initializing Community...</span>
                  </>
                ) : (
                  <>
                    <span>Enter Action Community</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
