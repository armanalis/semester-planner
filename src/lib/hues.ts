import type { CSSProperties } from 'react'
import type { HueKey } from '../types'

/**
 * Highlighter fill + matching ink, for light paper and for the dark notebook.
 * In dark mode the fill turns into a deep tint and the ink into the bright pastel.
 */
export const HUES: Record<HueKey, { hl: [string, string]; ink: [string, string] }> = {
  pink: { hl: ['#f7c1d5', '#4a2338'], ink: ['#a0285e', '#ffb3d1'] },
  orange: { hl: ['#ffd3a1', '#4a301a'], ink: ['#a04b06', '#ffc285'] },
  yellow: { hl: ['#fceb8f', '#423b17'], ink: ['#7a6408', '#f2de72'] },
  cyan: { hl: ['#c4ecf4', '#173f48'], ink: ['#0f6b7c', '#8fdeee'] },
  slate: { hl: ['#cfdce6', '#2a3647'], ink: ['#3b536b', '#b7c9dc'] },
  green: { hl: ['#cdefc4', '#22401e'], ink: ['#2f6b26', '#a6e298'] },
  violet: { hl: ['#dcd3f7', '#33295b'], ink: ['#5b3fa8', '#c8b9ff'] },
}

const ld = ([light, dark]: [string, string]) => `light-dark(${light}, ${dark})`

export const hueVars = (hue: HueKey): CSSProperties =>
  ({ '--hl': ld(HUES[hue].hl), '--ink': ld(HUES[hue].ink) }) as CSSProperties

/** Swatch color for the color picker (always the light highlighter). */
export const swatch = (hue: HueKey) => ld(HUES[hue].hl)
