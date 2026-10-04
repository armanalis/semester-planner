import type { CSSProperties } from 'react'
import type { HueKey } from '../types'

/**
 * Highlighter fill + matching ink, for light paper and for the dark notebook.
 * In dark mode the fill turns into a deep tint and the ink into the bright pastel.
 */
export const HUES: Record<HueKey, { hl: [string, string]; ink: [string, string] }> = {
  pink: { hl: ['#f7c1d5', '#5a2442'], ink: ['#a0285e', '#ffb8d6'] },
  orange: { hl: ['#ffd3a1', '#5f3b18'], ink: ['#a04b06', '#ffc68f'] },
  yellow: { hl: ['#fceb8f', '#524818'], ink: ['#7a6408', '#f5e27a'] },
  cyan: { hl: ['#c4ecf4', '#164a55'], ink: ['#0f6b7c', '#93e4f2'] },
  slate: { hl: ['#cfdce6', '#2e3b51'], ink: ['#3b536b', '#c0d1e4'] },
  green: { hl: ['#cdefc4', '#234a20'], ink: ['#2f6b26', '#aee6a0'] },
  violet: { hl: ['#dcd3f7', '#3a2e66'], ink: ['#5b3fa8', '#cdbfff'] },
}

const ld = ([light, dark]: [string, string]) => `light-dark(${light}, ${dark})`

export const hueVars = (hue: HueKey): CSSProperties =>
  ({ '--hl': ld(HUES[hue].hl), '--ink': ld(HUES[hue].ink) }) as CSSProperties

/** Swatch color for the color picker (always the light highlighter). */
export const swatch = (hue: HueKey) => ld(HUES[hue].hl)
