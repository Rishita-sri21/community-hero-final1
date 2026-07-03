import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../lib/api';

interface AIAssistantWidgetProps {
  userDistrict?: string;
  activeReports?: any[];
}

export default function AIAssistantWidget({ userDistrict, activeReports }: AIAssistantWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([
    { role: 'model', text: `Hello! I am your AI Civic Integrity Assistant. ${userDistrict ? `How can I help you support ${userDistrict} today?` : "Ask me anything about neighborhood reports, community action squads, or eco-index metrics!"}` }
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || loading) return;
    
    const userMessage = { role: 'user' as const, text: textToSend };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputText('');
    setLoading(true);

    try {
      const response = await api.chatWithAssistant(updatedMessages, userDistrict, activeReports);
      setMessages([...updatedMessages, { role: 'model', text: response.text }]);
    } catch (err) {
      console.error(err);
      setMessages([...updatedMessages, { role: 'model', text: "I apologize, but I'm having trouble connecting to the municipal network right now. Please try again in a moment." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSendMessage(inputText);
    }
  };

  const PRESETS = [
    { label: "🌱 Suggest a Squad", query: "Can you suggest a green community action squad idea for cleaning up local parks?" },
    { label: "🚗 Carbon Stats", query: "How is the neighborhood carbon offset calculated and who is our top hero?" },
    { label: "📸 How to Resolve", query: "How can I verify and resolve an issue to earn 1.5x points multiplier?" }
  ];

  return (
    <>
      {/* Floating Action Button (FAB) */}
      <div className="fixed bottom-6 right-6 z-[90]">
        <motion.button
          onClick={() => setIsOpen(!isOpen)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full px-5 py-3.5 shadow-xl flex items-center gap-2 cursor-pointer focus:outline-none relative overflow-hidden group border border-white/20"
        >
          {/* Glowing pulse ring */}
          <span className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></span>
          <span className="relative flex items-center justify-center">
            <span className="material-symbols-outlined text-[20px] animate-pulse">psychology</span>
          </span>
          <span className="text-xs font-bold font-sans tracking-wide">Civic AI Assistant</span>
          
          {/* Notification Indicator */}
          <span className="absolute top-0 right-0 w-3 h-3 bg-teal-400 border-2 border-blue-600 rounded-full animate-bounce"></span>
        </motion.button>
      </div>

      {/* Chat Console Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 50 }}
            className="fixed bottom-24 right-6 w-96 max-w-[calc(100vw-2rem)] h-[480px] bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col z-[100] shadow-indigo-500/10"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 p-4 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-lg animate-pulse">forum</span>
                </div>
                <div>
                  <h4 className="text-xs font-bold font-sans">Neighborhood AI</h4>
                  <p className="text-[10px] text-teal-300 font-mono flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-ping"></span>
                    Gemini 3.5 Flash Online
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer focus:outline-none"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>

            {/* Message Stream */}
            <div 
              ref={scrollRef}
              className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50/50"
            >
              {messages.map((m, idx) => (
                <div 
                  key={idx}
                  className={`flex gap-2.5 max-w-[85%] ${m.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'}`}
                >
                  <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold ${
                    m.role === 'user' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {m.role === 'user' ? 'ME' : 'AI'}
                  </div>
                  <div className={`p-3 rounded-2xl text-xs leading-relaxed ${
                    m.role === 'user' 
                      ? 'bg-blue-600 text-white rounded-tr-none shadow-sm' 
                      : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none shadow-sm'
                  }`}>
                    {m.text}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex gap-2.5 max-w-[80%] mr-auto items-center">
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                    AI
                  </div>
                  <div className="bg-white border border-slate-100 p-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-blue-600/40 rounded-full animate-bounce"></span>
                    <span className="w-2 h-2 bg-blue-600/40 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                    <span className="w-2 h-2 bg-blue-600/40 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                  </div>
                </div>
              )}
            </div>

            {/* Preset Query Shortcuts */}
            <div className="px-4 py-2 bg-white border-t border-slate-100 flex gap-2 overflow-x-auto shrink-0 scrollbar-none">
              {PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(p.query)}
                  className="shrink-0 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-[10px] font-semibold text-slate-700 rounded-full transition-all cursor-pointer focus:outline-none"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Input bar */}
            <div className="p-3 bg-white border-t border-slate-100 flex gap-2 shrink-0 items-center">
              <input 
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask our neighborhood AI..."
                className="flex-1 bg-slate-50 border border-slate-200 rounded-full px-4 py-2 text-xs font-sans focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              />
              <button
                onClick={() => handleSendMessage(inputText)}
                disabled={!inputText.trim() || loading}
                className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center hover:scale-[1.02] active:scale-95 transition-all cursor-pointer focus:outline-none disabled:opacity-40 shrink-0"
              >
                <span className="material-symbols-outlined text-sm">send</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
