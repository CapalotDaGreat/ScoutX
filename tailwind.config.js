/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./App.tsx', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0A0A0A',
          foreground: '#FFFFFF',
        },
        accent: {
          DEFAULT: '#16A34A',
          foreground: '#FFFFFF',
          muted: '#DCFCE7',
        },
        background: {
          DEFAULT: '#FFFFFF',
          secondary: '#F5F5F5',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          elevated: '#FFFFFF',
        },
        foreground: {
          DEFAULT: '#0A0A0A',
          secondary: '#737373',
          tertiary: '#A3A3A3',
          inverse: '#FFFFFF',
        },
        border: {
          DEFAULT: '#E5E5E5',
          strong: '#D4D4D4',
        },
        divider: '#F0F0F0',
        success: {
          DEFAULT: '#16A34A',
          muted: '#DCFCE7',
        },
        warning: {
          DEFAULT: '#CA8A04',
          muted: '#FEF9C3',
        },
        error: {
          DEFAULT: '#DC2626',
          muted: '#FEE2E2',
        },
        info: {
          DEFAULT: '#2563EB',
          muted: '#DBEAFE',
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
