'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, User, Mail, AtSign, Lock, Trash2, 
  Loader2, Check, AlertCircle, Eye, EyeOff, BookOpen, ExternalLink
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { userApi, ApiClientError } from '@/lib/api';

export default function SettingsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated, logout, refreshUser } = useAuth();
  
  // Profile form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState('');
  
  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  
  // Notion integration
  const [notionApiKey, setNotionApiKey] = useState('');
  const [showNotionKey, setShowNotionKey] = useState(false);
  const [notionLoading, setNotionLoading] = useState(false);
  const [notionSuccess, setNotionSuccess] = useState(false);
  const [notionError, setNotionError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  // Delete account
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/auth/login');
    }
  }, [authLoading, isAuthenticated, router]);

  // Load user data
  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setUsername(user.username);
      // Reset API key field - we can't show the actual encrypted key
      // User needs to enter a new key to update, or leave empty to remove
      setNotionApiKey('');
      setShowNotionKey(false);
    }
  }, [user]);

  const handleProfileSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess(false);
    setProfileLoading(true);

    try {
      const updates: { name?: string; email?: string; username?: string } = {};
      if (name !== user?.name) updates.name = name;
      if (email !== user?.email) updates.email = email;
      if (username !== user?.username) updates.username = username;

      if (Object.keys(updates).length === 0) {
        setProfileError('No changes to save');
        return;
      }

      await userApi.updateProfile(updates);
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (e) {
      setProfileError(e instanceof ApiClientError ? e.message : 'Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    setPasswordLoading(true);

    try {
      await userApi.changePassword(currentPassword, newPassword);
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (e) {
      setPasswordError(e instanceof ApiClientError ? e.message : 'Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleNotionSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setNotionError('');
    setNotionSuccess(false);
    
    const trimmedKey = notionApiKey.trim();
    
    // If empty, remove the integration
    if (!trimmedKey) {
      setNotionLoading(true);
      try {
        await userApi.updateNotionApiKey(null);
        setNotionSuccess(true);
        setNotionApiKey('');
        
        // Refresh user data to update notion_api_key_configured status
        await refreshUser();
        
        setTimeout(() => setNotionSuccess(false), 5000);
      } catch (e) {
        setNotionError(e instanceof ApiClientError ? e.message : 'Failed to remove Notion integration');
      } finally {
        setNotionLoading(false);
      }
      return;
    }

    // Validate and save the key
    setIsValidating(true);
    setNotionLoading(true);

    try {
      // First validate the key
      const validation = await userApi.validateNotionApiKey(trimmedKey);
      
      if (!validation.valid) {
        setNotionError(validation.message);
        setIsValidating(false);
        setNotionLoading(false);
        return;
      }

      // Key is valid, now save it
      const result = await userApi.updateNotionApiKey(trimmedKey);
      setNotionSuccess(true);
      setNotionApiKey(''); // Clear the field after successful save
      setShowNotionKey(false);
      
      // Refresh user data to update notion_api_key_configured status
      await refreshUser();
      
      // Keep success message visible longer
      setTimeout(() => setNotionSuccess(false), 5000);
    } catch (e) {
      if (e instanceof ApiClientError) {
        setNotionError(e.message);
      } else {
        setNotionError('Failed to update Notion API key. Please try again.');
      }
    } finally {
      setIsValidating(false);
      setNotionLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    try {
      await userApi.deleteAccount();
      logout();
      router.push('/auth/login');
    } catch (e) {
      setProfileError(e instanceof ApiClientError ? e.message : 'Failed to delete account');
      setShowDeleteConfirm(false);
    } finally {
      setDeleteLoading(false);
    }
  };

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
    <div className="min-h-screen bg-chat-bg">
      {/* Header */}
      <header className="border-b border-chat-border">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="p-2 hover:bg-chat-hover rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-xl font-semibold">Settings</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
        {/* Profile Section */}
        <section className="bg-chat-sidebar rounded-xl border border-chat-border p-6">
          <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <User size={20} className="text-chat-accent" />
            Profile
          </h2>

          {profileError && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2">
              <AlertCircle size={16} className="text-red-400" />
              <span className="text-red-400 text-sm">{profileError}</span>
            </div>
          )}

          {profileSuccess && (
            <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-2">
              <Check size={16} className="text-green-400" />
              <span className="text-green-400 text-sm">Profile updated successfully!</span>
            </div>
          )}

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <User size={14} className="text-chat-muted" />
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-chat-input border border-chat-border focus:border-chat-accent focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <Mail size={14} className="text-chat-muted" />
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-chat-input border border-chat-border focus:border-chat-accent focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <AtSign size={14} className="text-chat-muted" />
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-chat-input border border-chat-border focus:border-chat-accent focus:outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={profileLoading}
              className="px-6 py-2.5 rounded-lg bg-chat-accent hover:bg-chat-accent-hover disabled:opacity-50 font-medium transition-colors flex items-center gap-2"
            >
              {profileLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </form>
        </section>

        {/* Notion Integration Section */}
        <section className="bg-chat-sidebar rounded-xl border border-chat-border p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <BookOpen size={20} className="text-chat-accent" />
              Notion Integration
            </h2>
            {user?.notion_api_key_configured && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-green-400 text-sm font-medium">Connected</span>
              </div>
            )}
          </div>

          <p className="text-chat-muted text-sm mb-6">
            Connect your Notion workspace to enable the AI to read and write to your Notion pages. 
            We use <strong>Internal Integration tokens</strong> (not OAuth) - each user provides their own token.
            Your API key is encrypted and stored securely in your account.
          </p>

          {/* Connection Status */}
          {user?.notion_api_key_configured && (
            <div className="mb-4 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <div className="flex items-start gap-3">
                <Check size={18} className="text-green-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-green-400 text-sm font-medium mb-1">Notion Memory Active</p>
                  <p className="text-chat-muted text-xs">
                    Your Notion integration is connected and ready. The AI can now read from and write to your Notion pages.
                  </p>
                </div>
              </div>
            </div>
          )}

          {notionError && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2">
              <AlertCircle size={16} className="text-red-400" />
              <span className="text-red-400 text-sm">{notionError}</span>
            </div>
          )}

          {notionSuccess && (
            <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-2">
              <Check size={16} className="text-green-400" />
              <span className="text-green-400 text-sm">
                {user?.notion_api_key_configured 
                  ? 'Notion API key updated and connected successfully!' 
                  : 'Notion API key validated and connected successfully!'}
              </span>
            </div>
          )}

          {/* Step-by-step Guide */}
          <div className="mb-6 p-4 rounded-lg bg-chat-input border border-chat-border">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <BookOpen size={16} className="text-chat-accent" />
              How to get your Notion API Key
            </h3>
            <ol className="space-y-3 text-sm text-chat-muted">
              <li className="flex gap-3">
                <span className="font-semibold text-chat-accent shrink-0 w-6">1.</span>
                <span>
                  Go to{' '}
                  <a
                    href="https://www.notion.so/my-integrations"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-chat-accent hover:text-chat-accent-hover underline inline-flex items-center gap-1"
                  >
                    Notion Integrations
                    <ExternalLink size={12} />
                  </a>
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-semibold text-chat-accent shrink-0 w-6">2.</span>
                <span>Click <strong>"+ New integration"</strong> or select an existing integration</span>
              </li>
              <li className="flex gap-3">
                <span className="font-semibold text-chat-accent shrink-0 w-6">3.</span>
                <span>Give it a name (e.g., "MemoryLLM") and select your workspace</span>
              </li>
              <li className="flex gap-3">
                <span className="font-semibold text-chat-accent shrink-0 w-6">4.</span>
                <span>Copy the <strong>"Internal Integration Token"</strong> (starts with <code className="px-1 py-0.5 rounded bg-chat-hover text-xs">secret_</code> or <code className="px-1 py-0.5 rounded bg-chat-hover text-xs">ntn_</code>)</span>
              </li>
              <li className="flex gap-3">
                <span className="font-semibold text-chat-accent shrink-0 w-6">5.</span>
                <span>
                  <strong>Important:</strong> Share the pages you want the AI to access with your integration. 
                  Click the <strong>"..."</strong> menu on any Notion page → <strong>"Add connections"</strong> → Select your integration
                </span>
              </li>
              <li className="flex gap-3">
                <span className="font-semibold text-chat-accent shrink-0 w-6">6.</span>
                <span>Paste the token below and click "Connect Notion"</span>
              </li>
            </ol>
          </div>

          <form onSubmit={handleNotionSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <BookOpen size={14} className="text-chat-muted" />
                Notion API Key (Internal Integration Token)
              </label>
              <div className="relative">
                <input
                  type={showNotionKey ? 'text' : 'password'}
                  value={notionApiKey}
                  onChange={(e) => {
                    setNotionApiKey(e.target.value);
                    setNotionError('');
                    setNotionSuccess(false);
                  }}
                  placeholder={user?.notion_api_key_configured ? 'Enter new key to update (current key is encrypted)' : 'secret_... or ntn_...'}
                  className="w-full px-4 py-3 pr-12 rounded-lg bg-chat-input border border-chat-border focus:border-chat-accent focus:outline-none transition-colors font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowNotionKey(!showNotionKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-chat-muted hover:text-foreground transition-colors"
                >
                  {showNotionKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-xs text-chat-muted mt-2">
                {user?.notion_api_key_configured 
                  ? 'Enter a new key to update, or leave empty and submit to remove your Notion integration'
                  : 'Your API key will be encrypted and stored securely. Leave empty to remove integration.'}
              </p>
            </div>

            <button
              type="submit"
              disabled={notionLoading}
              className="px-6 py-2.5 rounded-lg bg-chat-accent hover:bg-chat-accent-hover disabled:opacity-50 font-medium transition-colors flex items-center gap-2"
            >
              {notionLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {isValidating ? 'Validating...' : 'Saving...'}
                </>
              ) : (
                user?.notion_api_key_configured ? 'Update API Key' : 'Connect Notion'
              )}
            </button>
          </form>
        </section>

        {/* Password Section */}
        <section className="bg-chat-sidebar rounded-xl border border-chat-border p-6">
          <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <Lock size={20} className="text-chat-accent" />
            Change Password
          </h2>

          {passwordError && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2">
              <AlertCircle size={16} className="text-red-400" />
              <span className="text-red-400 text-sm">{passwordError}</span>
            </div>
          )}

          {passwordSuccess && (
            <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-2">
              <Check size={16} className="text-green-400" />
              <span className="text-green-400 text-sm">Password changed successfully!</span>
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Current Password</label>
              <div className="relative">
                <input
                  type={showPasswords ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 rounded-lg bg-chat-input border border-chat-border focus:border-chat-accent focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(!showPasswords)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-chat-muted hover:text-foreground transition-colors"
                >
                  {showPasswords ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">New Password</label>
              <input
                type={showPasswords ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-chat-input border border-chat-border focus:border-chat-accent focus:outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Confirm New Password</label>
              <input
                type={showPasswords ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-chat-input border border-chat-border focus:border-chat-accent focus:outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={passwordLoading || !currentPassword || !newPassword}
              className="px-6 py-2.5 rounded-lg bg-chat-accent hover:bg-chat-accent-hover disabled:opacity-50 font-medium transition-colors flex items-center gap-2"
            >
              {passwordLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Changing...
                </>
              ) : (
                'Change Password'
              )}
            </button>
          </form>
        </section>

        {/* Danger Zone */}
        <section className="bg-chat-sidebar rounded-xl border border-red-500/30 p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-red-400">
            <Trash2 size={20} />
            Danger Zone
          </h2>
          <p className="text-chat-muted text-sm mb-4">
            Once you delete your account, there is no going back. All your conversations and data will be permanently deleted.
          </p>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Delete Account
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium transition-colors flex items-center gap-2"
              >
                {deleteLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Yes, Delete My Account'
                )}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-lg hover:bg-chat-hover transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

