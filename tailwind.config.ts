// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Syne', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
      },
      colors: {
        accent: '#00d4aa',
        danger: '#ff4d6d',
        warning: '#ffb830',
        surface: '#12121f',
        'surface-2': '#1a1a2e',
        border: '#2d2d4e',
      },
      fontWeight: {
        '600': '600',
        '700': '700',
        '800': '800',
      },
    },
  },
  plugins: [],
};

export default config;
