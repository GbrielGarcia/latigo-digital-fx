import type { ThemeId } from '../config/settings';

export interface Theme {
  id: ThemeId;
  name: string;
  bgTop: string;
  bgBottom: string;
  bgSolid: string;
  grid: string;
  vignette: string;
  rope: string;
  ropeHighlight: string;
  ropeShadow: string;
  handle: string;
  handleAccent: string;
  tip: string;
  trail: string;
  spark: string;
  shock: string;
  flash: string;
  target: string;
  /** Glow blur (px) applied to the rope; 0 disables it. */
  glow: number;
  additiveEffects: boolean;
}

export const THEMES: Readonly<Record<ThemeId, Theme>> = {
  dark: {
    id: 'dark',
    name: 'Oscuro profesional',
    bgTop: '#1b1f27',
    bgBottom: '#0c0e12',
    bgSolid: '#12151b',
    grid: 'rgba(255,255,255,0.045)',
    vignette: 'rgba(0,0,0,0.45)',
    rope: '#a26a3c',
    ropeHighlight: 'rgba(255,224,190,0.35)',
    ropeShadow: 'rgba(0,0,0,0.35)',
    handle: '#5a3a24',
    handleAccent: '#c9a36a',
    tip: '#e8d3b0',
    trail: '255,196,120',
    spark: '255,206,140',
    shock: '255,236,210',
    flash: '255,244,225',
    target: '120,200,255',
    glow: 0,
    additiveEffects: true,
  },
  neon: {
    id: 'neon',
    name: 'Neón futurista',
    bgTop: '#0b0420',
    bgBottom: '#02010a',
    bgSolid: '#06021a',
    grid: 'rgba(0,255,234,0.07)',
    vignette: 'rgba(0,0,0,0.55)',
    rope: '#00f0ff',
    ropeHighlight: 'rgba(255,255,255,0.55)',
    ropeShadow: 'rgba(0,0,0,0.0)',
    handle: '#ff2bd6',
    handleAccent: '#ffe14d',
    tip: '#ffffff',
    trail: '255,43,214',
    spark: '0,240,255',
    shock: '255,43,214',
    flash: '200,120,255',
    target: '255,225,77',
    glow: 14,
    additiveEffects: true,
  },
  light: {
    id: 'light',
    name: 'Minimalista claro',
    bgTop: '#f6f7f9',
    bgBottom: '#e6e9ee',
    bgSolid: '#f2f3f5',
    grid: 'rgba(20,30,50,0.06)',
    vignette: 'rgba(60,70,90,0.10)',
    rope: '#2b2f36',
    ropeHighlight: 'rgba(255,255,255,0.35)',
    ropeShadow: 'rgba(20,30,50,0.16)',
    handle: '#1f2329',
    handleAccent: '#d0453a',
    tip: '#d0453a',
    trail: '208,69,58',
    spark: '208,69,58',
    shock: '40,50,70',
    flash: '255,255,255',
    target: '40,110,220',
    glow: 0,
    additiveEffects: false,
  },
};

export function getTheme(id: ThemeId): Theme {
  return THEMES[id] ?? THEMES.dark;
}
