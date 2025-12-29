'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  ArrowLeft, User, Mail, AtSign, Lock, Trash2, 
  Loader2, Check, AlertCircle, Eye, EyeOff, BookOpen, ExternalLink
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { userApi, ApiClientError, setStoredUser } from '@/lib/api';

export default function SettingsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  
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
      // Don't load the actual API key, just show placeholder if configured
      if (user.notion_api_key_configured) {
        setNotionApiKey('••••••••••••••••');
      }
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
    setNotionLoading(true);

    try {
      // If the field shows the masked value, treat it as "no change"
      if (notionApiKey === '••••••••••••••••') {
        setNotionError('Please enter a new API key or leave empty to remove');
        return;
      }

      await userApi.updateNotionApiKey(notionApiKey.trim() || null);
      setNotionSuccess(true);
      if (!notionApiKey.trim()) {
        setNotionApiKey('');
      } else {
        setNotionApiKey('••••••••••••••••');
      }
      setTimeout(() => setNotionSuccess(false), 3000);
      
      // Refresh user data to update notion_api_key_configured status
      const updatedUser = await userApi.getProfile();
      setStoredUser(updatedUser);
    } catch (e) {
      setNotionError(e instanceof ApiClientError ? e.message : 'Failed to update Notion API key');
    } finally {
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
          <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
            <BookOpen size={20} className="text-chat-accent" />
            Notion Integration
          </h2>

          <p className="text-chat-muted text-sm mb-4">
            Connect your Notion workspace to enable the AI to read and write to your Notion pages. 
            Your API key is encrypted and stored securely.
          </p>

          {notionError && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2">
              <AlertCircle size={16} className="text-red-400" />
              <span className="text-red-400 text-sm">{notionError}</span>
            </div>
          )}

          {notionSuccess && (
            <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-2">
              <Check size={16} className="text-green-400" />
              <span className="text-green-400 text-sm">Notion API key updated successfully!</span>
            </div>
          )}

          <form onSubmit={handleNotionSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                <BookOpen size={14} className="text-chat-muted" />
                Notion API Key
              </label>
              <div className="relative">
                <input
                  type={showNotionKey ? 'text' : 'password'}
                  value={notionApiKey}
                  onChange={(e) => {
                    setNotionApiKey(e.target.value);
                    setNotionError('');
                  }}
                  placeholder={user?.notion_api_key_configured ? 'Enter new key to update' : 'Enter your Notion API key'}
                  className="w-full px-4 py-3 pr-12 rounded-lg bg-chat-input border border-chat-border focus:border-chat-accent focus:outline-none transition-colors"
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
                Leave empty to remove your Notion integration
              </p>
            </div>

            <div className="flex items-center gap-2 text-sm text-chat-muted">
              <a
                href="https://www.notion.so/my-integrations"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-chat-accent hover:text-chat-accent-hover transition-colors"
              >
                Get your Notion API key
                <ExternalLink size={14} />
              </a>
            </div>

            <button
              type="submit"
              disabled={notionLoading}
              className="px-6 py-2.5 rounded-lg bg-chat-accent hover:bg-chat-accent-hover disabled:opacity-50 font-medium transition-colors flex items-center gap-2"
            >
              {notionLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Saving...
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

