/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#090d16',
          panel: '#0d1117',
          card: '#161b22',
          header: '#21262d',
          subtle: '#1c2128',
        },
        border: {
          subtle: '#30363d',
          glow: '#58a6ff',
        },
        text: {
          primary: '#c9d1d9',
          secondary: '#8b949e',
          muted: '#484f58',
          bright: '#f0f6fc',
        },
        accent: {
          indigo: '#6366f1',
          cyan: '#58a6ff',
          purple: '#bc8cff',
          emerald: '#3fb950',
          rose: '#f85149',
          amber: '#d29922',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

