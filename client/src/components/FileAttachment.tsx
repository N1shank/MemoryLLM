'use client';

import { useState, useRef } from 'react';
import { Paperclip, X, Image as ImageIcon, FileText, Loader2 } from 'lucide-react';
import { filesApi, UploadedFile, ApiClientError } from '@/lib/api';
import { config } from '@/lib/config';

interface FileAttachmentProps {
  onFileUploaded: (file: UploadedFile) => void;
  disabled?: boolean;
}

export function FileAttachmentButton({ onFileUploaded, disabled }: FileAttachmentProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsUploading(true);

    try {
      const uploaded = await filesApi.upload(file);
      onFileUploaded(uploaded);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Upload failed');
      setTimeout(() => setError(null), 3000);
    } finally {
      setIsUploading(false);
      // Reset input so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="relative">
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        className="hidden"
        accept=".jpg,.jpeg,.png,.gif,.webp,.svg,.pdf,.doc,.docx,.txt,.md,.csv,.json,.py,.js,.ts,.html,.css,.yaml,.yml"
      />
      <button
        onClick={handleClick}
        disabled={disabled || isUploading}
        className="p-2.5 rounded-lg hover:bg-chat-hover text-chat-muted hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        title="Attach file"
      >
        {isUploading ? (
          <Loader2 size={20} className="animate-spin" />
        ) : (
          <Paperclip size={20} />
        )}
      </button>
      
      {error && (
        <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-red-500/90 text-white text-xs rounded-lg whitespace-nowrap">
          {error}
        </div>
      )}
    </div>
  );
}

interface AttachmentPreviewProps {
  file: UploadedFile;
  onRemove: () => void;
}

export function AttachmentPreview({ file, onRemove }: AttachmentPreviewProps) {
  const fileUrl = `${config.apiUrl}${file.url}`;
  
  return (
    <div className="relative inline-flex items-center gap-2 px-3 py-2 bg-chat-input rounded-lg border border-chat-border group">
      {file.is_image ? (
        <div className="relative w-16 h-16 rounded overflow-hidden">
          <img
            src={fileUrl}
            alt={file.original_name}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="w-10 h-10 rounded bg-chat-accent/10 flex items-center justify-center">
          <FileText size={20} className="text-chat-accent" />
        </div>
      )}
      
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate max-w-[150px]">
          {file.original_name}
        </p>
        <p className="text-xs text-chat-muted">
          {formatFileSize(file.size)}
        </p>
      </div>
      
      <button
        onClick={onRemove}
        className="p-1 rounded hover:bg-chat-hover text-chat-muted hover:text-red-400 transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  );
}

interface MessageAttachmentProps {
  url: string;
  filename: string;
  isImage: boolean;
}

export function MessageAttachment({ url, filename, isImage }: MessageAttachmentProps) {
  const fullUrl = url.startsWith('http') ? url : `${config.apiUrl}${url}`;
  
  if (isImage) {
    return (
      <a
        href={fullUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block max-w-sm rounded-lg overflow-hidden border border-chat-border hover:border-chat-accent transition-colors"
      >
        <img
          src={fullUrl}
          alt={filename}
          className="w-full h-auto"
          loading="lazy"
        />
      </a>
    );
  }

  return (
    <a
      href={fullUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-3 py-2 bg-chat-input rounded-lg border border-chat-border hover:border-chat-accent transition-colors"
    >
      <FileText size={18} className="text-chat-accent" />
      <span className="text-sm">{filename}</span>
    </a>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

