'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Send, Plus, Brain, Menu, X, LogOut,
  Trash2, Pencil, Check, MoreHorizontal, AlertCircle,
  Loader2, RefreshCw, Copy, CheckCheck, Sun, Moon, Download, Search,
  Settings, HelpCircle, Keyboard, Pin, PinOff, ThumbsUp, ThumbsDown, Archive,
  ChevronUp, ChevronDown, FileText, Bookmark, Square, CheckSquare, MessageSquare, Volume2, VolumeX
} from 'lucide-react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import { CodeBlock, InlineCode } from '@/components/CodeBlock';
import { TypingIndicator } from '@/components/TypingIndicator';
import { VoiceInput } from '@/components/VoiceInput';
import { FileAttachmentButton, AttachmentPreview, MessageAttachment } from '@/components/FileAttachment';
import { ShareButton } from '@/components/ShareButton';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  conversationsApi,
  chatApi,
  Conversation,
  ApiClientError,
  UploadedFile,
  templatesApi,
  Template,
  foldersApi,
  Folder,
  draftsApi,
  filesApi,
} from '@/lib/api';

interface Attachment {
  url: string;
  filename: string;
  isImage: boolean;
}

interface LocalMessage {
  id: number | string;
  role: 'user' | 'assistant';
  content: string;
  memory_context: string | null;
  feedback?: 'thumbs_up' | 'thumbs_down' | null;
  created_at?: string;
  isStreaming?: boolean;
  attachments?: Attachment[];
}

