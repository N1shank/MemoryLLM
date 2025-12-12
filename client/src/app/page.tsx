'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Send, Plus, Sparkles, Brain, Menu, X, LogOut, 
  Trash2, Pencil, Check, MoreHorizontal, AlertCircle,
  Loader2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAuth } from '@/contexts/AuthContext';
import { 
  conversationsApi, 
  chatApi, 
  Conversation, 
  Message,
  ApiClientError,
} from '@/lib/api';

interface LocalMessage {
  id: number | string;
  role: 'user' | 'assistant';
  content: string;
  memory_context: string | null;
  isStreaming?: boolean;
}

export default function Home() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingConversations, setIsFetchingConversations] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Edit/delete state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
    }
  }, [authLoading, isAuthenticated, router]);

  // Fetch conversations on mount
  useEffect(() => {
    if (isAuthenticated) {
      fetchConversations();
    }
  }, [isAuthenticated]);

  // Close mobile menu when selecting a conversation
  useEffect(() => {
    if (currentConversationId && mobileMenuOpen) {
      setMobileMenuOpen(false);
    }
  }, [currentConversationId]);

  const fetchConversations = async () => {
    try {
      const convs = await conversationsApi.list();
      setConversations(convs);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        logout();
        router.push('/auth/login');
      } else {
        setError('Failed to load conversations');
      }
    } finally {
      setIsFetchingConversations(false);
    }
  };

  const loadConversation = async (id: number) => {
    setCurrentConversationId(id);
    setError(null);
    
    try {
      const conv = await conversationsApi.get(id);
      setMessages(conv.messages.map(m => ({
        ...m,
        isStreaming: false,
      })));
    } catch (e) {
      if (e instanceof ApiClientError) {
        if (e.status === 401) {
          logout();
          router.push('/auth/login');
        } else if (e.status === 404) {
          setError('Conversation not found');
          fetchConversations();
        } else {
          setError(e.message);
        }
      }
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const createNewConversation = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setInput('');
    setError(null);
    setMobileMenuOpen(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    setError(null);

    const userMessage: LocalMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      memory_context: null,
    };

    const assistantMessage: LocalMessage = {
      id: `temp-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      memory_context: null,
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInput('');
    setIsLoading(true);

    try {
      let newConversationId = currentConversationId;
      
      // Use streaming endpoint
      for await (const event of chatApi.sendStream(userMessage.content, currentConversationId || undefined)) {
        if (event.type === 'chunk') {
          setMessages(prev => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg.role === 'assistant') {
              lastMsg.content += event.content || '';
            }
            return updated;
          });
        } else if (event.type === 'done') {
          newConversationId = event.conversation_id || null;
          
          setMessages(prev => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg.role === 'assistant') {
              lastMsg.id = event.message_id || lastMsg.id;
              lastMsg.memory_context = event.memory_context || null;
              lastMsg.isStreaming = false;
            }
            return updated;
          });
        } else if (event.type === 'error') {
          throw new Error(event.message || 'Streaming error');
        }
      }

      // Update conversation in list
      if (newConversationId && newConversationId !== currentConversationId) {
        setCurrentConversationId(newConversationId);
        fetchConversations();
      }
    } catch (e) {
      const errorMessage = e instanceof ApiClientError 
        ? e.message 
        : e instanceof Error 
          ? e.message 
          : 'Failed to send message';
      
      if (e instanceof ApiClientError && e.status === 401) {
        logout();
        router.push('/auth/login');
        return;
      }
      
      setError(errorMessage);
      
      // Update the streaming message with error
      setMessages(prev => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg.role === 'assistant' && lastMsg.isStreaming) {
          lastMsg.content = 'Sorry, I encountered an error. Please try again.';
          lastMsg.isStreaming = false;
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleRename = async (id: number) => {
    if (!editTitle.trim()) return;
    
    try {
      await conversationsApi.update(id, editTitle.trim());
      setConversations(prev => 
        prev.map(c => c.id === id ? { ...c, title: editTitle.trim() } : c)
      );
      setEditingId(null);
      setEditTitle('');
    } catch (e) {
      setError('Failed to rename conversation');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await conversationsApi.delete(id);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (currentConversationId === id) {
        setCurrentConversationId(null);
        setMessages([]);
      }
      setMenuOpenId(null);
    } catch (e) {
      setError('Failed to delete conversation');
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/auth/login');
  };

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-chat-bg">
        <Loader2 size={32} className="animate-spin text-chat-accent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen bg-chat-bg">
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:relative inset-y-0 left-0 z-50
          w-72 bg-chat-sidebar flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${sidebarOpen ? 'lg:w-72' : 'lg:w-0 lg:overflow-hidden'}
        `}
      >
        <div className="p-3 border-b border-chat-border">
          <button
            onClick={createNewConversation}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-chat-border hover:bg-chat-hover transition-all duration-200 group"
          >
            <Plus size={18} className="group-hover:rotate-90 transition-transform duration-200" />
            <span className="font-medium">New chat</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {isFetchingConversations ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-gray-500" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-center text-gray-500 text-sm py-8">No conversations yet</p>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                className={`group relative mb-1 rounded-lg transition-colors ${
                  conv.id === currentConversationId
                    ? 'bg-chat-hover'
                    : 'hover:bg-chat-hover/50'
                }`}
              >
                {editingId === conv.id ? (
                  <div className="flex items-center gap-2 p-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleRename(conv.id)}
                      className="flex-1 bg-chat-input px-2 py-1 rounded text-sm focus:outline-none focus:ring-1 focus:ring-chat-accent"
                      autoFocus
                    />
                    <button
                      onClick={() => handleRename(conv.id)}
                      className="p-1 hover:bg-chat-accent/20 rounded"
                    >
                      <Check size={16} className="text-chat-accent" />
                    </button>
                    <button
                      onClick={() => { setEditingId(null); setEditTitle(''); }}
                      className="p-1 hover:bg-red-500/20 rounded"
                    >
                      <X size={16} className="text-red-400" />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => loadConversation(conv.id)}
                      className="w-full text-left px-3 py-2.5 pr-10 truncate text-sm"
                    >
                      {conv.title}
                    </button>
                    
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === conv.id ? null : conv.id);
                        }}
                        className="p-1.5 hover:bg-chat-border rounded"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                      
                      {menuOpenId === conv.id && (
                        <div className="absolute right-0 top-full mt-1 bg-chat-sidebar border border-chat-border rounded-lg shadow-xl py-1 min-w-[120px] z-10">
                          <button
                            onClick={() => {
                              setEditingId(conv.id);
                              setEditTitle(conv.title);
                              setMenuOpenId(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-chat-hover text-sm"
                          >
                            <Pencil size={14} />
                            Rename
                          </button>
                          <button
                            onClick={() => handleDelete(conv.id)}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-500/10 text-red-400 text-sm"
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <div className="p-3 border-t border-chat-border space-y-2">
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400">
            <Brain size={16} className="text-chat-accent animate-pulse-soft" />
            <span>Notion Memory Active</span>
          </div>
          
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-chat-accent/20 flex items-center justify-center">
                <span className="text-sm font-medium text-chat-accent">
                  {user?.name?.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="text-sm truncate max-w-[120px]">{user?.name}</span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-chat-hover rounded-lg transition-colors"
              title="Sign out"
            >
              <LogOut size={18} className="text-gray-400" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-chat-border bg-chat-bg/80 backdrop-blur-sm">
          <button
            onClick={() => {
              if (window.innerWidth < 1024) {
                setMobileMenuOpen(!mobileMenuOpen);
              } else {
                setSidebarOpen(!sidebarOpen);
              }
            }}
            className="p-2 hover:bg-chat-hover rounded-lg transition-colors"
          >
            {mobileMenuOpen || sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-chat-accent to-purple-600 flex items-center justify-center glow-accent">
              <Sparkles size={16} className="text-white" />
            </div>
            <span className="font-semibold">MemoryLLM</span>
          </div>
        </header>

        {/* Error banner */}
        {error && (
          <div className="px-4 py-3 bg-red-500/10 border-b border-red-500/20 flex items-center gap-3">
            <AlertCircle size={18} className="text-red-400 shrink-0" />
            <p className="text-red-400 text-sm flex-1">{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-300"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center px-4">
              <div className="max-w-lg text-center">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-chat-accent to-purple-600 flex items-center justify-center glow-accent">
                  <Sparkles size={36} className="text-white" />
                </div>
                <h1 className="text-3xl font-bold mb-3">MemoryLLM</h1>
                <p className="text-gray-400 mb-8 text-lg">
                  I'm an AI assistant with Notion as my memory. I can remember our conversations
                  and help you manage your knowledge.
                </p>
                <div className="grid gap-3 text-left">
                  {[
                    'Remember your preferences and context',
                    'Store important information in Notion',
                    'Recall past conversations and notes',
                  ].map((feature, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-chat-sidebar border border-chat-border hover:border-chat-accent/30 transition-colors"
                    >
                      <Brain size={18} className="text-chat-accent shrink-0" />
                      <span className="text-sm text-gray-300">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6">
              {messages.map(message => (
                <div
                  key={message.id}
                  className={`mb-6 animate-fade-in ${message.role === 'user' ? 'flex justify-end' : ''}`}
                >
                  {message.role === 'user' ? (
                    <div className="max-w-[85%] px-4 py-3 rounded-2xl bg-chat-accent/20 border border-chat-accent/30">
                      {message.content}
                    </div>
                  ) : (
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-chat-accent to-purple-600 flex items-center justify-center shrink-0 glow-accent">
                        <Sparkles size={14} className="text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        {message.memory_context && (
                          <div className="mb-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-chat-accent/10 border border-chat-accent/20 text-xs text-chat-accent">
                            <Brain size={12} />
                            {message.memory_context}
                          </div>
                        )}
                        <div className="markdown-content">
                          {message.isStreaming && !message.content ? (
                            <span className="typing-cursor text-gray-400">Thinking</span>
                          ) : (
                            <ReactMarkdown>{message.content}</ReactMarkdown>
                          )}
                          {message.isStreaming && message.content && (
                            <span className="typing-cursor" />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="px-4 pb-6 pt-2">
          <div className="max-w-3xl mx-auto">
            <div className="relative flex items-end bg-chat-input rounded-2xl border border-chat-border focus-within:border-chat-accent/50 focus-within:ring-1 focus-within:ring-chat-accent/20 transition-all">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message MemoryLLM..."
                rows={1}
                disabled={isLoading}
                className="flex-1 bg-transparent px-4 py-4 resize-none focus:outline-none max-h-[200px] disabled:opacity-50"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                className="p-2.5 m-2 rounded-xl bg-chat-accent disabled:opacity-40 disabled:cursor-not-allowed hover:bg-chat-accent-hover transition-all duration-200 hover:scale-105 active:scale-95"
              >
                {isLoading ? (
                  <Loader2 size={18} className="text-white animate-spin" />
                ) : (
                  <Send size={18} className="text-white" />
                )}
              </button>
            </div>
            <p className="text-center text-xs text-gray-500 mt-3">
              MemoryLLM uses Notion as persistent memory. Your data stays in your Notion workspace.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
