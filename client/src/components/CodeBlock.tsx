'use client';

import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, CheckCheck } from 'lucide-react';

interface CodeBlockProps {
  language?: string;
  children: string;
}

export function CodeBlock({ language, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silently fail
    }
  };

  // Clean the code string
  const code = children.replace(/\n$/, '');

  return (
    <div className="relative group my-3">
      {/* Language badge and copy button */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2 bg-[#1e1e1e] rounded-t-lg border-b border-[#333]">
        <span className="text-xs text-gray-400 font-mono">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
        >
          {copied ? (
            <>
              <CheckCheck size={14} className="text-green-400" />
              <span className="text-green-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      
      {/* Code block */}
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '3rem 1rem 1rem 1rem',
          borderRadius: '0.5rem',
          fontSize: '0.875rem',
          background: '#1e1e1e',
        }}
        showLineNumbers={code.split('\n').length > 3}
        lineNumberStyle={{
          minWidth: '2.5em',
          paddingRight: '1em',
          color: '#555',
          userSelect: 'none',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

interface InlineCodeProps {
  children: React.ReactNode;
}

export function InlineCode({ children }: InlineCodeProps) {
  return (
    <code className="px-1.5 py-0.5 rounded bg-chat-accent/15 text-chat-accent font-mono text-[0.9em]">
      {children}
    </code>
  );
}

