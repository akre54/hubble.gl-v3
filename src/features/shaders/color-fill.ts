import type { ShaderPass } from '@luma.gl/shadertools/src/types'

const fs = `\
uniform vec4 fill;

vec4 colorFill_filterColor(vec4 color) {
  return fill;
}

vec4 colorFill_filterColor(vec4 color, vec2 texSize, vec2 texCoords) {
  return colorFill_filterColor(color);
}
`

/**
 * Replace all colors
 * Usage:
 *   fill: [r, g, b, a]
 *   color channels are 0-1
 */
export const colorFill: ShaderPass = {
  name: 'colorFill',
  uniforms: {
    fill: [1, 1, 1, 1],
  },
  fs,
  passes: [{ filter: true }],
}
