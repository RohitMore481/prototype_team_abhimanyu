import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, User, Minimize2, Maximize2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function ChatAssistant() {
    const { t, lang } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [messages, setMessages] = useState([
        { role: 'bot', content: lang === 'en' ? 'Hello! I am your Shopfloor Assistant. How can I help you today?' : 'नमस्ते! मैं आपका शॉपफ्लोर सहायक हूँ। मैं आज आपकी कैसे मदद कर सकता हूँ?' }
    ]);
    const [input, setInput] = useState('');
    const scrollRef = useRef();

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isOpen]);

    const handleSend = () => {
        if (!input.trim()) return;

        const newMessages = [...messages, { role: 'user', content: input }];
        setMessages(newMessages);
        setInput('');

        // Simulated AI Response logic
        setTimeout(() => {
            let botResponse = '';
            const text = input.toLowerCase();

            if (text.includes('task') || text.includes('कार्य')) {
                botResponse = lang === 'en'
                    ? 'You can view and accept tasks from your dashboard. High priority tasks are marked in red.'
                    : 'आप अपने डैशबोर्ड से कार्यों को देख और स्वीकार कर सकते हैं। उच्च प्राथमिकता वाले कार्यों को लाल रंग में चिह्नित किया गया है।';
            } else if (text.includes('machine') || text.includes('मशीन')) {
                botResponse = lang === 'en'
                    ? 'The machines tab shows live status of all CNC and Manual machines.'
                    : 'मशीन टैब सभी सीएनसी और मैनुअल मशीनों की लाइव स्थिति दिखाता है।';
            } else if (text.includes('hi') || text.includes('नमस्ते') || text.includes('hello')) {
                botResponse = lang === 'en' ? 'Hi there! How can I assist with the shopfloor operations?' : 'नमस्ते! मैं कार्यशाला के संचालन में कैसे सहायता कर सकता हूँ?';
            } else {
                botResponse = lang === 'en'
                    ? "I'm still learning! For specific technical issues, please contact your supervisor."
                    : "मैं अभी सीख रहा हूँ! विशिष्ट तकनीकी समस्याओं के लिए, कृपया अपने पर्यवेक्षक से संपर्क करें।";
            }

            setMessages([...newMessages, { role: 'bot', content: botResponse }]);
        }, 1000);
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-2xl flex items-center justify-center transition-all hover:scale-110 z-[100]"
            >
                <MessageSquare size={24} />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse" />
            </button>
        );
    }

    return (
        <div className={`fixed bottom-6 right-6 w-80 sm:w-96 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl z-[100] flex flex-col transition-all duration-300 ${isMinimized ? 'h-14' : 'h-[500px]'}`}>
            {/* Header */}
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/50 rounded-t-2xl">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                        <Bot size={18} />
                    </div>
                    <div>
                        <p className="text-sm font-bold dark:text-white">Shopfloor AI</p>
                        {!isMinimized && <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">Online</p>}
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={() => setIsMinimized(!isMinimized)} className="p-1.5 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md">
                        {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                    </button>
                    <button onClick={() => setIsOpen(false)} className="p-1.5 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md">
                        <X size={16} />
                    </button>
                </div>
            </div>

            {!isMinimized && (
                <>
                    {/* Messages */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-zinc-50/30 dark:bg-zinc-950/20">
                        {messages.map((m, i) => (
                            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${m.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white dark:bg-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 rounded-tl-none shadow-sm'}`}>
                                    {m.content}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Input */}
                    <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
                        <div className="flex gap-2">
                            <input
                                className="flex-1 bg-zinc-100 dark:bg-zinc-800 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 dark:text-white"
                                placeholder={lang === 'en' ? 'Ask maintenance...' : 'रखरखाव के बारे में पूछें...'}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyPress={e => e.key === 'Enter' && handleSend()}
                            />
                            <button
                                onClick={handleSend}
                                className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors"
                            >
                                <Send size={18} />
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
