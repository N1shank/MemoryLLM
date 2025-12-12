/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        'chat-bg': '#0a0a0b',
        'chat-sidebar': '#111113',
        'chat-input': '#1a1a1d',
        'chat-hover': '#1f1f23',
        'chat-border': '#2a2a2d',
        'chat-accent': '#8b5cf6',
        'chat-accent-hover': '#7c3aed',
      },
    },
  },
  plugins: [],
};
