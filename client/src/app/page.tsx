'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Plus, Sparkles, Brain, Menu, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
}

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentConversation = conversations.find(c => c.id === currentConversationId);
  const messages = currentConversation?.messages || [];

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
    const newConv: Conversation = {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: [],
    };
    setConversations(prev => [newConv, ...prev]);
    setCurrentConversationId(newConv.id);
    setInput('');
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    let convId = currentConversationId;
    
    // Create new conversation if none exists
    if (!convId) {
      const newConv: Conversation = {
        id: Date.now().toString(),
        title: input.slice(0, 30) + (input.length > 30 ? '...' : ''),
        messages: [],
      };
      setConversations(prev => [newConv, ...prev]);
      convId = newConv.id;
      setCurrentConversationId(convId);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };

    // Update conversation with user message
    setConversations(prev =>
      prev.map(conv =>
        conv.id === convId
          ? {
              ...conv,
              title: conv.messages.length === 0 
                ? input.slice(0, 30) + (input.length > 30 ? '...' : '')
                : conv.title,
              messages: [...conv.messages, userMessage],
            }
          : conv
      )
    );

    setInput('');
    setIsLoading(true);

    try {
      const conversationHistory = conversations
        .find(c => c.id === convId)
        ?.messages.map(m => ({ role: m.role, content: m.content })) || [];

      const response = await fetch('http://localhost:8000/api/v1/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          conversation_history: conversationHistory,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message,
      };

      setConversations(prev =>
        prev.map(conv =>
          conv.id === convId
            ? { ...conv, messages: [...conv.messages, assistantMessage] }
            : conv
        )
      );
    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please make sure the backend is running.',
      };
      setConversations(prev =>
        prev.map(conv =>
          conv.id === convId
            ? { ...conv, messages: [...conv.messages, errorMessage] }
            : conv
        )
      );
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

  return (
    <div className="flex h-screen bg-chat-bg">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-0'
        } bg-chat-sidebar flex flex-col transition-all duration-300 overflow-hidden`}
      >
        <div className="p-3">
          <button
            onClick={createNewConversation}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-chat-border hover:bg-chat-hover transition-colors"
          >
            <Plus size={18} />
            <span>New chat</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3">
          {conversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => setCurrentConversationId(conv.id)}
              className={`w-full text-left px-3 py-2 rounded-lg mb-1 truncate transition-colors ${
                conv.id === currentConversationId
                  ? 'bg-chat-hover'
                  : 'hover:bg-chat-hover/50'
              }`}
            >
              {conv.title}
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-chat-border">
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-400">
            <Brain size={16} className="text-chat-accent" />
            <span>Notion Memory Active</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-chat-border">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-chat-hover rounded-lg transition-colors"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-chat-accent" />
            <span className="font-medium">MemoryLLM</span>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center px-4">
              <div className="max-w-md text-center">
                <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-chat-accent to-emerald-600 flex items-center justify-center">
                  <Sparkles size={32} className="text-white" />
                </div>
                <h1 className="text-2xl font-semibold mb-2">MemoryLLM</h1>
                <p className="text-gray-400 mb-8">
                  I'm an AI assistant with Notion as my memory. I can remember our conversations
                  and help you manage your knowledge.
                </p>
                <div className="grid gap-3 text-left">
                  {[
                    'Remember my preferences and context',
                    'Store important information in Notion',
                    'Recall past conversations and notes',
                  ].map((feature, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg bg-chat-sidebar border border-chat-border"
                    >
                      <Brain size={18} className="text-chat-accent shrink-0" />
                      <span className="text-sm">{feature}</span>
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
                  className={`mb-6 ${message.role === 'user' ? 'flex justify-end' : ''}`}
                >
                  {message.role === 'user' ? (
                    <div className="max-w-[85%] px-4 py-3 rounded-2xl bg-chat-input">
                      {message.content}
                    </div>
                  ) : (
                    <div className="flex gap-4">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-chat-accent to-emerald-600 flex items-center justify-center shrink-0">
                        <Sparkles size={16} className="text-white" />
                      </div>
                      <div className="markdown-content flex-1 min-w-0">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-4 mb-6">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-chat-accent to-emerald-600 flex items-center justify-center shrink-0">
                    <Sparkles size={16} className="text-white" />
                  </div>
                  <div className="typing-cursor text-gray-400">Thinking</div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="px-4 pb-6 pt-2">
          <div className="max-w-3xl mx-auto">
            <div className="relative flex items-end bg-chat-input rounded-2xl border border-chat-border focus-within:border-chat-accent/50 transition-colors">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message MemoryLLM..."
                rows={1}
                className="flex-1 bg-transparent px-4 py-4 resize-none focus:outline-none max-h-[200px]"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                className="p-2 m-2 rounded-lg bg-chat-accent disabled:opacity-40 disabled:cursor-not-allowed hover:bg-chat-accent/80 transition-colors"
              >
                <Send size={18} className="text-white" />
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

