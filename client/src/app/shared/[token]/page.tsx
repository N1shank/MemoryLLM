'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Brain, Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { shareApi, SharedConversation, ApiClientError } from '@/lib/api';
import { CodeBlock, InlineCode } from '@/components/CodeBlock';
import { ThemeProvider } from '@/contexts/ThemeContext';

function SharedConversationContent() {
  const params = useParams();
  const token = params.token as string;
  
  const [conversation, setConversation] = useState<SharedConversation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadConversation() {
      try {
        const data = await shareApi.getSharedConversation(token);
        setConversation(data);
      } catch (e) {
        setError(e instanceof ApiClientError ? e.message : 'Failed to load conversation');
      } finally {
        setIsLoading(false);
      }
    }

    if (token) {
      loadConversation();
    }
  }, [token]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-chat-bg">
        <Loader2 size={32} className="animate-spin text-chat-accent" />
      </div>
    );
  }

  if (error || !conversation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-chat-bg px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-red-500/20 flex items-center justify-center">
            <AlertCircle size={32} className="text-red-400" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Conversation Not Found</h1>
          <p className="text-chat-muted mb-6">
            {error || 'This conversation may have been deleted or sharing has been disabled.'}
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-chat-accent rounded-lg hover:bg-chat-accent-hover transition-colors"
          >
            Go to MemoryLLM
            <ExternalLink size={16} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-chat-bg">
      {/* Header */}
      <header className="border-b border-chat-border bg-chat-bg/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-chat-accent to-emerald-600 flex items-center justify-center glow-accent">
              <Brain size={20} className="text-white" />
            </div>
            <div>
              <h1 className="font-semibold">{conversation.title}</h1>
              <p className="text-xs text-chat-muted">
                Shared conversation • {new Date(conversation.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          
          <Link
            href="/"
            className="px-4 py-2 bg-chat-accent rounded-lg hover:bg-chat-accent-hover transition-colors text-sm font-medium flex items-center gap-2"
          >
            Try MemoryLLM
            <ExternalLink size={14} />
          </Link>
        </div>
      </header>

      {/* Messages */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        {conversation.messages.map((message) => (
          <div
            key={message.id}
            className={`mb-6 ${message.role === 'user' ? 'flex justify-end' : ''}`}
          >
            {message.role === 'user' ? (
              <div className="max-w-[85%] px-4 py-3 rounded-2xl bg-chat-accent/20 border border-chat-accent/30">
                {message.content}
              </div>
            ) : (
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-chat-accent to-emerald-600 flex items-center justify-center shrink-0 glow-accent">
                  <Brain size={14} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  {message.memory_context && (
                    <div className="mb-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-chat-accent/10 border border-chat-accent/20 text-xs text-chat-accent">
                      <Brain size={12} />
                      {message.memory_context}
                    </div>
                  )}
                  <div className="markdown-content">
                    <ReactMarkdown
                      components={{
                        code({ className, children, ...props }) {
                          const match = /language-(\w+)/.exec(className || '');
                          const isInline = !match && !className;
                          
                          if (isInline) {
                            return <InlineCode>{children}</InlineCode>;
                          }
                          
                          return (
                            <CodeBlock language={match?.[1]}>
                              {String(children).replace(/\n$/, '')}
                            </CodeBlock>
                          );
                        },
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </main>

      {/* Footer */}
      <footer className="border-t border-chat-border py-6 text-center">
        <p className="text-chat-muted text-sm mb-3">
          This conversation was shared from MemoryLLM
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-chat-accent hover:underline"
        >
          <Brain size={16} />
          Start your own conversation
        </Link>
      </footer>
    </div>
  );
}

export default function SharedPage() {
  return (
    <ThemeProvider>
      <SharedConversationContent />
    </ThemeProvider>
  );
}

