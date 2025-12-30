'use client';

import { Brain } from 'lucide-react';

interface TypingIndicatorProps {
  variant?: 'dots' | 'shimmer' | 'text';
}

export function TypingIndicator({ variant = 'dots' }: TypingIndicatorProps) {
  if (variant === 'shimmer') {
    return (
      <div className="flex gap-4">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-chat-accent to-emerald-600 flex items-center justify-center shrink-0 glow-accent">
          <Brain size={14} className="text-white" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="h-4 w-3/4 rounded shimmer" />
          <div className="h-4 w-1/2 rounded shimmer" />
          <div className="h-4 w-2/3 rounded shimmer" />
        </div>
      </div>
    );
  }

  if (variant === 'text') {
    return (
      <div className="flex gap-4">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-chat-accent to-emerald-600 flex items-center justify-center shrink-0 glow-accent animate-pulse">
          <Brain size={14} className="text-white" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-chat-muted typing-cursor">Thinking</span>
        </div>
      </div>
    );
  }

  // Default: dots
  return (
    <div className="flex gap-4">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-chat-accent to-emerald-600 flex items-center justify-center shrink-0 glow-accent">
        <Brain size={14} className="text-white animate-pulse" />
      </div>
      <div className="flex items-center gap-1 px-4 py-3 rounded-2xl bg-chat-input border border-chat-border">
        <div className="w-2 h-2 rounded-full bg-chat-accent typing-dot" />
        <div className="w-2 h-2 rounded-full bg-chat-accent typing-dot" />
        <div className="w-2 h-2 rounded-full bg-chat-accent typing-dot" />
      </div>
    </div>
  );
}

export function ThinkingBadge() {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-chat-accent/10 border border-chat-accent/20">
      <div className="flex items-center gap-0.5">
        <div className="w-1.5 h-1.5 rounded-full bg-chat-accent typing-dot" />
        <div className="w-1.5 h-1.5 rounded-full bg-chat-accent typing-dot" />
        <div className="w-1.5 h-1.5 rounded-full bg-chat-accent typing-dot" />
      </div>
      <span className="text-xs text-chat-accent font-medium">Thinking</span>
    </div>
  );
}

