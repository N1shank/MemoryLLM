/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        'chat-bg': 'var(--background)',
        'chat-sidebar': 'var(--sidebar)',
        'chat-input': 'var(--input)',
        'chat-hover': 'var(--hover)',
        'chat-border': 'var(--border)',
        'chat-accent': 'var(--accent)',
        'chat-accent-hover': 'var(--accent-hover)',
        'chat-muted': 'var(--muted)',
      },
    },
  },
  plugins: [],
};
