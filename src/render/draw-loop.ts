import type { Deck, DeckProps } from '@deck.gl/core/typed'
import type { Framebuffer } from '@luma.gl/webgl'
import { useEffect } from 'react'

interface RendererConfig {
  waitForData: boolean
  multipass: boolean
  drawPreviewAfterMultipass: boolean
}

interface UseDeckDrawLoopProps {
  deck: Deck | null
  isRendering: boolean
  layerGroups: string[]
  getFramebuffer: (id: string) => Framebuffer | undefined
  fboCaptureFrame: (result?: { error?: Error; framebuffers?: Framebuffer[] }) => void
  canvasCaptureFrame?: (result?: { error?: Error }) => void
  rendererConfig: RendererConfig
  baseDeckProps?: Partial<DeckProps>
}

const isDeckReady = (deck: Deck | null) =>
  !deck || deck.props.layers.every(layer => !layer || (!Array.isArray(layer) && layer.isLoaded))

async function drawDeck({
  deck,
  props,
  waitForData,
  renderPass,
}: {
  deck: Deck
  props: DeckProps
  waitForData: boolean
  renderPass: string
}) {
  let resolvePass: (value?: unknown) => void
  const passPromise = new Promise(res => {
    resolvePass = res
  })

  deck.setProps({
    ...props,
    onAfterRender: context => {
      props.onAfterRender?.(context)
      // console.log(`deck render - ${renderPass}`)
      if (waitForData && !isDeckReady(deck)) {
        console.warn(`deck waiting - ${renderPass}`)
        return // layers aren't loaded
      }
      // console.log(`deck ready for capture - ${renderPass}`)
      // Deck is ready, or we are not waiting for data
      resolvePass()
    },
  })

  await passPromise
}

export function useDeckDrawLoop({
  deck,
  isRendering,
  layerGroups,
  getFramebuffer,
  fboCaptureFrame,
  canvasCaptureFrame,
  rendererConfig,
  baseDeckProps = {},
}: UseDeckDrawLoopProps) {
  useEffect(() => {
    if (!isRendering || !deck) {
      return
    }

    const { multipass, drawPreviewAfterMultipass, waitForData } = rendererConfig

    async function drawPass() {
      try {
        if (multipass && layerGroups.length > 0) {
          // Multi-pass Canvas (optional) and FBO layer rendering
          const capturedFramebuffers: Framebuffer[] = []
          for (const renderPass of layerGroups) {
            const fbo = getFramebuffer(renderPass)
            if (!fbo) {
              throw new Error(`Failed to get framebuffer for pass: ${renderPass}`)
            }

            await drawDeck({
              deck,
              props: {
                ...baseDeckProps,
                layerFilter: ({ layer }) => new RegExp(renderPass).test(layer.id),
                _framebuffer: fbo,
              },
              waitForData,
              renderPass: `multipass: ${renderPass}`,
            })

            capturedFramebuffers.push(fbo)
          }
          fboCaptureFrame({ framebuffers: capturedFramebuffers })

          if (drawPreviewAfterMultipass) {
            // TODO: This is used by the interleaved renderer, but it never worked in Nodes. Consider removing or fixing.
            // Redraw the whole scene for previewing after all layers have rendered
            await drawDeck({
              deck,
              props: {
                ...baseDeckProps,
                _framebuffer: null,
                layerFilter: null,
              },
              waitForData: false,
              renderPass: 'multi-pass preview',
            })
          }

          canvasCaptureFrame?.()
        } else {
          await drawDeck({
            deck,
            props: {
              ...baseDeckProps,
              _framebuffer: null,
              layerFilter: null,
            },
            waitForData: waitForData,
            renderPass: 'single pass',
          })

          fboCaptureFrame() // Call to continue render. Single pass only uses canvasCaptureFrame.
          canvasCaptureFrame?.()
        }
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e))
        console.error('[useDeckDrawLoop] Error during drawing:', error)
        if (deck) {
          // Redraw whole scene without framebuffers to ensure preview is correct
          await drawDeck({
            deck,
            props: {
              ...baseDeckProps,
              _framebuffer: null,
              layerFilter: null,
            },
            waitForData: false,
            renderPass: 'recover from render error',
          })
        }
        fboCaptureFrame({ error })
        canvasCaptureFrame?.({ error })
      }
    }

    drawPass()
  }, [
    deck,
    isRendering,
    layerGroups,
    getFramebuffer,
    fboCaptureFrame,
    canvasCaptureFrame,
    baseDeckProps,
    rendererConfig,
  ])
}
