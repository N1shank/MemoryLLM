'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { integrationsApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

function NotionCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const hasCalledRef = useRef(false);

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      setStatus('error');
      setErrorMsg(`Notion authorization failed: ${error}`);
      return;
    }

    if (!code) {
      setStatus('error');
      setErrorMsg('No authorization code provided by Notion.');
      return;
    }

    if (hasCalledRef.current) return;
    hasCalledRef.current = true;

    const exchangeCode = async () => {
      try {
        const data = await integrationsApi.callbackNotion(code);
        setWorkspaceName(data.workspace_name || 'Notion');
        setStatus('success');
        
        // Refresh the user context so the app knows Notion is connected
        await refreshUser();
        
        // Redirect back to settings after a short delay
        setTimeout(() => {
          router.push('/settings');
        }, 2500);
        
      } catch (e: any) {
        setStatus('error');
        setErrorMsg(e.message || 'An unexpected error occurred');
      }
    };

    exchangeCode();
  }, [searchParams, router, refreshUser]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-chat-input rounded-2xl border border-chat-border p-8 text-center space-y-6">
        
        {status === 'loading' && (
          <>
            <div className="w-16 h-16 mx-auto bg-chat-accent/10 rounded-full flex items-center justify-center mb-4">
              <Loader2 className="w-8 h-8 text-chat-accent animate-spin" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Connecting Notion...</h1>
            <p className="text-chat-muted">Please wait while we securely connect your Notion workspace.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 mx-auto bg-green-500/10 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Successfully Connected!</h1>
            <p className="text-chat-muted">
              Your MemoryLLM is now securely connected to <strong>{workspaceName}</strong>.
            </p>
            <p className="text-sm text-chat-muted animate-pulse">Redirecting back to settings...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 mx-auto bg-red-500/10 rounded-full flex items-center justify-center mb-4">
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Connection Failed</h1>
            <p className="text-red-400">{errorMsg}</p>
            <button 
              onClick={() => router.push('/settings')}
              className="mt-6 px-6 py-2 bg-chat-accent hover:bg-chat-accent/80 text-white rounded-lg transition-colors font-medium"
            >
              Return to Settings
            </button>
          </>
        )}
        
      </div>
    </div>
  );
}

export default function NotionCallback() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-16 h-16 mx-auto bg-chat-accent/10 rounded-full flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-chat-accent animate-spin" />
        </div>
      </div>
    }>
      <NotionCallbackContent />
    </Suspense>
  );
}
