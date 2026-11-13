/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./App.tsx', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--color-primary)',
          foreground: 'var(--color-primary-foreground)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          foreground: 'var(--color-accent-foreground)',
          muted: 'var(--color-accent-muted)',
        },
        gold: {
          DEFAULT: 'var(--color-gold)',
          foreground: 'var(--color-gold-foreground)',
          muted: 'var(--color-gold-muted)',
        },
        background: {
          DEFAULT: 'var(--color-background)',
          secondary: 'var(--color-background-secondary)',
        },
        surface: {
          DEFAULT: 'var(--color-surface)',
          elevated: 'var(--color-surface-elevated)',
          cool: 'var(--color-surface-cool)',
        },
        foreground: {
          DEFAULT: 'var(--color-foreground)',
          secondary: 'var(--color-foreground-secondary)',
          tertiary: 'var(--color-foreground-tertiary)',
          inverse: 'var(--color-foreground-inverse)',
        },
        border: {
          DEFAULT: 'var(--color-border)',
          strong: 'var(--color-border-strong)',
        },
        divider: 'var(--color-divider)',
        success: {
          DEFAULT: 'var(--color-success)',
          muted: 'var(--color-success-muted)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          muted: 'var(--color-warning-muted)',
        },
        error: {
          DEFAULT: 'var(--color-error)',
          muted: 'var(--color-error-muted)',
        },
        info: {
          DEFAULT: 'var(--color-info)',
          muted: 'var(--color-info-muted)',
        },
        pitch: {
          DEFAULT: 'var(--color-pitch)',
          raised: 'var(--color-pitch-raised)',
          foreground: 'var(--color-on-pitch)',
          muted: 'var(--color-on-pitch-muted)',
        },
        highlight: {
          DEFAULT: 'var(--color-highlight)',
          foreground: 'var(--color-highlight-foreground)',
        },
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '18px',
        '2xl': '22px',
        '3xl': '22px',
      },
      fontFamily: {
        sans: ['Inter_400Regular', 'System'],
        'sans-medium': ['Inter_500Medium', 'System'],
        'sans-semibold': ['Inter_600SemiBold', 'System'],
        'sans-bold': ['Inter_700Bold', 'System'],
        // Display face for screen titles, names and scoreboard numerals only.
        display: ['BarlowCondensed_700Bold', 'Inter_700Bold', 'System'],
        'display-semibold': ['BarlowCondensed_600SemiBold', 'Inter_600SemiBold', 'System'],
      },
      fontSize: {
        'display-xl': ['40px', { lineHeight: '48px', letterSpacing: '0' }],
        'display-lg': ['32px', { lineHeight: '40px', letterSpacing: '0' }],
        'heading-1': ['32px', { lineHeight: '36px', letterSpacing: '0' }],
        'heading-2': ['20px', { lineHeight: '26px', letterSpacing: '0' }],
        'heading-3': ['17px', { lineHeight: '24px', letterSpacing: '0' }],
        'body-lg': ['17px', { lineHeight: '26px' }],
        body: ['15px', { lineHeight: '23px' }],
        'body-sm': ['14px', { lineHeight: '20px', letterSpacing: '0' }],
        label: ['14px', { lineHeight: '18px', letterSpacing: '0' }],
        caption: ['12.5px', { lineHeight: '17px', letterSpacing: '0' }],
        overline: ['12px', { lineHeight: '16px', letterSpacing: '0.4px' }],
        'stat-xl': ['40px', { lineHeight: '42px', letterSpacing: '0' }],
        'stat-lg': ['28px', { lineHeight: '30px', letterSpacing: '0' }],
        'stat-sm': ['15px', { lineHeight: '20px' }],
      },
      spacing: {
        0.5: '2px',
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        5: '20px',
        6: '24px',
        8: '32px',
        10: '40px',
        12: '48px',
        16: '64px',
        20: '80px',
      },
    },
  },
  plugins: [],
};
