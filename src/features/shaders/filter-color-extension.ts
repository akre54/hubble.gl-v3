import {
  type CompositeLayer,
  type Layer,
  LayerExtension,
  type UpdateParameters,
} from '@deck.gl/core/typed'
import type { Model } from '@luma.gl/engine'
import { normalizeShaderModule } from '@luma.gl/shadertools'
import type { ShaderPass } from '@luma.gl/shadertools/src/types'

type Uniforms = { [uniform: string]: number | number[] }

type FilterColorExtensionProps = {
  [shaderName: string]: Uniforms
}

type FilterColorExtensionOptions = ShaderPass

/**
 * Usage:
 *
 * // Brightness adjustment
 * import { brightnessContrast } from '@luma.gl/shadertools'
 * new Tiles3DLayer({
 *   ...
 *   extensions: [new FilterColorExtension(brightnessContrast)],
 *   brightnessContrast: {
 *     brightness: 0.5
 *   }
 * })
 *
 * // Brightness and vibrance adjustment
 * import { brightnessContrast, vibrance } from '@luma.gl/shadertools'
 * new Tiles3DLayer({
 *   ...
 *   extensions: [
 *     new FilterColorExtension(brightnessContrast),
 *     new FilterColorExtension(vibrance)
 *   ],
 *   brightnessContrast: {
 *     brightness: 0.5
 *   },
 *   vibrance: {
 *     amount: 0.75
 *   }
 * })
 */

// alt names: ColorEffectExtension, FilterExtension, PostProcessingEffectExtension
export class FilterColorExtension extends LayerExtension<FilterColorExtensionOptions> {
  static extensionName = 'FilterColorExtension'

  constructor(shaderModule: FilterColorExtensionOptions) {
    if (
      shaderModule.passes?.length !== 1 ||
      Object.keys(shaderModule.passes[0]).some(pass => pass !== 'filter')
    ) {
      throw new Error('shaderModule is not a single pass color filter')
    }
    super(normalizeShaderModule(shaderModule))
  }

  getShaders(extension: FilterColorExtension) {
    const shaderModule = extension.opts

    return {
      inject: {
        'fs:#decl': shaderModule.fs,

        'fs:DECKGL_FILTER_COLOR': `
          // TODO: Add texSize to geometry struct? Where to populate from?
          // TODO: Why does doubling geometry.uv help?
          color = ${shaderModule.name}_filterColor(color, vec2(0., 0.), geometry.uv * 2.0);
        `,
      },
    }
  }

  getSubLayerProps(
    this: CompositeLayer<FilterColorExtensionProps>,
    extension: FilterColorExtension
  ): FilterColorExtensionProps {
    const name = extension.opts.name
    // Only pass extension uniforms down to sublayers.
    return { [name]: this.props[name] }
  }

  updateState(
    this: Layer<FilterColorExtensionProps>,
    { props }: UpdateParameters<Layer<FilterColorExtensionProps>>,
    extension: FilterColorExtension
  ) {
    const name = extension.opts.name
    // Add defaults
    const uniforms: Uniforms = {
      ...extension.opts.getUniforms(),
      ...props[name],
    }

    // TODO: Implement this.getModels() on ScenegraphLayer? See GeoJsonLayer
    this.state?.scenegraph?.traverse((model: { model: Model }) => {
      model.model.setUniforms(uniforms)
    })
  }
}