export default function Home() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingConversations, setIsFetchingConversations] = useState(true);

  const [conversationsOffset, setConversationsOffset] = useState(0);
  const [hasMoreConversations, setHasMoreConversations] = useState(true);
  const [messagesOffset, setMessagesOffset] = useState(0);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const CONVERSATIONS_LIMIT = 50;
  const MESSAGES_LIMIT = 50;

  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-TTS State
  const [voiceMode, setVoiceMode] = useState(false);
  const voiceModeRef = useRef(voiceMode);
  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  // Edit/delete conversation state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);

  // Edit message state
  const [editingMessageId, setEditingMessageId] = useState<number | string | null>(null);
  const [editMessageContent, setEditMessageContent] = useState('');

  // Copy state
  const [copiedMessageId, setCopiedMessageId] = useState<number | string | null>(null);

  // Attachment state
  const [pendingAttachments, setPendingAttachments] = useState<UploadedFile[]>([]);

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Conversation[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Message search within conversation
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [messageSearchResults, setMessageSearchResults] = useState<number[]>([]);
  const [currentMessageSearchIndex, setCurrentMessageSearchIndex] = useState(-1);
  const messageSearchRefs = useRef<Map<number | string, HTMLDivElement>>(new Map());

  // Bulk selection state
  const [selectedConversations, setSelectedConversations] = useState<Set<number>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);

  // Shortcuts help modal state
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Templates
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateContent, setTemplateContent] = useState('');

  // Folders
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);

  // Tags
  const [editingTags, setEditingTags] = useState<number | null>(null);
  const [tagInput, setTagInput] = useState('');
  
  // Drag and Drop
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      const acceptedExts = ['.jpg','.jpeg','.png','.gif','.webp','.svg','.pdf','.doc','.docx','.txt','.md','.csv','.json','.py','.js','.ts','.html','.css','.yaml','.yml'];
      
      for (const file of files) {
        const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
        if (!acceptedExts.includes(ext)) {
          setError(`File type ${ext} not supported`);
          setTimeout(() => setError(null), 3000);
          continue;
        }

        try {
          const uploaded = await filesApi.upload(file as any);
          setPendingAttachments(prev => [...prev, uploaded]);
        } catch (err) {
          setError(err instanceof ApiClientError ? err.message : 'Upload failed');
          setTimeout(() => setError(null), 3000);
        }
      }
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isLoadingOlderRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const draftSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Redirect to login if not authenticated (only after auth check is complete)
  useEffect(() => {
    // Wait for auth loading to complete before checking authentication
    if (!authLoading) {
      if (!isAuthenticated) {
        router.push('/auth/login');
      }
    }
  }, [authLoading, isAuthenticated, router]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K: New chat
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        createNewConversation();
        textareaRef.current?.focus();
      }

      // Cmd/Ctrl + B: Toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        if (window.innerWidth < 1024) {
          setMobileMenuOpen(prev => !prev);
        } else {
          setSidebarOpen(prev => !prev);
        }
      }

      // Cmd/Ctrl + Shift + E: Export as Markdown
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'e') {
        e.preventDefault();
        if (messages.length > 0) {
          exportConversation('markdown');
        }
      }

      // Escape: Close modals/editing
      if (e.key === 'Escape') {
        if (editingMessageId) {
          cancelEditMessage();
        }
        if (menuOpenId) {
          setMenuOpenId(null);
        }
        if (mobileMenuOpen) {
          setMobileMenuOpen(false);
        }
      }

      // /: Focus input (when not already focused)
      if (e.key === '/' && document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        textareaRef.current?.focus();
      }

      // Cmd/Ctrl + F: Open search
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
      }

      // Cmd/Ctrl + ? or Shift + ?: Open shortcuts help
      if (((e.metaKey || e.ctrlKey) && e.key === '?') || (e.shiftKey && e.key === '?')) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [messages.length, editingMessageId, menuOpenId, mobileMenuOpen]);

  // Fetch conversations and folders on mount
  useEffect(() => {
    if (isAuthenticated) {
      fetchConversations();
      fetchFolders();
      fetchTemplates();
    }
  }, [isAuthenticated]);

  const fetchFolders = async () => {
    try {
      setIsLoadingFolders(true);
      const folderList = await foldersApi.list();
      setFolders(folderList);
    } catch (e) {
      console.error('Failed to load folders:', e);
    } finally {
      setIsLoadingFolders(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const folder = await foldersApi.create(newFolderName.trim());
      setFolders(prev => [...prev, folder]);
      setNewFolderName('');
      setShowNewFolderInput(false);
    } catch (e) {
      setError('Failed to create folder');
    }
  };

  const handleMoveToFolder = async (conversationId: number, folderId: number | null) => {
    try {
      await conversationsApi.updateFolder(conversationId, folderId);
      await fetchConversations();
    } catch (e) {
      setError('Failed to move conversation');
    }
  };

  const handleUpdateTags = async (conversationId: number, tags: string[]) => {
    try {
      await conversationsApi.updateTags(conversationId, tags);
      await fetchConversations();
      setEditingTags(null);
      setTagInput('');
    } catch (e) {
      setError('Failed to update tags');
    }
  };

  const fetchTemplates = async () => {
    try {
      setIsLoadingTemplates(true);
      const templateList = await templatesApi.list();
      setTemplates(templateList);
    } catch (e) {
      console.error('Failed to load templates:', e);
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateTitle.trim() || !templateContent.trim()) return;
    try {
      setSavingTemplate(true);
      const template = await templatesApi.create(templateTitle.trim(), templateContent.trim());
      setTemplates(prev => [...prev, template]);
      setTemplateTitle('');
      setTemplateContent('');
    } catch (e) {
      setError('Failed to save template');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleUseTemplate = (template: Template) => {
    setInput(template.content);
    setTemplatesOpen(false);
  };

  const handleDeleteTemplate = async (id: number) => {
    try {
      await templatesApi.delete(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (e) {
      setError('Failed to delete template');
    }
  };

  // Close mobile menu when selecting a conversation
  useEffect(() => {
    if (currentConversationId && mobileMenuOpen) {
      setMobileMenuOpen(false);
    }
  }, [currentConversationId, mobileMenuOpen]);

  // Auto-resize edit textarea
  useEffect(() => {
    if (editTextareaRef.current) {
      editTextareaRef.current.style.height = 'auto';
      editTextareaRef.current.style.height = `${editTextareaRef.current.scrollHeight}px`;
    }
  }, [editMessageContent]);

  const fetchConversations = async (loadMore = false) => {
    try {
      const currentOffset = loadMore ? conversationsOffset : 0;
      const data = await conversationsApi.list(CONVERSATIONS_LIMIT, currentOffset);
      const convs = data.items || [];
      const totalCount = data.total_count || 0;
      
      if (loadMore) {
        setConversations(prev => [...prev, ...convs]);
      } else {
        setConversations(convs);
      }
      
      setConversationsOffset(currentOffset + convs.length);
      setHasMoreConversations(currentOffset + convs.length < totalCount);
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
    setIsLoadingMessages(true);
    setMessages([]);
    setMessagesOffset(0);
    setHasMoreMessages(true);

    try {
      const data = await chatApi.getMessages(id, MESSAGES_LIMIT, 0);
      const msgs = data.items || [];
      const totalCount = data.total_count || 0;
      
      // Messages come ordered by newest first (descending). Reverse to display oldest first.
      const formattedMsgs = msgs.map((m: any) => ({
        ...m,
        feedback: m.feedback || null,
        created_at: m.created_at,
        isStreaming: false,
      })).reverse();
      
      setMessages(formattedMsgs);
      setMessagesOffset(msgs.length);
      setHasMoreMessages(msgs.length < totalCount);
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
    } finally {
      setIsLoadingMessages(false);
    }
  };
  
  const loadMoreMessages = async () => {
    if (!currentConversationId || !hasMoreMessages || isLoadingMessages) return;
    
    setIsLoadingMessages(true);
    isLoadingOlderRef.current = true;
    
    // Save current scroll height to adjust scroll position after rendering
    const container = chatContainerRef.current;
    const prevScrollHeight = container ? container.scrollHeight : 0;
    
    try {
      const data = await chatApi.getMessages(currentConversationId, MESSAGES_LIMIT, messagesOffset);
      const msgs = data.items || [];
      const totalCount = data.total_count || 0;
      
      const formattedMsgs = msgs.map((m: any) => ({
        ...m,
        feedback: m.feedback || null,
        created_at: m.created_at,
        isStreaming: false,
      })).reverse();
      
      setMessages(prev => [...formattedMsgs, ...prev]);
      setMessagesOffset(prev => prev + msgs.length);
      setHasMoreMessages(messagesOffset + msgs.length < totalCount);
      
      // We use setTimeout to allow DOM to update before adjusting scroll
      setTimeout(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevScrollHeight;
        }
        isLoadingOlderRef.current = false;
      }, 0);
    } catch (e) {
      console.error('Failed to load more messages:', e);
      isLoadingOlderRef.current = false;
    } finally {
      setIsLoadingMessages(false);
    }
  };
  

  const scrollToBottom = () => {
    if (!isLoadingOlderRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
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

  // Auto-save drafts
  useEffect(() => {
    if (draftSaveTimeoutRef.current) {
      clearTimeout(draftSaveTimeoutRef.current);
    }

    if (input.trim() && currentConversationId) {
      draftSaveTimeoutRef.current = setTimeout(async () => {
        try {
          await draftsApi.createOrUpdate(currentConversationId, input);
        } catch (e) {
          // Silently fail - drafts are not critical
          console.error('Failed to save draft:', e);
        }
      }, 2000); // Save after 2 seconds of inactivity
    } else if (input.trim() && !currentConversationId) {
      // Save global draft
      draftSaveTimeoutRef.current = setTimeout(async () => {
        try {
          await draftsApi.createGlobal(input);
        } catch (e) {
          console.error('Failed to save draft:', e);
        }
      }, 2000);
    }

    return () => {
      if (draftSaveTimeoutRef.current) {
        clearTimeout(draftSaveTimeoutRef.current);
      }
    };
  }, [input, currentConversationId]);

  // Load draft when conversation is loaded (only if input is empty)
  useEffect(() => {
    if (currentConversationId && !input.trim()) {
      draftsApi.getForConversation(currentConversationId)
        .then(draft => {
          if (draft && draft.content) {
            setInput(draft.content);
          }
        })
        .catch(() => {
          // Ignore errors
        });
    }
  }, [currentConversationId]);

  const createNewConversation = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setInput('');
    setError(null);
    setMobileMenuOpen(false);
  };

  const sendMessageWithContent = async (content: string, conversationId: number | null, existingMessages: LocalMessage[]) => {
    setError(null);

    const userMessage: LocalMessage = {
      id: `temp-${crypto.randomUUID()}`,
      role: 'user',
      content: content.trim(),
      memory_context: null,
    };

    const assistantMessage: LocalMessage = {
      id: `temp-${crypto.randomUUID()}`,
      role: 'assistant',
      content: '',
      memory_context: null,
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setIsLoading(true);

    // Clear draft when sending message (async, don't block)
    if (conversationId) {
      draftsApi.getForConversation(conversationId)
        .then(draft => {
          if (draft) {
            return draftsApi.delete(draft.id);
          }
        })
        .catch(() => {
          // Ignore errors - draft clearing is not critical
        });
    }

    try {
      let newConversationId = conversationId;
      let fullContent = '';

      for await (const event of chatApi.sendStream(content.trim(), conversationId || undefined)) {
        if (event.type === 'chunk') {
          fullContent += (event.content || '');
          setMessages(prev => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg.role === 'assistant') {
              updated[updated.length - 1] = { ...lastMsg, content: lastMsg.content + (event.content || '') };
            }
            return updated;
          });
        } else if (event.type === 'done') {
          newConversationId = event.conversation_id || null;

          setMessages(prev => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg.role === 'assistant') {
              updated[updated.length - 1] = {
                ...lastMsg,
                id: event.message_id || lastMsg.id,
                memory_context: event.memory_context || null,
                isStreaming: false,
              };
            }
            return updated;
          });
          
          if (voiceModeRef.current && window.speechSynthesis) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(fullContent);
            utterance.lang = 'en-US';
            window.speechSynthesis.speak(utterance);
          }
        } else if (event.type === 'error') {
          throw new Error(event.message || 'Streaming error');
        }
      }

      if (newConversationId && newConversationId !== conversationId) {
        setCurrentConversationId(prev => prev === conversationId ? newConversationId : prev);
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

      setMessages(prev => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg.role === 'assistant' && lastMsg.isStreaming) {
          updated[updated.length - 1] = {
            ...lastMsg,
            content: 'Sorry, I encountered an error. Please try again.',
            isStreaming: false
          };
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if ((!input.trim() && pendingAttachments.length === 0) || isLoading) return;

    // Build message content with attachments
    let content = input.trim();
    const attachments: Attachment[] = [];

    if (pendingAttachments.length > 0) {
      for (const file of pendingAttachments) {
        attachments.push({
          url: file.url || '',
          filename: file.original_name || file.filename,
          isImage: file.is_image || false,
        });
        // Add file reference to message for AI context
        content += `\n[Attached file: ${file.original_name || file.filename}]`;
      }
    }

    setInput('');
    setPendingAttachments([]);

    // Send with attachments
    const userMessage: LocalMessage = {
      id: `temp-${crypto.randomUUID()}`,
      role: 'user',
      content: input.trim(),
      memory_context: null,
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    const assistantMessage: LocalMessage = {
      id: `temp-${crypto.randomUUID()}`,
      role: 'assistant',
      content: '',
      memory_context: null,
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setIsLoading(true);

    try {
      let newConversationId = currentConversationId;
      const fileNames = pendingAttachments.map(f => f.filename);

      for await (const event of chatApi.sendStream(content.trim(), currentConversationId || undefined, fileNames)) {
        if (event.type === 'chunk') {
          setMessages(prev => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg.role === 'assistant') {
              updated[updated.length - 1] = { ...lastMsg, content: lastMsg.content + (event.content || '') };
            }
            return updated;
          });
        } else if (event.type === 'done') {
          newConversationId = event.conversation_id || null;

          setMessages(prev => {
            const updated = [...prev];
            const lastMsg = updated[updated.length - 1];
            if (lastMsg.role === 'assistant') {
              updated[updated.length - 1] = {
                ...lastMsg,
                id: event.message_id || lastMsg.id,
                memory_context: event.memory_context || null,
                isStreaming: false,
              };
            }
            return updated;
          });
        } else if (event.type === 'error') {
          throw new Error(event.message || 'Streaming error');
        }
      }

      if (newConversationId && newConversationId !== currentConversationId) {
        setCurrentConversationId(prev => prev === currentConversationId ? newConversationId : prev);
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

      setMessages(prev => {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        if (lastMsg.role === 'assistant' && lastMsg.isStreaming) {
          updated[updated.length - 1] = {
            ...lastMsg,
            content: 'Sorry, I encountered an error. Please try again.',
            isStreaming: false
          };
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditMessage = (message: LocalMessage) => {
    setEditingMessageId(message.id);
    setEditMessageContent(message.content);
  };

  const cancelEditMessage = () => {
    setEditingMessageId(null);
    setEditMessageContent('');
  };

  const submitEditMessage = async (messageId: number | string) => {
    if (!editMessageContent.trim() || isLoading) return;

    // Find the message
    const message = messages.find(m => m.id === messageId);
    if (!message) return;

    setEditingMessageId(null);
    setIsLoading(true);

    try {
      if (typeof messageId === 'number') {
        // For AI messages, use the edit endpoint
        if (message.role === 'assistant') {
          const updated = await chatApi.editMessage(messageId, editMessageContent);
          setMessages(prev =>
            prev.map(m => m.id === messageId ? { ...m, content: updated.content } : m)
          );
        } else {
          // For user messages, resend with new content
          const messageIndex = messages.findIndex(m => m.id === messageId);
          const messagesBeforeEdit = messages.slice(0, messageIndex);
          await sendMessageWithContent(editMessageContent, currentConversationId, messagesBeforeEdit);
        }
      } else {
        // Temporary message - just resend
        const messageIndex = messages.findIndex(m => m.id === messageId);
        const messagesBeforeEdit = messages.slice(0, messageIndex);
        await sendMessageWithContent(editMessageContent, currentConversationId, messagesBeforeEdit);
      }
      setEditMessageContent('');
    } catch (e) {
      setError('Failed to edit message');
      setIsLoading(false);
    }
  };

  const handleFeedback = async (messageId: number | string, feedback: 'thumbs_up' | 'thumbs_down' | null) => {
    if (typeof messageId !== 'number') return;

    try {
      const updated = await chatApi.updateFeedback(messageId, feedback);
      setMessages(prev =>
        prev.map(m => m.id === messageId ? { ...m, feedback: updated.feedback } : m)
      );
    } catch {
      setError('Failed to update feedback');
    }
  };

  const regenerateResponse = async (messageIndex: number) => {
    if (isLoading || !currentConversationId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await chatApi.regenerate(currentConversationId);

      // Reload conversation to get updated messages
      await loadConversation(currentConversationId);
    } catch (e) {
      const errorMessage = e instanceof ApiClientError
        ? e.message
        : e instanceof Error
          ? e.message
          : 'Failed to regenerate response';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const copyMessage = async (content: string, messageId: number | string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  };

  // Message search within conversation
  useEffect(() => {
    if (!messageSearchQuery.trim()) {
      setMessageSearchResults([]);
      setCurrentMessageSearchIndex(-1);
      return;
    }

    const query = messageSearchQuery.toLowerCase();
    const results: number[] = [];

    messages.forEach((msg, index) => {
      if (msg.content.toLowerCase().includes(query)) {
        results.push(index);
      }
    });

    setMessageSearchResults(results);
    setCurrentMessageSearchIndex(results.length > 0 ? 0 : -1);
  }, [messageSearchQuery, messages]);

  // Scroll to search result
  useEffect(() => {
    if (currentMessageSearchIndex >= 0 && messageSearchResults.length > 0) {
      const messageIndex = messageSearchResults[currentMessageSearchIndex];
      const messageId = messages[messageIndex]?.id;
      if (messageId && messageSearchRefs.current.has(messageId)) {
        const element = messageSearchRefs.current.get(messageId);
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentMessageSearchIndex, messageSearchResults, messages]);

  const navigateMessageSearch = (direction: 'next' | 'prev') => {
    if (messageSearchResults.length === 0) return;

    if (direction === 'next') {
      setCurrentMessageSearchIndex(prev =>
        prev < messageSearchResults.length - 1 ? prev + 1 : 0
      );
    } else {
      setCurrentMessageSearchIndex(prev =>
        prev > 0 ? prev - 1 : messageSearchResults.length - 1
      );
    }
  };

  const formatTimestamp = (timestamp: string | undefined): string => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    // Show date for older messages
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const exportConversation = (format: 'json' | 'markdown') => {
    if (messages.length === 0) return;

    const conversation = conversations.find(c => c.id === currentConversationId);
    const title = conversation?.title || 'conversation';
    const timestamp = new Date().toISOString().split('T')[0];

    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === 'json') {
      content = JSON.stringify({
        title,
        exported_at: new Date().toISOString(),
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
          memory_context: m.memory_context,
        })),
      }, null, 2);
      filename = `${title.replace(/[^a-z0-9]/gi, '_')}_${timestamp}.json`;
      mimeType = 'application/json';
    } else {
      const lines = [
        `# ${title}`,
        ``,
        `*Exported on ${new Date().toLocaleDateString()}*`,
        ``,
        `---`,
        ``,
      ];

      for (const msg of messages) {
        if (msg.role === 'user') {
          lines.push(`## You`);
        } else {
          lines.push(`## Assistant`);
          if (msg.memory_context) {
            lines.push(`> 🧠 ${msg.memory_context}`);
            lines.push(``);
          }
        }
        lines.push(msg.content);
        lines.push(``);
        lines.push(`---`);
        lines.push(``);
      }

      content = lines.join('\n');
      filename = `${title.replace(/[^a-z0-9]/gi, '_')}_${timestamp}.md`;
      mimeType = 'text/markdown';
    }

    // Create and download file
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, messageId: number | string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitEditMessage(messageId);
    }
    if (e.key === 'Escape') {
      cancelEditMessage();
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
    } catch {
      setError('Failed to rename conversation');
    }
  };

  const handleTogglePin = async (id: number, currentPinState: boolean) => {
    try {
      const updated = await conversationsApi.togglePin(id, !currentPinState);
      setConversations(prev =>
        prev.map(c => c.id === id ? updated : c)
      );
      setMenuOpenId(null);
    } catch {
      setError('Failed to update conversation');
    }
  };

  const handleToggleArchive = async (id: number, currentArchiveState: boolean) => {
    try {
      await conversationsApi.toggleArchive(id, !currentArchiveState);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (currentConversationId === id) {
        setCurrentConversationId(null);
        setMessages([]);
      }
      setMenuOpenId(null);
    } catch {
      setError('Failed to archive conversation');
    }
  };

  // Bulk operations
  const toggleConversationSelection = (id: number) => {
    setSelectedConversations(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllConversations = () => {
    setSelectedConversations(new Set(conversations.map(c => c.id)));
  };

  const clearSelection = () => {
    setSelectedConversations(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedConversations.size === 0) return;

    try {
      await Promise.all(
        Array.from(selectedConversations).map(id => conversationsApi.delete(id))
      );
      setConversations(prev => prev.filter(c => !selectedConversations.has(c.id)));
      if (currentConversationId && selectedConversations.has(currentConversationId)) {
        setCurrentConversationId(null);
        setMessages([]);
      }
      clearSelection();
      setBulkMode(false);
    } catch {
      setError('Failed to delete conversations');
    }
  };

  const handleBulkPin = async () => {
    if (selectedConversations.size === 0) return;

    try {
      await Promise.all(
        Array.from(selectedConversations).map(id => conversationsApi.togglePin(id, true))
      );
      await fetchConversations();
      clearSelection();
      setBulkMode(false);
    } catch {
      setError('Failed to update conversations');
    }
  };

  const handleBulkArchive = async () => {
    if (selectedConversations.size === 0) return;

    try {
      await Promise.all(
        Array.from(selectedConversations).map(id => conversationsApi.toggleArchive(id, true))
      );
      setConversations(prev => prev.filter(c => !selectedConversations.has(c.id)));
      if (currentConversationId && selectedConversations.has(currentConversationId)) {
        setCurrentConversationId(null);
        setMessages([]);
      }
      clearSelection();
      setBulkMode(false);
    } catch {
      setError('Failed to archive conversations');
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
    } catch {
      setError('Failed to delete conversation');
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/auth/login');
  };

  // Search across all conversations
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = await conversationsApi.search(searchQuery.trim());
      setSearchResults(results);
    } catch (e) {
      console.error('Search failed:', e);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
    if (e.key === 'Escape') {
      setSearchOpen(false);
      setSearchQuery('');
      setSearchResults([]);
    }
  };

  const goToSearchResult = async (conversationId: number) => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    await loadConversation(conversationId);
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
      {/* Keyboard Shortcuts Modal */}
      {shortcutsOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
          onClick={() => setShortcutsOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-chat-sidebar rounded-xl border border-chat-border shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-chat-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-chat-accent to-emerald-600 flex items-center justify-center">
                  <Keyboard size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Keyboard Shortcuts</h2>
                  <p className="text-sm text-chat-muted">Speed up your workflow</p>
                </div>
              </div>
              <button
                onClick={() => setShortcutsOpen(false)}
                className="p-2 hover:bg-chat-hover rounded-lg transition-colors"
              >
                <X size={20} className="text-chat-muted" />
              </button>
            </div>

            {/* Shortcuts List */}
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              <div className="space-y-6">
                {/* Navigation */}
                <div>
                  <h3 className="text-sm font-semibold text-chat-accent mb-3 flex items-center gap-2">
                    <Menu size={16} />
                    Navigation
                  </h3>
                  <div className="space-y-2">
                    {[
                      { keys: ['⌘', 'K'], label: 'New chat', action: 'Create a new conversation' },
                      { keys: ['⌘', 'B'], label: 'Toggle sidebar', action: 'Show or hide the sidebar' },
                      { keys: ['/', 'Slash'], label: 'Focus input', action: 'Jump to message input' },
                    ].map((shortcut, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-chat-input hover:bg-chat-hover transition-colors">
                        <div>
                          <div className="font-medium text-sm">{shortcut.label}</div>
                          <div className="text-xs text-chat-muted mt-0.5">{shortcut.action}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, j) => (
                            <kbd key={j} className="px-2 py-1 rounded bg-chat-sidebar border border-chat-border text-xs font-mono">
                              {key}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Search & Actions */}
                <div>
                  <h3 className="text-sm font-semibold text-chat-accent mb-3 flex items-center gap-2">
                    <Search size={16} />
                    Search & Actions
                  </h3>
                  <div className="space-y-2">
                    {[
                      { keys: ['⌘', 'F'], label: 'Search conversations', action: 'Open search modal' },
                      { keys: ['⌘', '⇧', 'E'], label: 'Export conversation', action: 'Export as Markdown' },
                    ].map((shortcut, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-chat-input hover:bg-chat-hover transition-colors">
                        <div>
                          <div className="font-medium text-sm">{shortcut.label}</div>
                          <div className="text-xs text-chat-muted mt-0.5">{shortcut.action}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, j) => (
                            <kbd key={j} className="px-2 py-1 rounded bg-chat-sidebar border border-chat-border text-xs font-mono">
                              {key}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* General */}
                <div>
                  <h3 className="text-sm font-semibold text-chat-accent mb-3 flex items-center gap-2">
                    <HelpCircle size={16} />
                    General
                  </h3>
                  <div className="space-y-2">
                    {[
                      { keys: ['Esc'], label: 'Close modals', action: 'Close any open modal or cancel editing' },
                      { keys: ['⌘', '?'], label: 'Show shortcuts', action: 'Open this help modal' },
                    ].map((shortcut, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-chat-input hover:bg-chat-hover transition-colors">
                        <div>
                          <div className="font-medium text-sm">{shortcut.label}</div>
                          <div className="text-xs text-chat-muted mt-0.5">{shortcut.action}</div>
                        </div>
                        <div className="flex items-center gap-1">
                          {shortcut.keys.map((key, j) => (
                            <kbd key={j} className="px-2 py-1 rounded bg-chat-sidebar border border-chat-border text-xs font-mono">
                              {key}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer note */}
              <div className="mt-6 pt-4 border-t border-chat-border text-center">
                <p className="text-xs text-chat-muted">
                  Tip: Use <kbd className="px-1.5 py-0.5 mx-0.5 rounded bg-chat-hover text-xs">⌘</kbd> on Mac or <kbd className="px-1.5 py-0.5 mx-0.5 rounded bg-chat-hover text-xs">Ctrl</kbd> on Windows/Linux
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Templates Modal */}
      {templatesOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
          onClick={() => setTemplatesOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-chat-sidebar rounded-xl border border-chat-border shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-chat-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-chat-accent to-emerald-600 flex items-center justify-center">
                  <FileText size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Templates</h2>
                  <p className="text-sm text-chat-muted">Save and reuse common prompts</p>
                </div>
              </div>
              <button
                onClick={() => setTemplatesOpen(false)}
                className="p-2 hover:bg-chat-hover rounded-lg transition-colors"
              >
                <X size={20} className="text-chat-muted" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-6 p-4 rounded-lg bg-chat-input border border-chat-border">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Plus size={16} />
                  Save Template
                </h3>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={templateTitle}
                    onChange={(e) => setTemplateTitle(e.target.value)}
                    placeholder="Template name..."
                    className="w-full px-3 py-2 rounded-lg bg-chat-sidebar border border-chat-border focus:border-chat-accent focus:outline-none text-sm"
                  />
                  <div className="relative">
                    <textarea
                      value={templateContent}
                      onChange={(e) => setTemplateContent(e.target.value)}
                      placeholder="Template content..."
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg bg-chat-sidebar border border-chat-border focus:border-chat-accent focus:outline-none text-sm resize-none"
                    />
                    {input.trim() && !templateContent && (
                      <button
                        onClick={() => setTemplateContent(input)}
                        className="absolute bottom-2 right-2 px-2 py-1 text-xs rounded bg-chat-accent/20 hover:bg-chat-accent/30 text-chat-accent transition-colors"
                      >
                        Use current input
                      </button>
                    )}
                  </div>
                  <button
                    onClick={handleSaveTemplate}
                    disabled={!templateTitle.trim() || !templateContent.trim() || savingTemplate}
                    className="px-4 py-2 rounded-lg bg-chat-accent hover:bg-chat-accent-hover disabled:opacity-50 text-sm font-medium transition-colors"
                  >
                    {savingTemplate ? 'Saving...' : 'Save Template'}
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Bookmark size={16} />
                  Saved Templates
                </h3>
                {isLoadingTemplates ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 size={24} className="animate-spin text-chat-muted" />
                  </div>
                ) : templates.length === 0 ? (
                  <p className="text-center text-chat-muted text-sm py-8">No templates yet</p>
                ) : (
                  <div className="space-y-2">
                    {templates.map((template) => (
                      <div
                        key={template.id}
                        className="p-3 rounded-lg bg-chat-input border border-chat-border hover:border-chat-accent/30 transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-sm mb-1">{template.title}</h4>
                            <p className="text-xs text-chat-muted line-clamp-2">{template.content}</p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleUseTemplate(template)}
                              className="p-1.5 rounded-md hover:bg-chat-hover text-chat-accent transition-colors"
                              title="Use template"
                            >
                              <Send size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteTemplate(template.id)}
                              className="p-1.5 rounded-md hover:bg-red-500/10 text-red-400 transition-colors"
                              title="Delete template"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tag editing modal */}
      {editingTags !== null && (
        <div
          className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
          onClick={() => {
            setEditingTags(null);
            setTagInput('');
          }}
        >
          <div
            className="w-full max-w-md bg-chat-sidebar rounded-xl border border-chat-border shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-chat-border">
              <h3 className="text-lg font-semibold">Edit Tags</h3>
              <button
                onClick={() => {
                  setEditingTags(null);
                  setTagInput('');
                }}
                className="p-1 hover:bg-chat-hover rounded"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const tags = tagInput.split(',').map(t => t.trim()).filter(t => t);
                    handleUpdateTags(editingTags, tags);
                  }
                }}
                placeholder="Enter tags separated by commas"
                className="w-full px-4 py-3 rounded-lg bg-chat-input border border-chat-border focus:border-chat-accent focus:outline-none"
                autoFocus
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setEditingTags(null);
                    setTagInput('');
                  }}
                  className="px-4 py-2 rounded-lg hover:bg-chat-hover transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const tags = tagInput.split(',').map(t => t.trim()).filter(t => t);
                    handleUpdateTags(editingTags, tags);
                  }}
                  className="px-4 py-2 rounded-lg bg-chat-accent hover:bg-chat-accent-hover transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search modal */}
      {searchOpen && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-start justify-center pt-[15vh]">
          <div
            className="w-full max-w-2xl mx-4 bg-chat-sidebar rounded-xl border border-chat-border shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-chat-border">
              <Search size={20} className="text-chat-muted shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search all conversations..."
                className="flex-1 bg-transparent focus:outline-none text-lg"
                autoFocus
              />
              {isSearching && <Loader2 size={20} className="animate-spin text-chat-muted" />}
              <button
                onClick={() => {
                  setSearchOpen(false);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
                className="p-1 hover:bg-chat-hover rounded"
              >
                <X size={18} />
              </button>
            </div>

            {/* Search results */}
            <div className="max-h-[50vh] overflow-y-auto">
              {isSearching ? (
                <div className="px-4 py-6 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse">
                      <div className="h-16 bg-chat-input/50 rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : searchResults.length === 0 && searchQuery ? (
                <div className="px-4 py-12 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-chat-input/50 flex items-center justify-center">
                    <Search size={32} className="text-chat-muted" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No results found</h3>
                  <p className="text-sm text-chat-muted mb-4">
                    No conversations match "{searchQuery}"
                  </p>
                  <p className="text-xs text-chat-muted">
                    Try different keywords or check your spelling
                  </p>
                </div>
              ) : searchResults.length > 0 ? (
                searchResults.map((result, index) => (
                  <button
                    key={index}
                    onClick={() => goToSearchResult(result.id)}
                    className="w-full text-left px-4 py-3 hover:bg-chat-hover border-b border-chat-border last:border-0 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare size={16} className="text-chat-muted" />
                      <span className="text-sm font-medium truncate">
                        {result.title}
                      </span>
                    </div>
                    <p className="text-xs text-chat-muted">
                      Updated {new Date(result.updated_at).toLocaleDateString()}
                    </p>
                  </button>
                ))
              ) : (
                <div className="px-4 py-12 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-chat-accent/20 to-emerald-600/20 flex items-center justify-center">
                    <Search size={32} className="text-chat-accent" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Search your conversations</h3>
                  <p className="text-sm text-chat-muted mb-4">
                    Type to search across all your conversations
                  </p>
                  <div className="flex items-center justify-center gap-2 text-xs text-chat-muted">
                    <kbd className="px-2 py-1 rounded bg-chat-hover">Enter</kbd>
                    <span>to search</span>
                    <kbd className="px-2 py-1 rounded bg-chat-hover">Esc</kbd>
                    <span>to close</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
        <div className="p-3 border-b border-chat-border space-y-2">
          {!bulkMode ? (
            <>
              <button
                onClick={createNewConversation}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-chat-border hover:bg-chat-hover transition-all duration-200 group"
              >
                <Plus size={18} className="group-hover:rotate-90 transition-transform duration-200" />
                <span className="font-medium">New chat</span>
              </button>

              <button
                onClick={() => {
                  setSearchOpen(true);
                  setTimeout(() => searchInputRef.current?.focus(), 100);
                }}
                className="w-full flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-chat-hover transition-colors text-chat-muted text-sm"
              >
                <Search size={16} />
                <span>Search</span>
                <kbd className="ml-auto text-xs px-1.5 py-0.5 rounded bg-chat-hover">⌘F</kbd>
              </button>

              <button
                onClick={() => setBulkMode(true)}
                className="w-full flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-chat-hover transition-colors text-chat-muted text-sm"
              >
                <Square size={16} />
                <span>Select multiple</span>
              </button>

              {/* Folders section */}
              <div className="pt-2 border-t border-chat-border mt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-chat-muted uppercase">Folders</span>
                  <button
                    onClick={() => setShowNewFolderInput(true)}
                    className="p-1 hover:bg-chat-hover rounded text-chat-muted hover:text-chat-accent"
                    title="New folder"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                {showNewFolderInput && (
                  <div className="mb-2 flex gap-1">
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCreateFolder();
                        } else if (e.key === 'Escape') {
                          setShowNewFolderInput(false);
                          setNewFolderName('');
                        }
                      }}
                      placeholder="Folder name"
                      className="flex-1 px-2 py-1 text-xs bg-chat-input rounded focus:outline-none focus:ring-1 focus:ring-chat-accent"
                      autoFocus
                    />
                    <button
                      onClick={handleCreateFolder}
                      className="px-2 py-1 text-xs rounded bg-chat-accent hover:bg-chat-accent-hover"
                    >
                      <Check size={12} />
                    </button>
                    <button
                      onClick={() => {
                        setShowNewFolderInput(false);
                        setNewFolderName('');
                      }}
                      className="px-2 py-1 text-xs rounded hover:bg-chat-hover"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
                {folders.length > 0 && (
                  <div className="space-y-1">
                    {folders.map(folder => (
                      <div
                        key={folder.id}
                        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-chat-hover text-xs text-chat-muted cursor-pointer"
                        onClick={() => {
                          setSelectedFolderId(selectedFolderId === folder.id ? null : folder.id);
                        }}
                        style={{ backgroundColor: selectedFolderId === folder.id ? 'var(--chat-hover)' : 'transparent' }}
                      >
                        <FileText size={12} />
                        <span className="flex-1 truncate">{folder.name}</span>
                        <span className="text-chat-muted/50">({folder.conversation_count})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-2">
                <span className="text-sm font-medium">
                  {selectedConversations.size} selected
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={selectAllConversations}
                    className="px-2 py-1 text-xs rounded hover:bg-chat-hover"
                  >
                    Select all
                  </button>
                  <button
                    onClick={() => {
                      clearSelection();
                      setBulkMode(false);
                    }}
                    className="px-2 py-1 text-xs rounded hover:bg-chat-hover"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              {selectedConversations.size > 0 && (
                <div className="flex gap-1 flex-wrap">
                  <button
                    onClick={handleBulkPin}
                    className="px-2 py-1 text-xs rounded bg-chat-input hover:bg-chat-hover border border-chat-border"
                    title="Pin selected"
                  >
                    <Pin size={12} className="inline mr-1" />
                    Pin
                  </button>
                  <button
                    onClick={handleBulkArchive}
                    className="px-2 py-1 text-xs rounded bg-chat-input hover:bg-chat-hover border border-chat-border"
                    title="Archive selected"
                  >
                    <Archive size={12} className="inline mr-1" />
                    Archive
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    className="px-2 py-1 text-xs rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20"
                    title="Delete selected"
                  >
                    <Trash2 size={12} className="inline mr-1" />
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {isFetchingConversations ? (
            <div className="space-y-2 py-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-12 rounded-lg bg-chat-input/50" />
                </div>
              ))}
            </div>
          ) : (selectedFolderId ? conversations.filter(c => c.folder_id === selectedFolderId) : conversations).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-chat-accent/20 to-emerald-600/20 flex items-center justify-center mb-4">
                <MessageSquare size={32} className="text-chat-accent" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                {selectedFolderId ? "No conversations in this folder" : "No conversations yet"}
              </h3>
              <p className="text-sm text-chat-muted mb-4 max-w-xs">
                {selectedFolderId ? "Move conversations to this folder to see them here" : "Start a new conversation to begin chatting with your AI assistant"}
              </p>
              <button
                onClick={createNewConversation}
                className="px-4 py-2 rounded-lg bg-chat-accent hover:bg-chat-accent-hover text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Plus size={16} />
                New Conversation
              </button>
            </div>
          ) : (
            (selectedFolderId ? conversations.filter(c => c.folder_id === selectedFolderId) : conversations).map(conv => (
              <div
                key={conv.id}
                className={`group relative mb-1 rounded-lg transition-colors ${conv.id === currentConversationId
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
                      onClick={() => {
                        if (bulkMode) {
                          toggleConversationSelection(conv.id);
                        } else {
                          loadConversation(conv.id);
                        }
                      }}
                      className={`w-full text-left px-3 py-2.5 ${bulkMode ? 'pr-10' : 'pr-10'} truncate text-sm flex items-center gap-2 ${selectedConversations.has(conv.id) ? 'bg-chat-accent/20' : ''
                        }`}
                    >
                      {bulkMode && (
                        <div className="shrink-0">
                          {selectedConversations.has(conv.id) ? (
                            <CheckSquare size={16} className="text-chat-accent" />
                          ) : (
                            <Square size={16} className="text-chat-muted" />
                          )}
                        </div>
                      )}
                      {conv.is_pinned && <Pin size={14} className="text-chat-accent shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{conv.title}</div>
                        {conv.tags && conv.tags.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {conv.tags.slice(0, 2).map((tag, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 text-xs rounded bg-chat-accent/10 text-chat-accent border border-chat-accent/20"
                              >
                                {tag}
                              </span>
                            ))}
                            {conv.tags.length > 2 && (
                              <span className="px-1.5 py-0.5 text-xs text-chat-muted">
                                +{conv.tags.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
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
                            onClick={() => handleTogglePin(conv.id, conv.is_pinned || false)}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-chat-hover text-sm"
                          >
                            {conv.is_pinned ? (
                              <>
                                <PinOff size={14} />
                                Unpin
                              </>
                            ) : (
                              <>
                                <Pin size={14} />
                                Pin
                              </>
                            )}
                          </button>
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
                          <div className="border-t border-chat-border my-1" />
                          <div className="px-3 py-1 text-xs text-chat-muted">Move to folder</div>
                          <button
                            onClick={() => {
                              handleMoveToFolder(conv.id, null);
                              setMenuOpenId(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-chat-hover text-sm"
                          >
                            <FileText size={14} />
                            No folder
                          </button>
                          {folders.map(folder => (
                            <button
                              key={folder.id}
                              onClick={() => {
                                handleMoveToFolder(conv.id, folder.id);
                                setMenuOpenId(null);
                              }}
                              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-chat-hover text-sm"
                            >
                              <FileText size={14} />
                              {folder.name}
                            </button>
                          ))}
                          <div className="border-t border-chat-border my-1" />
                          <button
                            onClick={() => {
                              setEditingTags(conv.id);
                              setTagInput(conv.tags?.join(', ') || '');
                              setMenuOpenId(null);
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-chat-hover text-sm"
                          >
                            <Bookmark size={14} />
                            Edit tags
                          </button>
                          <button
                            onClick={() => handleToggleArchive(conv.id, conv.is_archived || false)}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-chat-hover text-sm"
                          >
                            <Archive size={14} />
                            Archive
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
          
          {hasMoreConversations && !isFetchingConversations && (
            <button
              onClick={() => fetchConversations(true)}
              className="w-full py-2 text-sm text-chat-muted hover:text-chat-accent hover:bg-chat-hover/50 rounded-lg transition-colors mt-2"
            >
              Load More
            </button>
          )}
        </div>

        <div className="p-3 border-t border-chat-border space-y-2">
          {(user?.notion_api_key_configured || user?.google_api_key_configured) ? (
            <Link
              href="/memory"
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 transition-colors group"
            >
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <Brain size={16} className="text-green-400" />
              <span className="text-green-400 text-sm font-medium">
                {user?.notion_api_key_configured && user?.google_api_key_configured
                  ? 'Memory Active (Notion + Google)'
                  : user?.notion_api_key_configured
                    ? 'Notion Memory Active'
                    : 'Google Memory Active'}
              </span>
              <span className="ml-auto text-xs text-green-400 opacity-0 group-hover:opacity-100 transition-opacity">Manage</span>
            </Link>
          ) : (
            <Link
              href="/settings"
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-chat-hover transition-colors group"
            >
              <Brain size={16} className="text-gray-500 group-hover:text-chat-muted" />
              <span className="text-gray-500 text-sm group-hover:text-chat-muted">Memory Inactive</span>
              <span className="ml-auto text-xs text-chat-muted group-hover:text-chat-accent">Connect →</span>
            </Link>
          )}

          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-chat-accent/20 flex items-center justify-center">
                <span className="text-sm font-medium text-chat-accent">
                  {user?.name?.charAt(0).toUpperCase()}
                </span>
              </div>
              <span className="text-sm truncate max-w-[100px]">{user?.name}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShortcutsOpen(true)}
                className="p-2 hover:bg-chat-hover rounded-lg transition-colors"
                title="Keyboard shortcuts"
              >
                <Keyboard size={18} className="text-gray-400" />
              </button>
              <Link
                href="/settings"
                className="p-2 hover:bg-chat-hover rounded-lg transition-colors"
                title="Settings"
              >
                <Settings size={18} className="text-gray-400" />
              </Link>
              <button
                onClick={handleLogout}
                className="p-2 hover:bg-chat-hover rounded-lg transition-colors"
                title="Sign out"
              >
                <LogOut size={18} className="text-gray-400" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main chat area */}
      <main 
        className="flex-1 flex flex-col relative h-full bg-background"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-chat-accent rounded-lg m-4 pointer-events-none">
            <div className="text-center">
              <FileText size={48} className="mx-auto mb-4 text-chat-accent animate-bounce" />
              <h3 className="text-2xl font-bold text-foreground">Drop files here</h3>
              <p className="text-chat-muted mt-2">Add images or documents to the chat</p>
            </div>
          </div>
        )}
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
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-chat-accent to-emerald-600 flex items-center justify-center glow-accent">
              <Brain size={16} className="text-white" />
            </div>
            <span className="font-semibold">MemoryLLM</span>
          </div>

          {/* Message search within conversation */}
          {messages.length > 0 && (
            <div className="flex-1 max-w-md mx-4 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-chat-input border border-chat-border focus-within:border-chat-accent/50">
              <Search size={16} className="text-chat-muted shrink-0" />
              <input
                type="text"
                value={messageSearchQuery}
                onChange={(e) => setMessageSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.shiftKey) {
                    e.preventDefault();
                    navigateMessageSearch('prev');
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    navigateMessageSearch('next');
                  }
                }}
                placeholder="Search in conversation... (Enter: next, Shift+Enter: prev)"
                className="flex-1 bg-transparent focus:outline-none text-sm"
              />
              {messageSearchQuery && (
                <div className="flex items-center gap-1 text-xs text-chat-muted">
                  <span>
                    {messageSearchResults.length > 0
                      ? `${currentMessageSearchIndex + 1}/${messageSearchResults.length}`
                      : '0 results'}
                  </span>
                  {messageSearchResults.length > 0 && (
                    <>
                      <button
                        onClick={() => navigateMessageSearch('prev')}
                        className="p-0.5 hover:bg-chat-hover rounded"
                        title="Previous (Shift+Enter)"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        onClick={() => navigateMessageSearch('next')}
                        className="p-0.5 hover:bg-chat-hover rounded"
                        title="Next (Enter)"
                      >
                        <ChevronDown size={12} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setMessageSearchQuery('')}
                    className="p-0.5 hover:bg-chat-hover rounded ml-1"
                    title="Clear"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="ml-auto flex items-center gap-1">
            {/* Share button */}
            {currentConversationId && messages.length > 0 && (
              <ShareButton conversationId={currentConversationId} />
            )}

            {/* Export dropdown */}
            {messages.length > 0 && (
              <div className="relative group/export">
                <button
                  className="p-2 hover:bg-chat-hover rounded-lg transition-colors"
                  title="Export conversation"
                >
                  <Download size={20} className="text-chat-muted" />
                </button>
                <div className="absolute right-0 top-full mt-1 bg-chat-sidebar border border-chat-border rounded-lg shadow-xl py-1 min-w-[140px] opacity-0 invisible group-hover/export:opacity-100 group-hover/export:visible transition-all z-10">
                  <button
                    onClick={() => exportConversation('markdown')}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-chat-hover text-sm"
                  >
                    📝 Markdown
                  </button>
                  <button
                    onClick={() => exportConversation('json')}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-chat-hover text-sm"
                  >
                    📦 JSON
                  </button>
                </div>
              </div>
            )}

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 hover:bg-chat-hover rounded-lg transition-colors"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? (
                <Sun size={20} className="text-yellow-400" />
              ) : (
                <Moon size={20} className="text-chat-accent" />
              )}
            </button>
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
        <div className="flex-1 overflow-y-auto" ref={chatContainerRef}>
          {isLoadingMessages ? (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-chat-input/50" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-chat-input/50 rounded w-1/4" />
                      <div className="h-20 bg-chat-input/50 rounded-lg" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center px-4">
              <div className="max-w-lg text-center">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-chat-accent to-emerald-600 flex items-center justify-center glow-accent">
                  <Brain size={36} className="text-white" />
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
              {hasMoreMessages && (
                <div className="flex justify-center mb-6">
                  <button 
                    onClick={loadMoreMessages}
                    disabled={isLoadingMessages}
                    className="px-4 py-2 bg-chat-input hover:bg-chat-hover text-sm rounded-lg transition-colors border border-chat-border flex items-center gap-2 text-chat-muted hover:text-chat-accent"
                  >
                    {isLoadingMessages ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <ChevronUp size={16} />
                        Load older messages
                      </>
                    )}
                  </button>
                </div>
              )}
              {messages.map((message, index) => {
                const isSearchResult = messageSearchResults.includes(index);
                const isCurrentSearchResult = currentMessageSearchIndex >= 0 && messageSearchResults[currentMessageSearchIndex] === index;

                return (
                  <div
                    key={message.id}
                    ref={(el) => {
                      if (el) {
                        messageSearchRefs.current.set(message.id, el);
                      }
                    }}
                    data-message-index={index}
                    className={`group mb-6 animate-fade-in ${message.role === 'user' ? 'flex justify-end' : ''} ${isCurrentSearchResult ? 'ring-2 ring-chat-accent rounded-lg p-2 -m-2' : ''
                      } ${isSearchResult && messageSearchQuery ? 'opacity-100' : messageSearchQuery ? 'opacity-40' : ''}`}
                  >
                    {message.role === 'user' ? (
                      <div className="max-w-[85%]">
                        {/* Attachments */}
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-2 justify-end">
                            {message.attachments.map((att, idx) => (
                              <MessageAttachment
                                key={idx}
                                url={att.url}
                                filename={att.filename}
                                isImage={att.isImage}
                              />
                            ))}
                          </div>
                        )}
                        {editingMessageId === message.id ? (
                          <div className="space-y-2">
                            <textarea
                              ref={editTextareaRef}
                              value={editMessageContent}
                              onChange={(e) => setEditMessageContent(e.target.value)}
                              onKeyDown={(e) => handleEditKeyDown(e, message.id)}
                              className="w-full px-4 py-3 rounded-2xl bg-chat-input border border-chat-accent/50 focus:outline-none focus:ring-1 focus:ring-chat-accent resize-none"
                              autoFocus
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={cancelEditMessage}
                                className="px-3 py-1.5 text-sm rounded-lg hover:bg-chat-hover transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => submitEditMessage(message.id)}
                                disabled={!editMessageContent.trim() || isLoading}
                                className="px-3 py-1.5 text-sm rounded-lg bg-chat-accent hover:bg-chat-accent-hover disabled:opacity-50 transition-colors"
                              >
                                {isLoading ? 'Sending...' : 'Send'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative">
                            <div className="px-4 py-3 rounded-2xl bg-chat-accent/20 border border-chat-accent/30">
                              {message.content}
                            </div>
                            {/* Edit button for user messages */}
                            {message.created_at && (
                              <div className="text-xs text-chat-muted mt-1 text-right">
                                {formatTimestamp(message.created_at)}
                              </div>
                            )}
                            <div className="absolute -bottom-6 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                              <button
                                onClick={() => handleEditMessage(message)}
                                disabled={isLoading}
                                className="p-1.5 rounded-md hover:bg-chat-hover text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                                title="Edit message"
                              >
                                <Pencil size={14} />
                              </button>
                            </div>
                          </div>
                        )}
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
                            {message.isStreaming && !message.content ? (
                              <div className="flex items-center gap-1">
                                <div className="w-2 h-2 rounded-full bg-chat-accent typing-dot" />
                                <div className="w-2 h-2 rounded-full bg-chat-accent typing-dot" />
                                <div className="w-2 h-2 rounded-full bg-chat-accent typing-dot" />
                              </div>
                            ) : (
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
                            )}
                            {message.isStreaming && message.content && (
                              <span className="typing-cursor" />
                            )}
                          </div>
                          {message.created_at && (
                            <div className="text-xs text-chat-muted mt-1">
                              {formatTimestamp(message.created_at)}
                            </div>
                          )}
                          {/* Action buttons for assistant messages */}
                          {!message.isStreaming && message.content && (
                            <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                              <button
                                onClick={() => handleFeedback(message.id, message.feedback === 'thumbs_up' ? null : 'thumbs_up')}
                                className={`p-1.5 rounded-md hover:bg-chat-hover transition-colors ${message.feedback === 'thumbs_up'
                                  ? 'text-green-400 bg-green-400/10'
                                  : 'text-gray-400 hover:text-green-400'
                                  }`}
                                title="Thumbs up"
                              >
                                <ThumbsUp size={14} />
                              </button>
                              <button
                                onClick={() => handleFeedback(message.id, message.feedback === 'thumbs_down' ? null : 'thumbs_down')}
                                className={`p-1.5 rounded-md hover:bg-chat-hover transition-colors ${message.feedback === 'thumbs_down'
                                  ? 'text-red-400 bg-red-400/10'
                                  : 'text-gray-400 hover:text-red-400'
                                  }`}
                                title="Thumbs down"
                              >
                                <ThumbsDown size={14} />
                              </button>
                              <div className="w-px h-4 bg-chat-border mx-1" />
                              <button
                                onClick={() => copyMessage(message.content, message.id)}
                                className="p-1.5 rounded-md hover:bg-chat-hover text-gray-400 hover:text-white transition-colors"
                                title="Copy message"
                              >
                                {copiedMessageId === message.id ? (
                                  <CheckCheck size={14} className="text-green-400" />
                                ) : (
                                  <Copy size={14} />
                                )}
                              </button>
                              <button
                                onClick={() => regenerateResponse(index)}
                                disabled={isLoading}
                                className="p-1.5 rounded-md hover:bg-chat-hover text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                                title="Regenerate response"
                              >
                                <RefreshCw size={14} />
                              </button>
                              {typeof message.id === 'number' && (
                                <>
                                  <div className="w-px h-4 bg-chat-border mx-1" />
                                  <button
                                    onClick={() => handleEditMessage(message)}
                                    disabled={isLoading}
                                    className="p-1.5 rounded-md hover:bg-chat-hover text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                                    title="Edit message"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                          {/* Edit mode for assistant messages */}
                          {editingMessageId === message.id && typeof message.id === 'number' && (
                            <div className="mt-2 space-y-2">
                              <textarea
                                ref={editTextareaRef}
                                value={editMessageContent}
                                onChange={(e) => setEditMessageContent(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    submitEditMessage(message.id);
                                  } else if (e.key === 'Escape') {
                                    cancelEditMessage();
                                  }
                                }}
                                className="w-full px-4 py-3 rounded-lg bg-chat-input border border-chat-accent/50 focus:outline-none focus:ring-1 focus:ring-chat-accent resize-none"
                                autoFocus
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={cancelEditMessage}
                                  className="px-3 py-1.5 text-sm rounded-lg hover:bg-chat-hover transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => submitEditMessage(message.id)}
                                  disabled={!editMessageContent.trim() || isLoading}
                                  className="px-3 py-1.5 text-sm rounded-lg bg-chat-accent hover:bg-chat-accent-hover disabled:opacity-50 transition-colors"
                                >
                                  {isLoading ? 'Saving...' : 'Save'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="px-4 pb-6 pt-2">
          <div className="max-w-3xl mx-auto">
            {/* Pending attachments */}
            {pendingAttachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {pendingAttachments.map((file, idx) => (
                  <AttachmentPreview
                    key={idx}
                    file={file}
                    onRemove={() => setPendingAttachments(prev => prev.filter((_, i) => i !== idx))}
                  />
                ))}
              </div>
            )}

            <form 
              id="send-message-form"
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              className="relative flex items-center bg-chat-input rounded-2xl border border-chat-border focus-within:border-chat-accent/50 focus-within:ring-1 focus-within:ring-chat-accent/20 transition-all"
            >
              <div className="flex items-center self-stretch">
                <FileAttachmentButton
                  onFileUploaded={(file) => setPendingAttachments(prev => [...prev, file])}
                  disabled={isLoading}
                />
                <button
                  onClick={() => setTemplatesOpen(true)}
                  className="p-2.5 hover:bg-chat-hover rounded-lg transition-colors"
                  title="Templates"
                >
                  <FileText size={18} className="text-chat-muted" />
                </button>
              </div>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message MemoryLLM..."
                rows={1}
                disabled={isLoading}
                className="flex-1 bg-transparent py-4 resize-none focus:outline-none max-h-[200px] disabled:opacity-50"
              />
              <div className="flex items-center gap-1 m-2">
                <button
                  onClick={(e) => { e.preventDefault(); setVoiceMode(!voiceMode); }}
                  className={`p-2 rounded-lg transition-colors ${voiceMode ? 'text-chat-accent bg-chat-accent/10' : 'text-chat-muted hover:text-foreground hover:bg-chat-hover'}`}
                  title={voiceMode ? 'Disable Auto-TTS' : 'Enable Auto-TTS'}
                >
                  {voiceMode ? <Volume2 size={20} /> : <VolumeX size={20} />}
                </button>
                <VoiceInput
                  onTranscript={(text) => setInput(prev => prev + (prev ? ' ' : '') + text)}
                  disabled={isLoading}
                />
                <VoiceInput
                  isBrainDump={true}
                  onTranscript={(text) => {
                    const dumpText = `Please save this Brain Dump to a new Notion page:\n\n${text}`;
                    setInput(dumpText);
                    // Send it directly using a timeout to allow state to settle
                    setTimeout(() => {
                      const event = new Event('submit', { bubbles: true, cancelable: true });
                      document.getElementById('send-message-form')?.dispatchEvent(event);
                    }, 100);
                  }}
                  disabled={isLoading}
                />
                <button
                  onClick={sendMessage}
                  disabled={(!input.trim() && pendingAttachments.length === 0) || isLoading}
                  className="p-2.5 rounded-xl bg-chat-accent disabled:opacity-40 disabled:cursor-not-allowed hover:bg-chat-accent-hover transition-all duration-200 hover:scale-105 active:scale-95"
                >
                  {isLoading ? (
                    <Loader2 size={18} className="text-white animate-spin" />
                  ) : (
                    <Send size={18} className="text-white" />
                  )}
                </button>
              </div>
            </form>
            <p className="text-center text-xs text-chat-muted mt-3">
              MemoryLLM uses Notion as persistent memory.
              <span className="hidden sm:inline"> Press <kbd className="px-1 py-0.5 mx-0.5 rounded bg-chat-hover text-[10px]">⌘K</kbd> for new chat, <kbd className="px-1 py-0.5 mx-0.5 rounded bg-chat-hover text-[10px]">/</kbd> to focus.</span>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
