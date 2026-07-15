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
        background: {
          DEFAULT: 'var(--color-background)',
          secondary: 'var(--color-background-secondary)',
        },
        surface: {
          DEFAULT: 'var(--color-surface)',
          elevated: 'var(--color-surface-elevated)',
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
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '20px',
        '2xl': '28px',
      },
      fontFamily: {
        sans: ['Inter_400Regular', 'System'],
        'sans-medium': ['Inter_500Medium', 'System'],
        'sans-semibold': ['Inter_600SemiBold', 'System'],
        'sans-bold': ['Inter_700Bold', 'System'],
      },
      fontSize: {
        'display-xl': ['40px', { lineHeight: '48px', letterSpacing: '-0.5px' }],
        'display-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.3px' }],
        'heading-1': ['28px', { lineHeight: '36px', letterSpacing: '-0.2px' }],
        'heading-2': ['22px', { lineHeight: '28px', letterSpacing: '-0.1px' }],
        'heading-3': ['18px', { lineHeight: '24px' }],
        'body-lg': ['17px', { lineHeight: '24px' }],
        body: ['15px', { lineHeight: '22px' }],
        'body-sm': ['13px', { lineHeight: '18px', letterSpacing: '0.1px' }],
        label: ['13px', { lineHeight: '18px', letterSpacing: '0.2px' }],
        caption: ['11px', { lineHeight: '14px', letterSpacing: '0.3px' }],
        overline: ['11px', { lineHeight: '14px', letterSpacing: '1.2px' }],
        'stat-xl': ['36px', { lineHeight: '40px', letterSpacing: '-0.5px' }],
        'stat-lg': ['24px', { lineHeight: '28px', letterSpacing: '-0.2px' }],
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
