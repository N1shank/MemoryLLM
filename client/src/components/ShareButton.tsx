'use client';

import { useState, useEffect, useCallback } from 'react';
import { Share2, Link, Check, Loader2, X, Globe, Lock } from 'lucide-react';
import { shareApi, ShareStatus, ApiClientError } from '@/lib/api';

interface ShareButtonProps {
  conversationId: number;
}

export function ShareButton({ conversationId }: ShareButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<ShareStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && !status) {
      loadStatus();
    }
  }, [isOpen, status, loadStatus]);

  const loadStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await shareApi.getStatus(conversationId);
      setStatus(data);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Failed to load share status');
    } finally {
      setIsLoading(false);
    }
  }, [conversationId]);

  const toggleSharing = async () => {
    setIsToggling(true);
    setError(null);
    try {
      const data = await shareApi.toggleSharing(conversationId);
      setStatus(data);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Failed to toggle sharing');
    } finally {
      setIsToggling(false);
    }
  };

  const copyLink = async () => {
    if (!status?.share_url) return;
    
    const fullUrl = `${window.location.origin}${status.share_url}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy link');
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 hover:bg-chat-hover rounded-lg transition-colors text-chat-muted hover:text-foreground"
        title="Share conversation"
      >
        <Share2 size={20} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute right-0 top-full mt-2 w-80 bg-chat-sidebar border border-chat-border rounded-xl shadow-2xl z-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-chat-border">
              <h3 className="font-semibold">Share Conversation</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-chat-hover rounded"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="p-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 size={24} className="animate-spin text-chat-muted" />
                </div>
              ) : error ? (
                <div className="text-red-400 text-sm text-center py-4">
                  {error}
                </div>
              ) : (
                <>
                  {/* Toggle */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      {status?.is_shared ? (
                        <Globe size={18} className="text-green-400" />
                      ) : (
                        <Lock size={18} className="text-chat-muted" />
                      )}
                      <span className="text-sm">
                        {status?.is_shared ? 'Public link enabled' : 'Private'}
                      </span>
                    </div>
                    <button
                      onClick={toggleSharing}
                      disabled={isToggling}
                      className={`relative w-12 h-6 rounded-full transition-colors ${
                        status?.is_shared ? 'bg-green-500' : 'bg-chat-border'
                      }`}
                    >
                      <div
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                          status?.is_shared ? 'left-7' : 'left-1'
                        }`}
                      />
                      {isToggling && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Loader2 size={14} className="animate-spin" />
                        </div>
                      )}
                    </button>
                  </div>

                  {/* Link */}
                  {status?.is_shared && status.share_url && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 p-2 bg-chat-input rounded-lg">
                        <Link size={14} className="text-chat-muted shrink-0" />
                        <span className="text-sm truncate flex-1">
                          {window.location.origin}{status.share_url}
                        </span>
                        <button
                          onClick={copyLink}
                          className="px-3 py-1 bg-chat-accent rounded text-xs font-medium hover:bg-chat-accent-hover transition-colors flex items-center gap-1"
                        >
                          {copied ? (
                            <>
                              <Check size={12} />
                              Copied
                            </>
                          ) : (
                            'Copy'
                          )}
                        </button>
                      </div>
                      
                      <p className="text-xs text-chat-muted">
                        Anyone with this link can view this conversation. They won't be able to continue it or modify it.
                      </p>
                    </div>
                  )}

                  {!status?.is_shared && (
                    <p className="text-xs text-chat-muted">
                      Enable sharing to create a public link that anyone can use to view this conversation.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

