export class ApiClientError extends Error {
  status: number;
  data: any;
  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.data = data;
  }
  
  get isUnauthorized() {
    return this.status === 401;
  }
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
let currentToken = '';

export function getAuthToken() {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('token') || currentToken;
  }
  return currentToken;
}

export function setAuthToken(token: string, refreshToken?: string) {
  currentToken = token;
  if (typeof window !== 'undefined') {
    localStorage.setItem('token', token);
    if (refreshToken) {
      localStorage.setItem('refreshToken', refreshToken);
    }
  }
}

export function clearAuthToken() {
  currentToken = '';
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  }
}

export function getStoredUser() {
  if (typeof window !== 'undefined') {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        return JSON.parse(userStr);
      } catch (e) {
        return null;
      }
    }
  }
  return null;
}

export function setStoredUser(user: any) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('user', JSON.stringify(user));
  }
}

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach(cb => cb(token));
  refreshSubscribers = [];
}

async function request(endpoint: string, options: RequestInit = {}) {
  const token = getAuthToken();
  const headers = new Headers(options.headers);
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    let response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401 && typeof window !== 'undefined') {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        if (!isRefreshing) {
          isRefreshing = true;
          try {
            const refreshRes = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refresh_token: refreshToken })
            });
            
            if (refreshRes.ok) {
              const data = await refreshRes.json();
              setAuthToken(data.access_token, data.refresh_token);
              setStoredUser(data.user);
              onRefreshed(data.access_token);
              
              // Retry original request
              headers.set('Authorization', `Bearer ${data.access_token}`);
              response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
            } else {
              clearAuthToken();
              window.location.href = '/auth/login';
            }
          } catch (e) {
            clearAuthToken();
            window.location.href = '/auth/login';
          } finally {
            isRefreshing = false;
          }
        } else {
          return new Promise((resolve) => {
            subscribeTokenRefresh(async (newToken) => {
              headers.set('Authorization', `Bearer ${newToken}`);
              resolve(await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers }));
            });
          });
        }
      } else {
        clearAuthToken();
        if (window.location.pathname !== '/auth/login') {
          window.location.href = '/auth/login';
        }
      }
    }

    if (!response.ok) {
      let data;
      try {
        data = await response.json();
      } catch (e) {
        data = { detail: response.statusText };
      }
      throw new ApiClientError(data.detail || 'API request failed', response.status, data);
    }

    // Return response directly for stream
    if (options.headers && new Headers(options.headers).get('Accept') === 'text/event-stream') {
      return response;
    }

    // Handle 204 No Content
    if (response.status === 204) return null;
    
    return await response.json();
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    throw new ApiClientError(error instanceof Error ? error.message : 'Unknown error', 500);
  }
}

// Auth API
export const authApi = {
  login: (data: any) => request('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  signup: (data: any) => request('/api/v1/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
  getMe: () => request('/api/v1/auth/me'),
};

// Types
export interface User { id: number; name: string; email: string; username: string; notion_api_key_configured: boolean; notion_pages?: any[]; }
export interface Conversation { id: number; title: string; folder_id: number | null; is_pinned?: boolean; is_archived?: boolean; tags?: string[]; created_at: string; updated_at: string; messages: any[]; }
export interface UploadedFile { id: number; filename: string; original_name?: string; is_image?: boolean; file_size: number; size?: number; content_type: string; created_at: string; url?: string; }
export interface Template { id: number; title: string; content: string; variables: string[]; created_at: string; updated_at: string; }
export interface Folder { id: number; name: string; conversation_count?: number; created_at: string; updated_at: string; }
export interface SharedConversation { token: string; title: string; messages: any[]; created_at: string; expires_at?: string; }
export interface ShareStatus { is_shared: boolean; share_token?: string; share_url?: string; expires_at?: string; }

// Conversations API
export const conversationsApi = {
  list: () => request('/api/v1/conversations'),
  get: (id: number) => request(`/api/v1/conversations/${id}`),
  create: (data: any) => request('/api/v1/conversations', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, title: string) => request(`/api/v1/conversations/${id}`, { method: 'PUT', body: JSON.stringify({ title }) }),
  delete: (id: number) => request(`/api/v1/conversations/${id}`, { method: 'DELETE' }),
  updateFolder: (id: number, folder_id: number | null) => request(`/api/v1/conversations/${id}/folder`, { method: 'PUT', body: JSON.stringify({ folder_id }) }),
  updateTags: (id: number, tags: string[]) => request(`/api/v1/conversations/${id}/tags`, { method: 'PUT', body: JSON.stringify({ tags }) }),
  togglePin: (id: number, is_pinned: boolean) => request(`/api/v1/conversations/${id}/pin`, { method: 'PUT', body: JSON.stringify({ is_pinned }) }),
  toggleArchive: (id: number, is_archived: boolean) => request(`/api/v1/conversations/${id}/archive`, { method: 'PUT', body: JSON.stringify({ is_archived }) }),
};

// Chat API
export const chatApi = {
  async *sendStream(content: string, conversationId?: number, files: number[] = []) {
    const token = getAuthToken();
    const url = new URL(`${API_BASE_URL}/api/v1/chat/stream`);
    if (conversationId) url.searchParams.append('conversation_id', conversationId.toString());
    files.forEach(f => url.searchParams.append('file_ids', f.toString()));
    url.searchParams.append('content', content);

    const headers = new Headers({ 'Accept': 'text/event-stream' });
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const response = await fetch(url.toString(), { headers });
    
    if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
    }

    if (!response.body) throw new Error('No response body');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            yield data;
          } catch (e) {
            // Ignore parse errors on partial streams
          }
        }
      }
    }
  },
  editMessage: (messageId: number, content: string) => request(`/api/v1/chat/messages/${messageId}`, { method: 'PUT', body: JSON.stringify({ content }) }),
  updateFeedback: (messageId: number, feedback: string | null) => request(`/api/v1/chat/messages/${messageId}/feedback`, { method: 'PUT', body: JSON.stringify({ feedback }) }),
  regenerate: (conversationId: number) => request(`/api/v1/chat/conversations/${conversationId}/regenerate`, { method: 'POST' })
};

