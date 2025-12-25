/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Primary colors
        primary: {
          DEFAULT: '#2563EB', 
          hover: '#1d4ed8',
        },
        secondary: {
          DEFAULT: '#6366F1',
          hover: '#4f46e5',
        },
        // Background colors
        bg: {
          light: '#F8FAFC',
          dark: '#020617',
        },
        // Card colors
        card: {
          light: '#FFFFFF',
          dark: '#0F172A',
        },
        // Text colors
        text: {
          primary: {
            light: '#0F172A',
            dark: '#E5E7EB',
          },
          secondary: {
            light: '#64748B',
            dark: '#94A3B8',
          },
        },
        // Status colors
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',
        // Border colors
        border: {
          light: '#E2E8F0',
          dark: '#1e293b',
        },
        // Legacy brand colors for compatibility
        brand: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        }
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pop: {
          '0%': { transform: 'scale(0.98)' },
          '100%': { transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 400ms ease-out both',
        'slide-up': 'slideUp 450ms ease-out both',
        'pop': 'pop 150ms ease-out both',
        'shimmer': 'shimmer 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
