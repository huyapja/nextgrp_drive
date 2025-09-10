// src/utils/primeVue/theme.js
import { definePreset } from '@primevue/themes';

export const customTheme = definePreset({
  semantic: {
    primary: {
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
      300: '#93c5fd',
      400: '#60a5fa',
      500: '#0149C1', // Primary color
      600: '#013a9c',
      700: '#1d4ed8',
      800: '#1e40af',
      900: '#1e3a8a',
      950: '#172554'
    },
    colorScheme: {
      light: {
        primary: {
          color: '#0149C1',
          contrastColor: '#ffffff',
          hoverColor: '#013a9c',
          activeColor: '#013a9c'
        },
        surface: {
          0: '#ffffff',
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617'
        },
        // PrimeVue sử dụng các key này cho text colors
        text: {
          color: '#171717',           // Màu chữ chính
          hoverColor: '#0149C1',      // Màu chữ hover
          mutedColor: '#64748b',      // Màu chữ muted
          highlightColor: '#0149C1',  // Màu chữ highlight
        },
        // Content colors - PrimeVue convention
        content: {
          color: '#404040',           // Secondary text color
          hoverColor: '#171717',      // Content hover color
          mutedColor: '#888888',      // Muted content color
        },
        highlight: {
          background: '#D4E1F9',
          focusBackground: '#D4E1F9',
          color: '#0149C1',
          focusColor: '#0149C1'
        }
      },
      dark: {
        primary: {
          color: '#0149C1',
          contrastColor: '#ffffff',
          hoverColor: '#013a9c',
          activeColor: '#013a9c'
        },
        surface: {
          0: '#0f172a',
          50: '#1e293b',
          100: '#334155',
          200: '#475569',
          300: '#64748b',
          400: '#94a3b8',
          500: '#cbd5e1',
          600: '#e2e8f0',
          700: '#f1f5f9',
          800: '#f8fafc',
          900: '#ffffff',
          950: '#ffffff'
        },
        text: {
          color: '#ffffff',
          hoverColor: '#0149C1',
          mutedColor: '#94a3b8',
          highlightColor: '#0149C1',
        },
        content: {
          color: '#e2e8f0',
          hoverColor: '#ffffff',
          mutedColor: '#94a3b8',
        },
        highlight: {
          background: 'rgba(212, 225, 249, 0.16)',
          focusBackground: 'rgba(212, 225, 249, 0.24)',
          color: 'rgba(212, 225, 249, 0.87)',
          focusColor: 'rgba(212, 225, 249, 0.87)'
        }
      }
    }
  }
});