// Folders API
export const foldersApi = {
  list: () => request('/api/v1/folders'),
  create: (name: string) => request('/api/v1/folders', { method: 'POST', body: JSON.stringify({ name }) }),
  update: (id: number, data: any) => request(`/api/v1/folders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request(`/api/v1/folders/${id}`, { method: 'DELETE' }),
};

// Templates API
export const templatesApi = {
  list: () => request('/api/v1/templates'),
  create: (title: string, content: string) => request('/api/v1/templates', { method: 'POST', body: JSON.stringify({ title, content }) }),
  update: (id: number, data: any) => request(`/api/v1/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request(`/api/v1/templates/${id}`, { method: 'DELETE' }),
};

// Drafts API
export const draftsApi = {
  list: () => request('/api/v1/drafts'),
  createOrUpdate: (conversation_id: number, content: string) => request('/api/v1/drafts', { method: 'POST', body: JSON.stringify({ conversation_id, content }) }),
  createGlobal: (content: string) => request('/api/v1/drafts/global', { method: 'POST', body: JSON.stringify({ content }) }),
  getForConversation: (conversation_id: number) => request(`/api/v1/drafts/conversation/${conversation_id}`),
  update: (id: number, data: any) => request(`/api/v1/drafts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request(`/api/v1/drafts/${id}`, { method: 'DELETE' }),
  deleteForConversation: (conversationId: number) => request(`/api/v1/drafts/conversation/${conversationId}`, { method: 'DELETE' }),
};

// Share API
export const shareApi = {
  create: (conversationId: number, data: any) => request(`/api/v1/share/conversations/${conversationId}`, { method: 'POST', body: JSON.stringify(data) }),
  getStatus: (conversationId: number) => request(`/api/v1/share/conversations/${conversationId}/status`),
  get: (token: string) => request(`/api/v1/share/${token}`),
  toggleSharing: (conversationId: number) => request(`/api/v1/share/conversations/${conversationId}/toggle`, { method: 'POST' }),
};

// Files API
export const filesApi = {
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return request('/api/v1/files/upload', { method: 'POST', body: formData });
  },
  delete: (id: number) => request(`/api/v1/files/${id}`, { method: 'DELETE' }),
};

// User API
export const userApi = {
  getSettings: () => request('/api/v1/users/me/settings'),
  updateSettings: (data: any) => request('/api/v1/users/me/settings', { method: 'PATCH', body: JSON.stringify(data) }),
  updateProfile: (data: any) => request('/api/v1/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
  changePassword: (current_password: string, new_password: string) => request('/api/v1/users/me/password', { method: 'POST', body: JSON.stringify({ current_password, new_password }) }),
  updateNotionApiKey: (api_key: string | null) => request('/api/v1/users/me/notion-api-key', { method: 'POST', body: JSON.stringify({ api_key }) }),
  validateNotionApiKey: (api_key: string) => request('/api/v1/users/me/notion-api-key/validate', { method: 'POST', body: JSON.stringify({ api_key }) }),
  deleteAccount: () => request('/api/v1/users/me', { method: 'DELETE' }),
  updateNotionPages: (pages: any[]) => request('/api/v1/users/me/notion-pages', { method: 'POST', body: JSON.stringify({ pages }) }),
};

// Notion API
export const notionApi = {
  search: () => request('/api/v1/notion/search', { method: 'POST' }),
};
