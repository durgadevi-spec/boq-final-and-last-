import React, { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Bot, Loader2 } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import apiFetch from "@/lib/api";

export function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{role: 'user'|'bot', text: string}[]>([
    { role: 'bot', text: "Hi! I'm your database assistant. Ask me about material prices, availability, or products.\n\nTry:\n- 'price of MDF'\n- 'do we have hettich hinges'\n- 'list restroom products'" }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);

    try {
      const res = await apiFetch("/api/bot-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userMsg })
      });
      
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'bot', text: data.answer || "Sorry, I had an error." }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'bot', text: "Sorry, I'm having trouble connecting to the database right now." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg ${isOpen ? 'scale-0' : 'scale-100'} transition-transform duration-200 z-50`}
      >
        <MessageCircle size={28} />
      </Button>

      <div className={`fixed bottom-6 right-6 w-[350px] h-[520px] bg-white rounded-2xl shadow-2xl flex flex-col border border-slate-200 z-50 transition-all duration-300 origin-bottom-right ${isOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-primary text-primary-foreground rounded-t-2xl">
          <div className="flex items-center gap-2">
            <Bot size={24} />
            <span className="font-semibold tracking-wide">Assistant Bot</span>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-white hover:bg-white/20" onClick={() => setIsOpen(false)}>
            <X size={18} />
          </Button>
        </div>

        {/* Messages body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-white border text-slate-700 rounded-tl-sm shadow-sm'}`}>
                {m.text}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border text-slate-700 rounded-2xl rounded-tl-sm px-4 py-2 flex items-center gap-2 shadow-sm">
                <Loader2 size={14} className="animate-spin text-slate-400" />
                <span className="text-sm text-slate-500">Searching DB...</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Input area */}
        <form onSubmit={handleSubmit} className="p-3 border-t bg-white rounded-b-2xl flex gap-2">
          <Input 
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about materials or prices..."
            className="flex-1 text-sm bg-slate-50 border-slate-200 focus:bg-white transition-colors"
          />
          <Button type="submit" size="icon" disabled={!input.trim() || isLoading} className="shrink-0">
            <Send size={18} />
          </Button>
        </form>
      </div>
    </>
  );
}
