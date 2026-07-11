import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Sparkles, RotateCcw, Copy, Check, Plus, MessageSquare, Trash2, ChevronLeft, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SsasScheme, ChatSession, ChatMessageRecord } from '../types';
import { fmtFull, fmt } from '../lib/format';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

interface Props {
  scheme: SsasScheme;
  scenarioContext?: string;
}

const SUGGESTED_QUESTIONS = [
  'What is my current loanback headroom?',
  'Can I take out more borrowing without breaching HMRC limits?',
  'What are the rules around loanbacks in a SSAS?',
  'How does a property purchase affect my HMRC limits?',
  'What are my options if I want to increase cash in the scheme?',
  'Explain the 50% borrowing limit for SSAS schemes',
];

function buildSchemeContext(scheme: SsasScheme): string {
  const nav = Number(scheme.net_asset_value);
  const cash = Number(scheme.cash_balance);
  return [
    `Scheme name: ${scheme.name}`,
    `Snapshot date: ${scheme.snapshot_date}`,
    `Net Asset Value (NAV): ${fmtFull(nav)}`,
    `Cash balance: ${fmtFull(cash)}`,
    `HMRC loanback limit (50% NAV): ${fmtFull(nav * 0.5)}`,
    `HMRC borrowing limit (50% NAV): ${fmtFull(nav * 0.5)}`,
    `HMRC employer investment limit (20% NAV): ${fmtFull(nav * 0.2)}`,
    `Cash as % of NAV: ${nav > 0 ? ((cash / nav) * 100).toFixed(1) : '0'}%`,
  ].join('\n');
}

function deriveTitle(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 40 ? trimmed.slice(0, 40) + '…' : trimmed;
}

