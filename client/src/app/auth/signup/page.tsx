'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, EyeOff, Brain, Loader2, AlertCircle, Check } from 'lucide-react';

export default function SignupPage() {
  const router = useRouter();
  const { signup, error, clearError, isLoading } = useAuth();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError('');
    clearError();

    // Validation
    if (!name.trim() || !email.trim() || !username.trim() || !password.trim()) {
      setLocalError('Please fill in all fields');
      return;
    }

    if (username.length < 3) {
      setLocalError('Username must be at least 3 characters');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setLocalError('Username can only contain letters, numbers, and underscores');
      return;
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }

    try {
      await signup(name, email, username, password);
      router.push('/');
    } catch {
      // Error is handled by context
    }
  };

  const displayError = localError || error;

  // Password strength indicators
  const hasMinLength = password.length >= 6;
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  return (
    <div className="min-h-screen flex items-center justify-center bg-chat-bg px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-chat-accent to-emerald-600 flex items-center justify-center">
            <Brain size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="text-gray-400 mt-2">Start using MemoryLLM today</p>
        </div>

        {/* Error Alert */}
        {displayError && (
          <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
            <AlertCircle size={20} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-red-400 text-sm">{displayError}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
              Full Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-chat-input border border-chat-border focus:border-chat-accent focus:outline-none focus:ring-1 focus:ring-chat-accent transition-colors"
              placeholder="John Doe"
              disabled={isLoading}
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-chat-input border border-chat-border focus:border-chat-accent focus:outline-none focus:ring-1 focus:ring-chat-accent transition-colors"
              placeholder="john@example.com"
              disabled={isLoading}
            />
          </div>

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-2">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-chat-input border border-chat-border focus:border-chat-accent focus:outline-none focus:ring-1 focus:ring-chat-accent transition-colors"
              placeholder="johndoe"
              disabled={isLoading}
            />
            <p className="text-xs text-gray-500 mt-1">Letters, numbers, and underscores only</p>
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 pr-12 rounded-lg bg-chat-input border border-chat-border focus:border-chat-accent focus:outline-none focus:ring-1 focus:ring-chat-accent transition-colors"
                placeholder="••••••••"
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            
            {/* Password strength */}
            {password && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <Check size={14} className={hasMinLength ? 'text-green-400' : 'text-gray-500'} />
                  <span className={hasMinLength ? 'text-green-400' : 'text-gray-500'}>
                    At least 6 characters
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Check size={14} className={hasUppercase ? 'text-green-400' : 'text-gray-500'} />
                  <span className={hasUppercase ? 'text-green-400' : 'text-gray-500'}>
                    Contains uppercase letter (recommended)
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Check size={14} className={hasNumber ? 'text-green-400' : 'text-gray-500'} />
                  <span className={hasNumber ? 'text-green-400' : 'text-gray-500'}>
                    Contains number (recommended)
                  </span>
                </div>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-chat-input border border-chat-border focus:border-chat-accent focus:outline-none focus:ring-1 focus:ring-chat-accent transition-colors"
              placeholder="••••••••"
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-lg bg-chat-accent hover:bg-chat-accent/90 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors flex items-center justify-center gap-2 mt-6"
          >
            {isLoading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                Creating account...
              </>
            ) : (
              'Create account'
            )}
          </button>
        </form>

        {/* Sign in link */}
        <p className="text-center text-gray-400 mt-6">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-chat-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

