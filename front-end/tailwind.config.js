/** @type {import('tailwindcss').Config} */

/*
 * 0810 报告交付包（src/reports-v2/）的 Material 3 设计 token。
 * 交付包实际用到的只有 text-secondary / text-on-surface / border-outline-variant /
 * bg-surface-container-* / text-soft-* / text-natural-green 等，全部是本项目原先没有的键，
 * 与现有 ZEISS 配色不冲突。
 *
 * 唯一需要注意的是 primary 和 background：交付包原配置里是绿色系
 * （primary #286834、background #f8faf3），而现有页面有 186 处在用蓝色系的
 * primary #1E88E5 / background #F5F7FA。经核对，交付包的 104 个文件里一次都没有
 * 使用 bg-primary / text-primary / bg-background 这些类，所以这里直接沿用现有取值，
 * 不引入交付包的绿色 primary，也就不需要改动交付包源码。
 */
const reportTokens = {
  colors: {
    'soft-gray': '#8C8C8C',
    'soft-blue': '#7DA8D8',
    'soft-purple': '#A689B5',
    'soft-orange': '#F8A36D',
    'natural-green': '#4D8D54',
    'warm-white': '#FAF9F6',
    'cream-white': '#FDFCFB',

    secondary: '#5f5e5b',
    'on-secondary': '#ffffff',
    'secondary-container': '#e1dfdb',
    'on-secondary-container': '#63635f',
    'secondary-fixed': '#e4e2dd',
    'secondary-fixed-dim': '#c8c6c2',
    'on-secondary-fixed': '#1b1c19',
    'on-secondary-fixed-variant': '#474744',

    tertiary: '#90435d',
    'on-tertiary': '#ffffff',
    'tertiary-container': '#ad5a75',
    'on-tertiary-container': '#fffbff',
    'tertiary-fixed': '#ffd9e2',
    'tertiary-fixed-dim': '#ffb1c7',
    'on-tertiary-fixed': '#3e011c',
    'on-tertiary-fixed-variant': '#762e47',

    surface: '#f8faf3',
    'on-surface': '#191d18',
    'surface-variant': '#e0e4dc',
    'on-surface-variant': '#41493f',
    'surface-bright': '#f8faf3',
    'surface-dim': '#d8dbd4',
    'surface-container': '#ecefe7',
    'surface-container-low': '#f2f5ed',
    'surface-container-lowest': '#ffffff',
    'surface-container-high': '#e6e9e2',
    'surface-container-highest': '#e0e4dc',
    'surface-tint': '#2b6b36',
    'inverse-surface': '#2e312c',
    'inverse-on-surface': '#eff2ea',

    outline: '#717a6e',
    'outline-variant': '#c0c9bc',

    error: '#ba1a1a',
    'on-error': '#ffffff',
    'error-container': '#ffdad6',
    'on-error-container': '#93000a',

    'on-background': '#191d18',
    'on-primary': '#ffffff',
    'primary-container': '#42824a',
    'on-primary-container': '#f7fff2',
    'primary-fixed': '#aef3b0',
    'primary-fixed-dim': '#93d696',
    'on-primary-fixed': '#002107',
    'on-primary-fixed-variant': '#0e5220',
    'inverse-primary': '#93d696',
  },
  spacing: {
    'section-gap': '32px',
    'bottom-padding': '80px',
    'content-width': '1320px',
    'card-gap': '24px',
    'canvas-width': '1440px',
    'page-padding': '38.4px',
    'container-padding': '24px',
  },
  fontFamily: {
    headline: ['Be Vietnam Pro'],
    'headline-mobile': ['Be Vietnam Pro'],
    'large-title': ['Be Vietnam Pro'],
    'large-title-mobile': ['Be Vietnam Pro'],
    'section-title': ['Be Vietnam Pro'],
    subtitle: ['Be Vietnam Pro'],
    caption: ['Be Vietnam Pro'],
    body: ['Be Vietnam Pro'],
  },
  fontSize: {
    headline: ['40px', { lineHeight: '52px', fontWeight: '600', letterSpacing: '0' }],
    'headline-mobile': ['32px', { lineHeight: '40px', fontWeight: '600', letterSpacing: '0' }],
    'large-title': ['56px', { lineHeight: '72px', fontWeight: '700', letterSpacing: '0' }],
    'large-title-mobile': ['40px', { lineHeight: '48px', fontWeight: '700', letterSpacing: '0' }],
    'section-title': ['28px', { lineHeight: '36px', fontWeight: '600', letterSpacing: '0' }],
    subtitle: ['20px', { lineHeight: '28px', fontWeight: '500', letterSpacing: '0' }],
    caption: ['14px', { lineHeight: '20px', fontWeight: '500', letterSpacing: '0' }],
    body: ['16px', { lineHeight: '24px', fontWeight: '400', letterSpacing: '0' }],
  },
};

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        ...reportTokens.colors,
        // 现有 ZEISS 取值放在展开之后，确保不被交付包的绿色系覆盖
        primary: '#1E88E5',
        background: '#F5F7FA',
        foreground: '#37474F',
      },
      spacing: reportTokens.spacing,
      fontFamily: reportTokens.fontFamily,
      fontSize: reportTokens.fontSize,
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
      },
    },
  },
  plugins: [],
}