export default function AskClaude({ scheme, scenarioContext }: Props) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(true);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* ---- Load session list ---- */
  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    const { data } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('scheme_id', scheme.id)
      .order('updated_at', { ascending: false });
    setSessions(data ?? []);
    setLoadingSessions(false);
  }, [scheme.id]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  /* ---- Load messages for a session ---- */
  const loadMessages = useCallback(async (sessionId: string) => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    if (data) {
      setMessages(data.map((m: ChatMessageRecord) => ({
        id: m.id,
        role: m.role,
        content: m.content,
      })));
    }
  }, []);

  /* ---- Select a session ---- */
  async function selectSession(sessionId: string) {
    if (loading) return;
    setActiveSessionId(sessionId);
    setShowSidebar(false);
    await loadMessages(sessionId);
    inputRef.current?.focus();
  }

  /* ---- Start a new chat ---- */
  function newChat() {
    if (loading) return;
    setActiveSessionId(null);
    setMessages([]);
    setShowSidebar(false);
    inputRef.current?.focus();
  }

  /* ---- Delete a session ---- */
  async function deleteSession(sessionId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (loading) return;
    await supabase.from('chat_messages').delete().eq('session_id', sessionId);
    await supabase.from('chat_sessions').delete().eq('id', sessionId);
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      setMessages([]);
    }
    loadSessions();
  }

  /* ---- Send a message ---- */
  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    let sessionId = activeSessionId;
    let sessionTitle = 'New chat';

    /* Create a new session if needed */
    if (!sessionId) {
      sessionTitle = deriveTitle(trimmed);
      const { data: newSession } = await supabase
        .from('chat_sessions')
        .insert({
          scheme_id: scheme.id,
          title: sessionTitle,
          scenario_context: scenarioContext ?? null,
        })
        .select()
        .single();
      if (!newSession) return;
      sessionId = newSession.id;
      setActiveSessionId(sessionId);
      setSessions(prev => [newSession, ...prev]);
    }

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: trimmed };
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', streaming: true };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setLoading(true);

    /* Persist user message */
    supabase.from('chat_messages').insert({
      session_id: sessionId,
      role: 'user',
      content: trimmed,
    }).then(({ data: inserted }) => {
      if (inserted && inserted.length > 0) {
        setMessages(prev => prev.map(m =>
          m.id === userMsg.id ? { ...m, id: inserted[0].id } : m
        ));
      }
    });

    /* Touch updated_at on session */
    supabase.from('chat_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .then(() => loadSessions());

    const historyForApi = [...messages, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

    try {
      abortRef.current = new AbortController();

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-claude`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            messages: historyForApi,
            schemeContext: buildSchemeContext(scheme) + (scenarioContext ? `\n\nACTIVE SCENARIO CONTEXT:\n${scenarioContext}` : ''),
          }),
          signal: abortRef.current.signal,
        }
      );

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        let msg = `HTTP ${res.status}`;
        try { msg = JSON.parse(body)?.error ?? msg; } catch { /* keep default */ }
        throw new Error(msg);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              fullText += parsed.text;
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, content: fullText } : m
              ));
            }
          } catch {
            // skip malformed
          }
        }
      }

      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, streaming: false } : m
      ));

      /* Persist assistant message */
      supabase.from('chat_messages').insert({
        session_id: sessionId,
        role: 'assistant',
        content: fullText,
      }).then(({ data: inserted }) => {
        if (inserted && inserted.length > 0) {
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, id: inserted[0].id } : m
          ));
        }
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: m.content || '*(Stopped)*', streaming: false } : m
        ));
        /* Persist partial assistant response */
        const partial = messages.find(m => m.id === assistantId)?.content;
        if (partial) {
          supabase.from('chat_messages').insert({
            session_id: sessionId,
            role: 'assistant',
            content: partial || '*(Stopped)*',
          });
        }
      } else {
        const msg = err instanceof Error ? err.message : 'An error occurred';
        const errorContent = `Sorry, I encountered an error: ${msg}`;
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, content: errorContent, streaming: false }
            : m
        ));
        supabase.from('chat_messages').insert({
          session_id: sessionId,
          role: 'assistant',
          content: errorContent,
        });
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  async function copyMessage(id: string, content: string) {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const isEmpty = messages.length === 0;
  const activeSession = sessions.find(s => s.id === activeSessionId);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSidebar(s => !s)}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
            title="Toggle chat history"
          >
            <MessageSquare size={18} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Sparkles size={18} className="text-red-600" />
              Ask Claude
            </h1>
            <p className="text-xs text-gray-500">
              {activeSession ? activeSession.title : 'New chat'} — {scheme.name}
            </p>
          </div>
        </div>
        <button
          onClick={newChat}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40"
        >
          <Plus size={13} /> New chat
        </button>
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        {/* Sidebar — session list */}
        {showSidebar && (
          <div className="w-64 shrink-0 bg-gray-50 rounded-xl border border-gray-100 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Chat History</span>
              <button onClick={() => setShowSidebar(false)} className="p-1 rounded hover:bg-gray-200 text-gray-400">
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {loadingSessions ? (
                <div className="text-xs text-gray-400 text-center py-4">Loading…</div>
              ) : sessions.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-4">No saved chats yet.</div>
              ) : (
                sessions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => selectSession(s.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors group flex items-start gap-2 ${
                      s.id === activeSessionId
                        ? 'bg-red-50 text-red-900 border border-red-100'
                        : 'hover:bg-gray-100 text-gray-700 border border-transparent'
                    }`}
                  >
                    <MessageSquare size={12} className="mt-0.5 shrink-0 opacity-50" />
                    <span className="flex-1 truncate">{s.title}</span>
                    <span
                      onClick={(e) => deleteSession(s.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-red-500 shrink-0"
                    >
                      <Trash2 size={11} />
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto min-h-0 space-y-1 pr-1">
            {isEmpty ? (
              <div className="h-full flex flex-col items-center justify-center gap-6 pb-8">
                <div className="text-center max-w-md">
                  <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-4">
                    <Sparkles size={24} className="text-red-600" />
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-1">SSAS Adviser</h2>
                  <p className="text-sm text-gray-500">
                    Ask questions about HMRC limits, scenario planning, compliance, or anything else about your scheme.
                  </p>
                </div>
                <div className="w-full max-w-xl grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SUGGESTED_QUESTIONS.map(q => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="text-left px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-700 hover:border-red-300 hover:bg-red-50 hover:text-red-800 transition-all shadow-sm"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-6 py-2">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    {/* Avatar */}
                    <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5 ${
                      msg.role === 'user'
                        ? 'bg-gray-800 text-white'
                        : 'bg-red-600 text-white'
                    }`}>
                      {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                    </div>

                    {/* Bubble */}
                    <div className={`group relative max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                      <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === 'user'
                          ? 'bg-gray-900 text-white rounded-tr-sm'
                          : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
                      }`}>
                        {msg.content}
                        {msg.streaming && (
                          <span className="inline-flex gap-0.5 ml-1 align-middle">
                            <span className="w-1 h-1 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1 h-1 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1 h-1 rounded-full bg-red-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                          </span>
                        )}
                      </div>
                      {/* Copy button — visible on hover for assistant messages */}
                      {msg.role === 'assistant' && !msg.streaming && (
                        <button
                          onClick={() => copyMessage(msg.id, msg.content)}
                          className="absolute -bottom-5 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600"
                        >
                          {copiedId === msg.id
                            ? <><Check size={10} className="text-emerald-500" /> Copied</>
                            : <><Copy size={10} /> Copy</>
                          }
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="shrink-0 mt-4 pt-4 border-t border-gray-100">
            <div className="relative bg-white rounded-2xl border border-gray-200 shadow-sm focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-100 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your SSAS — HMRC limits, scenarios, compliance…"
                rows={1}
                disabled={loading && !messages.some(m => m.streaming)}
                className="w-full resize-none bg-transparent px-4 py-3.5 pr-14 text-sm text-gray-800 placeholder-gray-400 focus:outline-none rounded-2xl"
                style={{ minHeight: '52px', maxHeight: '160px', overflowY: 'auto' }}
                onInput={e => {
                  const t = e.currentTarget;
                  t.style.height = 'auto';
                  t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
                }}
              />
              <div className="absolute right-2.5 bottom-2.5">
                {loading ? (
                  <button
                    onClick={stopStreaming}
                    className="w-9 h-9 rounded-xl bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors"
                    title="Stop"
                  >
                    <span className="w-3 h-3 rounded-sm bg-gray-600" />
                  </button>
                ) : (
                  <button
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim()}
                    className="w-9 h-9 rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                    title="Send (Enter)"
                  >
                    <Send size={15} />
                  </button>
                )}
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5 text-center">
              Press Enter to send, Shift+Enter for new line. Responses are for planning guidance only — not regulated advice.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
