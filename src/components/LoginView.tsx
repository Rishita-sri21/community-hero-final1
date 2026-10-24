import React, { useState } from 'react';
import { api } from '../lib/api';
import { Shield, Mail, Lock, User, Eye, EyeOff, Sparkles, Check, AlertTriangle, ArrowRight, Trophy, Briefcase, Globe } from 'lucide-react';

interface LoginViewProps {
  onLoginSuccess: (user: any) => void;
}

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', // Female chic
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', // Male clean
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150', // Active professional
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150', // Casual creative
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150', // Warm smile
  'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=150', // Cool glass
];

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(PRESET_AVATARS[2]);
  const [selectedRole, setSelectedRole] = useState<'Volunteer' | 'Civil Servant' | 'Organizer'>('Volunteer');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Password rules validation
  const hasMinLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  const getPasswordStrength = () => {
    if (!password) return 0;
    let score = 0;
    if (hasMinLength) score += 25;
    if (hasLetter) score += 25;
    if (hasNumber) score += 25;
    if (hasSpecial) score += 25;
    return score;
  };

  const strengthScore = getPasswordStrength();

  const handleDemoLogin = async (demoEmail: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.login(demoEmail, 'password123');
      onLoginSuccess(data.user);
    } catch (err: any) {
      setError(err.message || 'Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!email || !password) {
      setError('Please fill in all required fields.');
      setLoading(false);
      return;
    }

    if (isRegister) {
      if (!name) {
        setError('Please provide your name or citizen alias.');
        setLoading(false);
        return;
      }
      if (strengthScore < 50) {
        setError('Please choose a stronger password matching the key requirements.');
        setLoading(false);
        return;
      }
    }

    try {
      if (isRegister) {
        const data = await api.register(name, email, password, selectedAvatar, selectedRole);
        onLoginSuccess(data.user);
      } else {
        const data = await api.login(email, password);
        onLoginSuccess(data.user);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Background organic light blue glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-lg bg-white/85 backdrop-blur-xl border border-slate-200/60 rounded-2xl shadow-2xl p-8 relative z-10 transition-all duration-300">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center border border-blue-400/20 shadow-lg mb-4 hover:scale-105 transition-transform duration-300">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold font-sans tracking-tight text-slate-900 flex items-center gap-2">
            Community Hero <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200/50 px-2 py-0.5 rounded-full font-mono font-bold">Secure v2.0</span>
          </h1>
          <p className="text-slate-500 text-sm mt-1 max-w-sm">
            Empolying modern authorization roles and secure audit engines to restore neighborhood infrastructure together.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="grid grid-cols-2 bg-slate-100 p-1 rounded-xl border border-slate-200/50 mb-6">
          <button
            type="button"
            onClick={() => { setIsRegister(false); setError(''); }}
            className={`py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
              !isRegister ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setIsRegister(true); setError(''); }}
            className={`py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${
              isRegister ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Join Community
          </button>
        </div>

        {/* Error Alert Bar */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex gap-3 text-rose-800 text-sm mb-6 animate-pulse">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Active Auth Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {isRegister && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-500" /> Citizen Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sarah J."
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all placeholder:text-slate-400"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-blue-500" /> Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all placeholder:text-slate-400"
            />
          </div>

          <div className="space-y-1.5 relative">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-blue-500" /> Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl pl-4 pr-10 py-2.5 text-slate-800 text-sm outline-none transition-all placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Registration role & avatar selection & strength check */}
          {isRegister && (
            <div className="space-y-4 pt-4 border-t border-slate-100">
              
              {/* Role Authorization Selection Grid */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">
                  Select Your Authorized Civil Role:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedRole('Volunteer')}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      selectedRole === 'Volunteer'
                        ? 'bg-blue-50/50 border-blue-400 text-blue-700 ring-1 ring-blue-300'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <Trophy className="w-4 h-4 mx-auto mb-1 text-amber-500" />
                    <div className="font-bold text-[11px]">Volunteer</div>
                    <div className="text-[9px] text-slate-400 mt-0.5">Earn Points</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRole('Civil Servant')}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      selectedRole === 'Civil Servant'
                        ? 'bg-blue-50/50 border-blue-400 text-blue-700 ring-1 ring-blue-300'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <Briefcase className="w-4 h-4 mx-auto mb-1 text-blue-500" />
                    <div className="font-bold text-[11px]">Civil Servant</div>
                    <div className="text-[9px] text-slate-400 mt-0.5">Verify Work</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRole('Organizer')}
                    className={`p-2.5 rounded-xl border text-center transition-all ${
                      selectedRole === 'Organizer'
                        ? 'bg-blue-50/50 border-blue-400 text-blue-700 ring-1 ring-blue-300'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <Globe className="w-4 h-4 mx-auto mb-1 text-indigo-500" />
                    <div className="font-bold text-[11px]">Organizer</div>
                    <div className="text-[9px] text-slate-400 mt-0.5">Manage DB</div>
                  </button>
                </div>
              </div>

              {/* Password Strength Meter */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-semibold">Security Strength:</span>
                  <span className={`font-bold ${
                    strengthScore === 100 ? 'text-blue-600' : strengthScore >= 75 ? 'text-indigo-600' : strengthScore >= 50 ? 'text-amber-600' : 'text-rose-500'
                  }`}>
                    {strengthScore === 100 ? 'Unbreakable' : strengthScore >= 75 ? 'Strong' : strengthScore >= 50 ? 'Medium' : 'Weak'}
                  </span>
                </div>
                
                {/* Visual score bars */}
                <div className="grid grid-cols-4 gap-1 h-1.5">
                  <div className={`rounded-full transition-colors duration-300 ${strengthScore >= 25 ? 'bg-rose-500' : 'bg-slate-200'}`} />
                  <div className={`rounded-full transition-colors duration-300 ${strengthScore >= 50 ? 'bg-amber-500' : 'bg-slate-200'}`} />
                  <div className={`rounded-full transition-colors duration-300 ${strengthScore >= 75 ? 'bg-indigo-500' : 'bg-slate-200'}`} />
                  <div className={`rounded-full transition-colors duration-300 ${strengthScore === 100 ? 'bg-blue-600' : 'bg-slate-200'}`} />
                </div>

                {/* Secure Checklist */}
                <div className="grid grid-cols-2 gap-1.5 pt-1 text-[10px] text-slate-500 font-mono font-semibold">
                  <span className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${hasMinLength ? 'bg-blue-500' : 'bg-slate-300'}`} /> 8+ Characters
                  </span>
                  <span className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${hasLetter ? 'bg-blue-500' : 'bg-slate-300'}`} /> A-Z Letters
                  </span>
                  <span className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${hasNumber ? 'bg-blue-500' : 'bg-slate-300'}`} /> 0-9 Numbers
                  </span>
                  <span className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${hasSpecial ? 'bg-blue-500' : 'bg-slate-300'}`} /> Special Char
                  </span>
                </div>
              </div>

              {/* Avatar Selector Grid */}
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <label className="text-xs font-bold text-slate-700 block">
                  Select Citizen Avatar
                </label>
                <div className="flex gap-2 justify-between items-center">
                  {PRESET_AVATARS.map((avatarUrl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedAvatar(avatarUrl)}
                      className={`relative rounded-full overflow-hidden w-9 h-9 border-2 transition-all duration-200 shrink-0 ${
                        selectedAvatar === avatarUrl ? 'border-blue-600 scale-110 shadow-lg shadow-blue-500/10' : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <img src={avatarUrl} alt="avatar preset" className="w-full h-full object-cover" />
                      {selectedAvatar === avatarUrl && (
                        <div className="absolute inset-0 bg-blue-500/10 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-blue-600" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Action button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2 text-sm mt-6 hover:translate-y-[-1px] active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                {isRegister ? 'Register Citizen & Generate Keys' : 'Sign In and Authenticate'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Demo Fast Login Cards */}
        <div className="mt-8 border-t border-slate-200 pt-6">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-3 font-semibold">
            <span>Fast Authorization Access (Demo Keys):</span>
            <Sparkles className="w-3 h-3 text-blue-500" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleDemoLogin('sarah@example.com')}
              disabled={loading}
              className="bg-blue-50/20 hover:bg-blue-50/50 border border-slate-200 hover:border-blue-300 rounded-xl p-2.5 text-left text-xs transition-all group cursor-pointer"
            >
              <div className="font-bold text-slate-800 group-hover:text-blue-700 leading-tight">Sarah J.</div>
              <div className="text-amber-600 font-bold text-[10px] mt-0.5">Volunteer</div>
              <div className="text-slate-400 text-[9px]">480 pts</div>
            </button>
            <button
              onClick={() => handleDemoLogin('marcus@example.com')}
              disabled={loading}
              className="bg-blue-50/20 hover:bg-blue-50/50 border border-slate-200 hover:border-blue-300 rounded-xl p-2.5 text-left text-xs transition-all group cursor-pointer"
            >
              <div className="font-bold text-slate-800 group-hover:text-blue-700 leading-tight">Marcus T.</div>
              <div className="text-blue-600 font-bold text-[10px] mt-0.5">Civil Servant</div>
              <div className="text-slate-400 text-[9px]">2450 pts</div>
            </button>
            <button
              onClick={() => handleDemoLogin('elena@example.com')}
              disabled={loading}
              className="bg-blue-50/20 hover:bg-blue-50/50 border border-slate-200 hover:border-blue-300 rounded-xl p-2.5 text-left text-xs transition-all group cursor-pointer"
            >
              <div className="font-bold text-slate-800 group-hover:text-blue-700 leading-tight">Elena R.</div>
              <div className="text-indigo-600 font-bold text-[10px] mt-0.5">Organizer</div>
              <div className="text-slate-400 text-[9px]">3100 pts</div>
            </button>
          </div>
        </div>

        {/* Legal Disclaimer */}
        <p className="text-center text-[10px] text-slate-400 mt-6 leading-relaxed font-semibold">
          Authorized Municipal Handshake Portal. All login trials, credential submissions, and API transactions are audited securely. Use password <code className="bg-slate-100 border border-slate-200 text-slate-600 px-1 py-0.5 rounded font-mono">password123</code> for all default users.
        </p>
      </div>
    </div>
  );
};
