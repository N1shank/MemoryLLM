'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, Brain, Search, ExternalLink, Loader2, 
  AlertCircle, RefreshCw, FileText, Database, Calendar
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { notionApi, ApiClientError } from '@/lib/api';

export default function MemoryManagerPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
    }
  }, [authLoading, isAuthenticated, router]);

  const loadMemories = async () => {
    if (!user?.notion_api_key_configured) {
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      const data = await notionApi.search();
      setResults(data.results || []);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Failed to load memories from Notion');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.notion_api_key_configured) {
      loadMemories();
    } else {
      setIsLoading(false);
    }
  }, [user?.notion_api_key_configured]);

  const filteredResults = results.filter(item => {
    if (!searchQuery) return true;
    
    let title = 'Untitled';
    if (item.object === 'page') {
      const titleProp = Object.values(item.properties).find((p: any) => p.type === 'title') as any;
      if (titleProp && titleProp.title && titleProp.title.length > 0) {
        title = titleProp.title.map((t: any) => t.plain_text).join('');
      }
    } else if (item.object === 'database' && item.title && item.title.length > 0) {
      title = item.title.map((t: any) => t.plain_text).join('');
    }
    
    return title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const getTitle = (item: any) => {
    if (item.object === 'page') {
      const titleProp = Object.values(item.properties).find((p: any) => p.type === 'title') as any;
      if (titleProp && titleProp.title && titleProp.title.length > 0) {
        return titleProp.title.map((t: any) => t.plain_text).join('');
      }
    } else if (item.object === 'database' && item.title && item.title.length > 0) {
      return item.title.map((t: any) => t.plain_text).join('');
    }
    return 'Untitled';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-chat-bg">
        <Loader2 size={32} className="animate-spin text-chat-accent" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-chat-bg">
      <header className="border-b border-chat-border sticky top-0 bg-chat-bg/80 backdrop-blur z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 hover:bg-chat-hover rounded-lg transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Brain size={24} className="text-chat-accent" />
              Memory Manager
            </h1>
          </div>
          {user?.notion_api_key_configured && (
            <button 
              onClick={loadMemories}
              disabled={isLoading}
              className="p-2 text-chat-muted hover:text-foreground rounded-lg hover:bg-chat-hover transition-colors"
              title="Refresh memories"
            >
              <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {!user?.notion_api_key_configured ? (
          <div className="bg-chat-sidebar rounded-xl border border-chat-border p-8 text-center max-w-lg mx-auto mt-10">
            <div className="w-16 h-16 bg-chat-hover rounded-full flex items-center justify-center mx-auto mb-4">
              <Brain size={32} className="text-chat-muted" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Notion Memory Not Connected</h2>
            <p className="text-chat-muted mb-6">
              Connect your Notion workspace in Settings to enable the AI to remember facts and preferences.
            </p>
            <Link 
              href="/settings"
              className="px-6 py-2.5 rounded-lg bg-chat-accent hover:bg-chat-accent-hover font-medium transition-colors inline-block text-white"
            >
              Go to Settings
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-chat-muted" />
                <input
                  type="text"
                  placeholder="Search your memories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-chat-input border border-chat-border focus:border-chat-accent focus:outline-none transition-colors"
                />
              </div>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
                <AlertCircle size={20} className="text-red-400 shrink-0" />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-chat-muted gap-4">
                <Loader2 size={32} className="animate-spin text-chat-accent" />
                <p>Retrieving memories from Notion...</p>
              </div>
            ) : filteredResults.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {filteredResults.map((item) => (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex flex-col p-5 rounded-xl bg-chat-sidebar border border-chat-border hover:border-chat-accent hover:shadow-lg hover:shadow-chat-accent/5 transition-all duration-300"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {item.object === 'database' ? (
                          <Database size={18} className="text-indigo-400" />
                        ) : (
                          <FileText size={18} className="text-emerald-400" />
                        )}
                        <h3 className="font-medium truncate max-w-[200px] group-hover:text-chat-accent transition-colors">
                          {getTitle(item)}
                        </h3>
                      </div>
                      <ExternalLink size={16} className="text-chat-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    
                    <div className="mt-auto pt-4 border-t border-chat-border flex items-center justify-between text-xs text-chat-muted">
                      <div className="flex items-center gap-1.5">
                        <Calendar size={14} />
                        {formatDate(item.last_edited_time)}
                      </div>
                      <span className="capitalize px-2 py-0.5 rounded-full bg-chat-hover">
                        {item.object}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 text-chat-muted bg-chat-sidebar rounded-xl border border-chat-border">
                <div className="w-16 h-16 bg-chat-hover rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search size={24} />
                </div>
                <p className="text-lg">No memories found</p>
                {searchQuery ? (
                  <p className="text-sm mt-1">Try a different search term</p>
                ) : (
                  <p className="text-sm mt-1">The AI hasn't saved any memories to Notion yet.</p>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
