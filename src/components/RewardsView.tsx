import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface RewardItem {
  id: string;
  title: string;
  description: string;
  cost: number;
  image: string;
  category: 'Green' | 'Transit' | 'Local Biz' | 'Honor';
  icon: string;
}

interface RewardsViewProps {
  points: number;
  spendPoints: (amount: number) => boolean | Promise<boolean>;
}

export default function RewardsView({ points, spendPoints }: RewardsViewProps) {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeCode, setActiveCode] = useState<{ title: string; code: string } | null>(null);

  const rewards: RewardItem[] = [
    {
      id: 'rwd-1',
      title: 'Centennial Compost Seed Pack',
      description: 'Get a curated pack of native wildflower seeds to support local bee populations and add color to your block.',
      cost: 150,
      image: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400',
      category: 'Green',
      icon: 'nature_people',
    },
    {
      id: 'rwd-2',
      title: 'Free Public Transit Day Pass',
      description: 'Exchange your points for a fully paid digital day pass on all city subways and bus routes.',
      cost: 350,
      image: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=400',
      category: 'Transit',
      icon: 'directions_bus',
    },
    {
      id: 'rwd-3',
      title: 'Organic Fair-Trade Coffee Voucher',
      description: 'Enjoy a free craft drink at any participating neighborhood coffee house or local bakery.',
      cost: 200,
      image: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400',
      category: 'Local Biz',
      icon: 'local_cafe',
    },
    {
      id: 'rwd-4',
      title: 'Civic Hero Honor Emblem',
      description: 'An elegant holographic badge pinned to your community profile celebrating your dedication to the historic district.',
      cost: 500,
      image: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?w=400',
      category: 'Honor',
      icon: 'stars',
    },
  ];

  const handleRedeem = async (item: RewardItem) => {
    const success = await spendPoints(item.cost);
    if (success) {
      const generatedCode = 'MUNI-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      setSuccessMessage(`Successfully redeemed: ${item.title}!`);
      setActiveCode({
        title: item.title,
        code: generatedCode,
      });
      setTimeout(() => {
        setSuccessMessage(null);
      }, 4000);
    } else {
      alert('You need more Hero Points to redeem this reward! Complete more community tasks or verify hazard reports.');
    }
  };

  return (
    <div className="space-y-8 animate-entrance max-w-[1200px] mx-auto px-4 py-6">
      
      {/* Header and Points tracking */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-slate-100 pb-6">
        <div>
          <h1 className="font-sans text-3xl font-black text-slate-800 mb-2">Rewards Market</h1>
          <p className="font-sans text-sm text-slate-500 max-w-2xl leading-relaxed">
            Exchange your Hero Points earned from community cleanups, potholes reporting, and audits for real municipal rewards and green local perks.
          </p>
        </div>

        {/* Cohesive Points Dial widget */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-6 py-4 flex items-center gap-4 w-full md:w-auto shadow-xs">
          <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold shadow-sm">
            <span className="material-symbols-outlined">payments</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Your Balance</span>
            <p className="text-xl font-black text-slate-800 font-sans leading-none mt-0.5">
              {points} <span className="text-xs text-blue-600 font-bold">Hero Points</span>
            </p>
          </div>
        </div>
      </div>

      {/* Action Notifications */}
      <AnimatePresence>
        {successMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-teal-50 border border-teal-100 p-4 rounded-xl text-teal-700 text-xs font-bold flex items-center gap-2 shadow-md max-w-xl mx-auto"
          >
            <span className="material-symbols-outlined text-lg animate-bounce">celebration</span>
            <span>{successMessage} Claim your reward below!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Render active code badge */}
      {activeCode && (
        <div className="bg-gradient-to-br from-indigo-900 to-slate-900 border border-indigo-500/30 p-6 rounded-2xl text-white max-w-xl mx-auto shadow-lg space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl"></div>
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] uppercase font-bold text-teal-400 tracking-widest block">Active Municipal Voucher</span>
              <h3 className="text-base font-bold mt-1">{activeCode.title}</h3>
            </div>
            <button 
              onClick={() => setActiveCode(null)}
              className="text-white/40 hover:text-white transition-colors focus:outline-none"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>

          <div className="bg-white/5 border border-white/10 p-4 rounded-xl flex flex-col items-center justify-center gap-2">
            <span className="text-[10px] uppercase font-bold text-slate-400">Scan at Counter / Terminal</span>
            <span className="text-2xl font-black font-mono tracking-widest text-teal-300">{activeCode.code}</span>
            <div className="w-24 h-24 bg-white p-2 rounded-lg mt-2">
              {/* Dummy QR representation */}
              <div className="w-full h-full bg-slate-900 rounded border border-slate-200 grid grid-cols-5 gap-0.5 p-1">
                {Array.from({ length: 25 }).map((_, i) => (
                  <div 
                    key={i} 
                    className={`rounded-xs ${
                      (i * 3 + activeCode.code.charCodeAt(i % 5)) % 2 === 0 ? 'bg-white' : 'bg-slate-900'
                    }`} 
                  />
                ))}
              </div>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 text-center leading-relaxed">
            Valid for 30 days. Presented in partnership with Community Hero Municipal Transit & local merchants.
          </p>
        </div>
      )}

      {/* Grid listing */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {rewards.map((item) => {
          const isAffordable = points >= item.cost;
          return (
            <div 
              key={item.id} 
              className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              <div>
                <div className="h-40 overflow-hidden relative border-b border-slate-50 bg-slate-100">
                  <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                  <span className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-full text-[10px] font-bold text-slate-700 flex items-center gap-1 shadow-xs border border-slate-100">
                    <span className="material-symbols-outlined text-xs text-blue-600">{item.icon}</span>
                    {item.category}
                  </span>
                </div>

                <div className="p-5 space-y-2">
                  <h3 className="font-sans text-xs font-black text-slate-800 leading-snug line-clamp-1">{item.title}</h3>
                  <p className="font-sans text-[11px] text-slate-500 leading-relaxed line-clamp-3">{item.description}</p>
                </div>
              </div>

              <div className="p-5 pt-0 mt-auto">
                <button 
                  onClick={() => handleRedeem(item)}
                  className={`w-full py-2.5 rounded-full font-sans text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer focus:outline-none ${
                    isAffordable 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm' 
                      : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">payments</span>
                  <span>Redeem for {item.cost} pts</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
