import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

const LS_CHATS_KEY = "asb_chats_v1";
const LS_DARK_KEY = "asb_dark_mode";

const tools = [
  { key: "ask", label: "Ask", emoji: "💬" },
  { key: "summarize", label: "Summarize", emoji: "📖" },
  { key: "explain", label: "Explain", emoji: "🔍" },
  { key: "quiz", label: "Quiz", emoji: "📝" },
  { key: "notes", label: "Notes→Quiz", emoji: "🗒️" },
  { key: "keypoints", label: "Key Points", emoji: "📌" },
  { key: "plan", label: "Plan", emoji: "🗓️" },
  { key: "flashcards", label: "Flashcards", emoji: "🧠" },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function ChatUI() {
  // Dark mode
  const [dark, setDark] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_DARK_KEY)) ?? false; } catch { return false; }
  });
  useEffect(() => { localStorage.setItem(LS_DARK_KEY, JSON.stringify(dark)); }, [dark]);

  // API status
  const [apiOnline, setApiOnline] = useState(null);
  useEffect(() => {
    axios.get("http://localhost:5000/health").then(() => setApiOnline(true)).catch(() => setApiOnline(false));
  }, []);

  // Conversations
  const [convos, setConvos] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_CHATS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [activeId, setActiveId] = useState(() => convos[0]?.id || null);
  const active = useMemo(() => convos.find(c => c.id === activeId) || null, [convos, activeId]);

  useEffect(() => {
    localStorage.setItem(LS_CHATS_KEY, JSON.stringify(convos));
  }, [convos]);

  // Sidebar search
  const [query, setQuery] = useState("");
  const filteredConvos = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return convos;
    return convos.filter(c => (c.title || "").toLowerCase().includes(q));
  }, [convos, query]);

  function newChat() {
    const id = uid();
    const convo = { id, title: "New chat", createdAt: Date.now(), messages: [] };
    setConvos([convo, ...convos]);
    setActiveId(id);
  }

  function deleteChat(id) {
    const next = convos.filter(c => c.id !== id);
    setConvos(next);
    if (activeId === id) setActiveId(next[0]?.id || null);
  }

  function renameChat(id, title) {
    setConvos(convos.map(c => c.id === id ? { ...c, title } : c));
  }

  // Composer state
  const [tool, setTool] = useState("ask");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const chatRef = useRef(null);

  // Quick options per tool
  const [summaryLength, setSummaryLength] = useState("medium");
  const [difficulty, setDifficulty] = useState("beginner");
  const [count, setCount] = useState(10);
  const [minutesPerDay, setMinutesPerDay] = useState(60);
  const [days, setDays] = useState(7);
  const [goal, setGoal] = useState("");

  // Mobile drawer
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Desktop sidebar visibility
  const [desktopSidebarVisible, setDesktopSidebarVisible] = useState(true);

  // Auto scroll to bottom
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [active?.messages?.length]);

  function upsertActiveMessages(nextMsgs) {
    setConvos(prev => prev.map(c => c.id === activeId ? { ...c, messages: nextMsgs, title: inferTitle(nextMsgs, c.title) } : c));
  }

  function inferTitle(msgs, fallback) {
    const firstUser = msgs.find(m => m.role === 'user');
    if (!firstUser) return fallback || 'New chat';
    const text = firstUser.content.trim();
    return text.length > 32 ? text.slice(0, 32) + '…' : text || fallback || 'New chat';
  }

  async function handleSend() {
    if (!input.trim() || !activeId) return;
    const userMsg = { id: uid(), role: 'user', type: 'text', content: input, t: Date.now(), tool };
    const nextMsgs = [...(active?.messages || []), userMsg, { id: uid(), role: 'assistant', type: 'thinking', content: '…', t: Date.now(), tool }];
    upsertActiveMessages(nextMsgs);
    setBusy(true);

    try {
      let res, answer;
      switch (tool) {
        case 'ask':
          res = await axios.post('http://localhost:5000/ask', { question: input });
          answer = res.data?.answer || "";
          pushAssistant(answer, 'text');
          break;
        case 'summarize':
          res = await axios.post('http://localhost:5000/summarize', { text: input, length: summaryLength });
          answer = res.data?.summary || "";
          pushAssistant(answer, 'text');
          break;
        case 'explain':
          res = await axios.post('http://localhost:5000/explain', { concept: input, context: '' });
          answer = res.data?.explanation || "";
          pushAssistant(answer, 'text');
          break;
        case 'quiz':
          res = await axios.post('http://localhost:5000/generate-quiz', { topic: input, difficulty, questionCount: count });
          answer = res.data?.quiz || res.data || "";
          pushAssistant(answer, 'quiz');
          break;
        case 'notes':
          res = await axios.post('http://localhost:5000/notes-to-quiz', { notes: input, difficulty, questionCount: count });
          answer = res.data?.quiz || res.data || "";
          pushAssistant(answer, 'quiz');
          break;
        case 'keypoints':
          res = await axios.post('http://localhost:5000/extract-key-points', { text: input });
          answer = res.data || "";
          pushAssistant(answer, 'keypoints');
          break;
        case 'plan':
          res = await axios.post('http://localhost:5000/study-plan', { subjects: input.split(',').map(s=>s.trim()).filter(Boolean), minutesPerDay, days, goal });
          answer = res.data || "";
          pushAssistant(answer, 'plan');
          break;
        case 'flashcards':
          res = await axios.post('http://localhost:5000/generate-flashcards', { topic: input, cardCount: count });
          answer = res.data?.flashcards || res.data || "";
          pushAssistant(answer, 'flashcards');
          break;
        default:
          pushAssistant("Unsupported tool", 'text');
      }
    } catch (e) {
      pushAssistant("Something went wrong.", 'text');
    } finally {
      setBusy(false);
      setInput("");
    }
  }

  function pushAssistant(payload, type) {
    setConvos(prev => prev.map(c => {
      if (c.id !== activeId) return c;
      const msgs = [...c.messages];
      // replace the last 'thinking' with real content
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant' && msgs[i].type === 'thinking') {
          msgs[i] = { ...msgs[i], type, content: payload };
          break;
        }
      }
      return { ...c, messages: msgs };
    }));
  }

  useEffect(() => {
    if (!activeId && convos.length === 0) newChat();
    if (!activeId && convos.length > 0) setActiveId(convos[0].id);
  }, [activeId, convos.length]);

  return (
    <div className={dark ? 'dark' : ''}>
      <div className={`min-h-screen w-full grid grid-rows-[auto,1fr,auto] md:grid-rows-[1fr] ${desktopSidebarVisible ? 'md:grid-cols-[260px,1fr]' : 'md:grid-cols-[1fr]'} dark:bg-bg-dark bg-bg-light dark:text-text-primary-dark text-text-primary-light`}>
        {/* Sidebar */}
        <aside className={`${desktopSidebarVisible ? 'hidden md:flex' : 'hidden'} flex-col border-r border-border-light dark:border-border-dark p-0 bg-card-light/70 dark:bg-card-dark/50 backdrop-blur`}>
          <div className="sticky top-0 z-10 p-3 border-b border-border-light dark:border-border-dark bg-card-light/80 dark:bg-card-dark/50 backdrop-blur">
            <div className="flex items-center justify-between">
              <button onClick={newChat} className="px-3 py-2 rounded-lg bg-primary text-white shadow hover:bg-primary-hover active:scale-[0.98] transition-colors">+ New chat</button>
              <button onClick={() => setDark(!dark)} className="px-3 py-2 rounded-lg border border-border-light dark:border-border-dark text-sm hover:bg-card-light dark:hover:bg-card-dark transition-colors">{dark ? '☀️' : '🌙'}</button>
            </div>
            <div className={`text-xs mt-2 flex items-center justify-between ${apiOnline ? 'text-success' : apiOnline === false ? 'text-error' : 'text-text-secondary-light dark:text-text-secondary-dark'}`}>
              <span>{apiOnline === null ? 'Checking API…' : apiOnline ? '✓ API Online' : '✗ API Offline'}</span>
              <button onClick={() => setDesktopSidebarVisible(false)} className="hidden md:inline-flex ml-2 px-2 py-1 text-xs rounded-md border border-border-light dark:border-border-dark text-text-primary-light dark:text-text-primary-dark bg-card-light dark:bg-card-dark hover:opacity-80 transition-opacity" title="Hide sidebar" aria-label="Hide sidebar">⟨⟨</button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-1 pb-2">
            {filteredConvos.map(c => (
              <div key={c.id} className={`group flex items-center gap-2 px-2 py-2 rounded-lg ${activeId === c.id ? 'bg-secondary/20 dark:bg-secondary/30 border-l-2 border-secondary' : 'hover:bg-card-light dark:hover:bg-card-dark/60'}`}>
                <button onClick={() => setActiveId(c.id)} className="flex-1 text-left truncate text-text-primary-light dark:text-text-primary-dark" title={c.title}>
                  {c.title}
                </button>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <button
                    onClick={() => renameChat(c.id, prompt('Rename chat title', c.title) || c.title)}
                    className="px-2 py-1 rounded border border-border-light dark:border-border-dark text-xs hover:bg-card-light dark:hover:bg-card-dark transition-colors"
                    title="Rename"
                    aria-label="Rename chat"
                  >✏️</button>
                  <button
                    onClick={() => deleteChat(c.id)}
                    className="px-2 py-1 rounded border border-border-light dark:border-border-dark text-xs hover:bg-error/10 dark:hover:bg-error/20 transition-colors"
                    title="Delete"
                    aria-label="Delete chat"
                  >🗑️</button>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-border-light dark:border-border-dark">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats…"
              className="w-full px-3 py-2 rounded-lg border border-border-light dark:border-border-dark bg-card-light dark:bg-card-dark text-text-primary-light dark:text-text-primary-dark placeholder:text-text-secondary-light dark:placeholder:text-text-secondary-dark focus:outline-none focus:ring-2 focus:ring-primary"
              aria-label="Search chats"
            />
          </div>
        </aside>

        {/* Header (mobile) */}
        <header className="md:hidden flex items-center justify-between px-3 py-2 border-b border-border-light dark:border-border-dark bg-card-light/70 dark:bg-card-dark/50 backdrop-blur">
          <div className="flex items-center gap-2">
            <button onClick={() => setMobileNavOpen(true)} className="px-3 py-2 rounded-lg border border-border-light dark:border-border-dark hover:bg-card-light dark:hover:bg-card-dark transition-colors" aria-label="Open menu">☰</button>
            <button onClick={newChat} className="px-3 py-2 rounded-lg bg-primary text-white shadow hover:bg-primary-hover transition-colors">+ New</button>
            <div className={`text-sm ${apiOnline ? 'text-success' : apiOnline === false ? 'text-error' : 'text-text-secondary-light dark:text-text-secondary-dark'}`}>{apiOnline === null ? 'Checking…' : apiOnline ? '✓ Online' : '✗ Offline'}</div>
          </div>
          <button onClick={() => setDark(!dark)} className="px-3 py-2 rounded-lg border border-border-light dark:border-border-dark text-sm hover:bg-card-light dark:hover:bg-card-dark transition-colors">{dark ? '☀️' : '🌙'}</button>
        </header>

        {!desktopSidebarVisible && (
          <button onClick={() => setDesktopSidebarVisible(true)} className="hidden md:flex fixed top-3 left-3 z-50 px-2 py-1 text-xs rounded-md border border-border-light dark:border-border-dark bg-card-light/80 dark:bg-card-dark backdrop-blur hover:bg-card-light dark:hover:bg-card-dark transition-colors" title="Show sidebar" aria-label="Show sidebar">☰</button>
        )}

        {/* Chat area */}
        <main className="flex flex-col h-full">
          {/* Messages */}
          <div ref={chatRef} className="flex-1 overflow-auto px-4 md:px-8 py-4 pb-28 space-y-4">
            {!active || active.messages.length === 0 ? (
              <div className="mx-auto max-w-2xl text-center text-text-secondary-light dark:text-text-secondary-dark mt-12">
                <h1 className="text-2xl font-bold text-primary dark:text-secondary">AI Study Buddy</h1>
                <p className="mt-2">Choose a tool and start chatting, just like ChatGPT.</p>
                <div className="mt-4 flex flex-wrap gap-2 justify-center">
                  {tools.map(t => (
                    <button key={t.key} onClick={() => setTool(t.key)} className={`px-3 py-1 rounded-full text-sm border border-border-light dark:border-border-dark ${tool===t.key?'bg-primary text-white dark:bg-secondary dark:text-white':'bg-card-light dark:bg-card-dark hover:opacity-80'} transition-colors`}>{t.emoji} {t.label}</button>
                  ))}
                </div>
              </div>
            ) : (
              active.messages.map(m => (
                <div key={m.id} className={`max-w-3xl ${m.role==='assistant'?'mr-auto':'ml-auto'}`}>
                  <div className={`px-4 py-3 rounded-2xl shadow border ${m.role==='assistant'?'bg-card-light dark:bg-card-dark border-border-light dark:border-border-dark text-text-primary-light dark:text-text-primary-dark':'bg-secondary text-white border-transparent'} whitespace-pre-wrap`}>
                    {renderContent(m)}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Composer */}
          <div className="sticky bottom-0 z-10 border-t border-border-light dark:border-border-dark p-3 bg-card-light/80 dark:bg-card-dark backdrop-blur">
            <div className="mx-auto max-w-3xl">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <div className="flex flex-wrap gap-2">
                  {tools.map(t => (
                    <button key={t.key} onClick={() => setTool(t.key)} className={`px-3 py-1 rounded-full text-sm border border-border-light dark:border-border-dark ${tool===t.key?'bg-primary text-white dark:bg-secondary dark:text-white':'bg-card-light dark:bg-card-dark hover:opacity-80'} transition-colors`}>{t.emoji} {t.label}</button>
                  ))}
                </div>
              </div>

              {/* Quick options */}
              <div className="flex flex-wrap gap-2 text-xs text-text-secondary-light dark:text-text-secondary-dark mb-2">
                {tool === 'summarize' && (
                  <>
                    <span>Length:</span>
                    {['short','medium','long'].map(len => (
                      <button key={len} onClick={() => setSummaryLength(len)} className={`px-2 py-1 rounded border border-border-light dark:border-border-dark ${summaryLength===len?'bg-secondary/20 dark:bg-secondary/30 text-secondary dark:text-secondary':'bg-card-light dark:bg-card-dark hover:opacity-80'} transition-colors`}>{len}</button>
                    ))}
                  </>
                )}
                {(tool === 'quiz' || tool === 'notes' || tool === 'flashcards') && (
                  <>
                    <span>Difficulty:</span>
                    {['beginner','intermediate','advanced'].map(d => (
                      <button key={d} onClick={() => setDifficulty(d)} className={`px-2 py-1 rounded border border-border-light dark:border-border-dark ${difficulty===d?'bg-secondary/20 dark:bg-secondary/30 text-secondary dark:text-secondary':'bg-card-light dark:bg-card-dark hover:opacity-80'} transition-colors`}>{d}</button>
                    ))}
                    <span>Count:</span>
                    {[5,10,15].map(n => (
                      <button key={n} onClick={() => setCount(n)} className={`px-2 py-1 rounded border border-border-light dark:border-border-dark ${count===n?'bg-secondary/20 dark:bg-secondary/30 text-secondary dark:text-secondary':'bg-card-light dark:bg-card-dark hover:opacity-80'} transition-colors`}>{n}</button>
                    ))}
                  </>
                )}
                {tool === 'plan' && (
                  <>
                    <span>Minutes/day:</span>
                    {[30,60,90].map(n => (
                      <button key={n} onClick={() => setMinutesPerDay(n)} className={`px-2 py-1 rounded border border-border-light dark:border-border-dark ${minutesPerDay===n?'bg-secondary/20 dark:bg-secondary/30 text-secondary dark:text-secondary':'bg-card-light dark:bg-card-dark hover:opacity-80'} transition-colors`}>{n}</button>
                    ))}
                    <span>Days:</span>
                    {[3,7,14].map(n => (
                      <button key={n} onClick={() => setDays(n)} className={`px-2 py-1 rounded border border-border-light dark:border-border-dark ${days===n?'bg-secondary/20 dark:bg-secondary/30 text-secondary dark:text-secondary':'bg-card-light dark:bg-card-dark hover:opacity-80'} transition-colors`}>{n}</button>
                    ))}
                  </>
                )}
              </div>

              {tool === 'plan' && (
                <input value={goal} onChange={e => setGoal(e.target.value)} placeholder="Goal (optional)" className="w-full mb-2 px-3 py-2 rounded border border-border-light dark:border-border-dark bg-card-light dark:bg-card-dark text-text-primary-light dark:text-text-primary-dark placeholder:text-text-secondary-light dark:placeholder:text-text-secondary-dark focus:outline-none focus:ring-2 focus:ring-primary" />
              )}

              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  rows={2}
                  placeholder={placeholderFor(tool)}
                  className="flex-1 px-3 py-2 rounded-xl border border-border-light dark:border-border-dark bg-card-light dark:bg-card-dark text-text-primary-light dark:text-text-primary-dark placeholder:text-text-secondary-light dark:placeholder:text-text-secondary-dark resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button onClick={handleSend} disabled={busy || !input.trim()} className="px-4 py-2 rounded-xl bg-primary text-white shadow hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50 transition-colors">
                  {busy ? 'Sending…' : 'Send'}
                </button>
              </div>
              <div className="text-[11px] text-text-secondary-light dark:text-text-secondary-dark mt-1">Press Enter to send, Shift+Enter for new line</div>
            </div>
          </div>
        </main>
      </div>

      {/* Mobile Drawer */}
      <div className={`fixed inset-0 z-50 md:hidden ${mobileNavOpen ? '' : 'pointer-events-none'}`}>
        <div className={`absolute inset-0 bg-black/40 transition-opacity ${mobileNavOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setMobileNavOpen(false)} />
        <aside className={`absolute left-0 top-0 h-full w-72 bg-card-light/90 dark:bg-card-dark backdrop-blur border-r border-border-light dark:border-border-dark transform transition-transform ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="p-3 border-b border-border-light dark:border-border-dark flex items-center justify-between">
            <div className="font-semibold text-text-primary-light dark:text-text-primary-dark">Menu</div>
            <button onClick={() => setMobileNavOpen(false)} className="px-2 py-1 rounded border border-border-light dark:border-border-dark text-sm hover:bg-card-light dark:hover:bg-card-dark transition-colors">✕</button>
          </div>
          <div className="p-3">
            <button onClick={() => { newChat(); setMobileNavOpen(false); }} className="w-full mb-2 px-3 py-2 rounded-lg bg-primary text-white shadow hover:bg-primary-hover transition-colors">+ New chat</button>
            <div className={`text-xs mb-2 ${apiOnline ? 'text-success' : apiOnline === false ? 'text-error' : 'text-text-secondary-light dark:text-text-secondary-dark'}`}>{apiOnline === null ? 'Checking API…' : apiOnline ? '✓ API Online' : '✗ API Offline'}</div>
          </div>
          <div className="h-[calc(100%-150px)] overflow-auto p-3 space-y-1 pb-2">
            {filteredConvos.map(c => (
              <div key={c.id} className={`group flex items-center gap-2 px-2 py-2 rounded-lg ${activeId === c.id ? 'bg-secondary/20 dark:bg-secondary/30 border-l-2 border-secondary' : 'hover:bg-card-light dark:hover:bg-card-dark/60'}`}>
                <button onClick={() => { setActiveId(c.id); setMobileNavOpen(false); }} className="flex-1 text-left truncate text-text-primary-light dark:text-text-primary-dark" title={c.title}>
                  {c.title}
                </button>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <button onClick={() => renameChat(c.id, prompt('Rename chat title', c.title) || c.title)} className="px-2 py-1 rounded border border-border-light dark:border-border-dark text-xs hover:bg-card-light dark:hover:bg-card-dark transition-colors" title="Rename" aria-label="Rename chat">✏️</button>
                  <button onClick={() => deleteChat(c.id)} className="px-2 py-1 rounded border border-border-light dark:border-border-dark text-xs hover:bg-error/10 dark:hover:bg-error/20 transition-colors" title="Delete" aria-label="Delete chat">🗑️</button>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-border-light dark:border-border-dark">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats…" className="w-full px-3 py-2 rounded-lg border border-border-light dark:border-border-dark bg-card-light dark:bg-card-dark text-text-primary-light dark:text-text-primary-dark placeholder:text-text-secondary-light dark:placeholder:text-text-secondary-dark focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
        </aside>
      </div>
    </div>
  );
}

function placeholderFor(tool) {
  switch (tool) {
    case 'ask': return 'Ask anything…';
    case 'summarize': return 'Paste text to summarize…';
    case 'explain': return 'Enter a concept to explain…';
    case 'quiz': return 'Enter a topic for a quiz…';
    case 'notes': return 'Paste notes to convert into a quiz…';
    case 'keypoints': return 'Paste text to extract key points…';
    case 'plan': return 'Comma-separated subjects (e.g., Math, Science, English)…';
    case 'flashcards': return 'Enter a topic for flashcards…';
    default: return 'Type here…';
  }
}

function renderContent(m) {
  if (m.type === 'thinking') return '…';
  if (m.type === 'text') return m.content;
  if (m.type === 'quiz') {
    // m.content can be an array or raw string
    if (Array.isArray(m.content)) {
      return (
        <div className="space-y-3">
          {m.content.map((q, i) => (
            <div key={i} className="bg-primary/10 dark:bg-primary/20 border-l-4 border-primary p-3 rounded-xl text-text-primary-light dark:text-text-primary-dark">
              <div className="font-semibold mb-2">Q{i+1}. {q.question}</div>
              <ul className="list-disc ml-5 space-y-1">
                {q.options?.map((opt, j) => (<li key={j}>{opt}{j===q.correct? <span className="text-success ml-1">✓</span> : ''}</li>))}
              </ul>
              {q.explanation && (<div className="text-xs mt-2 text-text-secondary-light dark:text-text-secondary-dark">Explanation: {q.explanation}</div>)}
            </div>
          ))}
        </div>
      );
    }
    // fallback
    return typeof m.content === 'string' ? m.content : JSON.stringify(m.content, null, 2);
  }
  if (m.type === 'keypoints') {
    const d = m.content || {};
    return (
      <div className="space-y-3 text-text-primary-light dark:text-text-primary-dark">
        <div>
          <div className="font-semibold text-primary dark:text-secondary">Key Points</div>
          <ul className="list-disc ml-5 space-y-1 mt-2">
            {(d.key_points||[]).map((p,i)=>(<li key={i}>{p}</li>))}
          </ul>
        </div>
        <div>
          <div className="font-semibold text-primary dark:text-secondary">Glossary</div>
          <ul className="space-y-1 mt-2">
            {(d.glossary||[]).map((g,i)=>(<li key={i}><strong>{g.term}:</strong> {g.definition}</li>))}
          </ul>
        </div>
        <div>
          <div className="font-semibold text-primary dark:text-secondary">Practice Questions</div>
          <ol className="list-decimal ml-5 space-y-1 mt-2">
            {(d.practice_questions||[]).map((q,i)=>(<li key={i}>{q}</li>))}
          </ol>
        </div>
      </div>
    );
  }
  if (m.type === 'plan') {
    const d = m.content || {};
    if (Array.isArray(d.plan)) {
      return (
        <div className="space-y-3">
          <div className="font-semibold text-primary dark:text-secondary">Plan ({d.plan.length} days)</div>
          {d.plan.map((day, i) => (
            <div key={i} className="bg-secondary/10 dark:bg-secondary/20 border-l-4 border-secondary p-3 rounded-xl text-text-primary-light dark:text-text-primary-dark">
              <div className="font-semibold mb-1">Day {day.day} • {day.totalMinutes} min</div>
              <ul className="list-disc ml-5 space-y-1">
                {day.sessions?.map((s, j) => (<li key={j}><strong>{s.subject}:</strong> {s.activity} <span className="text-xs text-text-secondary-light dark:text-text-secondary-dark">({s.minutes}m)</span></li>))}
              </ul>
              {day.tips?.length ? <div className="text-xs mt-2 text-text-secondary-light dark:text-text-secondary-dark">Tips: {day.tips.join(', ')}</div> : null}
            </div>
          ))}
          {d.motivation && (<div className="text-sm text-warning">💡 {d.motivation}</div>)}
        </div>
      );
    }
    return typeof d === 'string' ? d : JSON.stringify(d, null, 2);
  }
  if (m.type === 'flashcards') {
    const list = m.content || [];
    if (Array.isArray(list)) {
      return (
        <div className="grid sm:grid-cols-2 gap-3">
          {list.map((c, i) => (
            <div key={i} className="bg-warning/10 dark:bg-warning/20 border-l-4 border-warning p-3 rounded-xl text-text-primary-light dark:text-text-primary-dark">
              <div className="font-semibold">{c.front}</div>
              <div className="mt-1">{c.back}</div>
              {c.hint && (<div className="text-xs mt-1 text-text-secondary-light dark:text-text-secondary-dark">Hint: {c.hint}</div>)}
            </div>
          ))}
        </div>
      );
    }
    return JSON.stringify(list, null, 2);
  }
  return typeof m.content === 'string' ? m.content : JSON.stringify(m.content, null, 2);
}

export default ChatUI;
