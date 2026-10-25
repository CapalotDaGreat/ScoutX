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
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '8px',
        '2xl': '8px',
        '3xl': '8px',
      },
      fontFamily: {
        sans: ['Inter_400Regular', 'System'],
        'sans-medium': ['Inter_500Medium', 'System'],
        'sans-semibold': ['Inter_600SemiBold', 'System'],
        'sans-bold': ['Inter_700Bold', 'System'],
      },
      fontSize: {
        'display-xl': ['40px', { lineHeight: '48px', letterSpacing: '0' }],
        'display-lg': ['32px', { lineHeight: '40px', letterSpacing: '0' }],
        'heading-1': ['26px', { lineHeight: '34px', letterSpacing: '0' }],
        'heading-2': ['21px', { lineHeight: '28px', letterSpacing: '0' }],
        'heading-3': ['18px', { lineHeight: '26px', letterSpacing: '0' }],
        'body-lg': ['17px', { lineHeight: '26px' }],
        body: ['15px', { lineHeight: '24px' }],
        'body-sm': ['13px', { lineHeight: '20px', letterSpacing: '0' }],
        label: ['13px', { lineHeight: '18px', letterSpacing: '0' }],
        caption: ['12px', { lineHeight: '16px', letterSpacing: '0' }],
        overline: ['11px', { lineHeight: '14px', letterSpacing: '0' }],
        'stat-xl': ['34px', { lineHeight: '42px', letterSpacing: '0' }],
        'stat-lg': ['24px', { lineHeight: '30px', letterSpacing: '0' }],
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
