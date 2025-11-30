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
        sans: ['var(--font-geist)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      colors: {
        'chat-bg': '#0d0d0d',
        'chat-sidebar': '#171717',
        'chat-input': '#2f2f2f',
        'chat-hover': '#212121',
        'chat-border': '#3f3f3f',
        'chat-accent': '#10a37f',
      },
    },
  },
  plugins: [],
};

