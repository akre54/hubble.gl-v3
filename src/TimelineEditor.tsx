import type { Deck, DeckProps } from '@deck.gl/core/typed'
import { DeckGL } from '@deck.gl/react/typed'
import { type IProject, type ISheet, types, val } from '@theatre/core'
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { MapboxOverlay, type MapboxOverlayProps } from '@deck.gl/mapbox/typed'
import type { Framebuffer } from '@luma.gl/webgl'
import type { Map as MapLibre } from 'maplibre-gl'
import ReactMapGL, { type MapProps, useControl } from 'react-map-gl/maplibre'

import { useDeckDrawLoop } from './render/draw-loop'
import { captureScreenshot, useFrameBuffer, useRenderer } from './render/renderer'
import { TransformScale } from './render/transform-scale'
import { MAPTILER_BLUE, MAP_STYLES, useSky } from './utils/map-styles'
import setRef from './utils/set-ref'
import useSheetValue, { type PropsValue } from './utils/use-sheet-value'

import { WidgetContainer } from './WidgetContainer'
import { hexToRgba, rgbaToClearColor } from './utils/color'
import type { VisCreator } from './visualizations'

import 'maplibre-gl/dist/maplibre-gl.css'

const INITIAL_RENDER_STATE = {
  resolution: types.compound({
    width: types.number(1920),
    height: types.number(1080),
  }),
  waitForData: types.boolean(true),
  codec: types.stringLiteral('avc', {
    hevc: 'hevc', // h265
    vp9: 'vp9',
    av1: 'av1',
    avc: 'avc', // h264
  }),
  bitrateMbps: types.number(10, { range: [5, 20] }),
  scaleControl: types.number(0.3, { range: [0, 1] }),
  framerate: types.number(30, { range: [0.001, 1000] }),
  multipass: types.boolean(false),
  regex1: types.string(''),
  regex2: types.string(''),
  regex3: types.string(''),
  regex4: types.string(''),
  regex5: types.string(''),
  drawPreviewAfterMultipass: types.boolean(false),
}

const INITIAL_MAP_STATE = {
  enabled: types.boolean(true),
  mapStyle: types.stringLiteral(MAPTILER_BLUE, MAP_STYLES),
  background: types.rgba({ r: 0, g: 0, b: 0, a: 0 }),
  sky: types.compound({
    enabled: types.boolean(false), // Use style json by default
    skyColor: types.rgba(hexToRgba('#199EF3')),
    skyHorizonBlend: types.number(0.5, { range: [0, 1] }),
    horizonColor: types.rgba(hexToRgba('#daeff0')),
    horizonFogBlend: types.number(0.5, { range: [0, 1] }),
    fogColor: types.rgba({ r: 1, g: 1, b: 1, a: 1 }),
    fogGroundBlend: types.number(0.5, { range: [0, 1] }),
  }),
}

const DeckGLOverlay = forwardRef<
  Deck,
  MapboxOverlayProps & {
    renderer: PropsValue<typeof INITIAL_RENDER_STATE>
    isRendering: boolean
    layerGroups: string[]
    fboCaptureFrame: (framebuffers: Framebuffer[]) => void
  }
>(({ renderer, isRendering, layerGroups, fboCaptureFrame, ...props }, ref) => {
  // MapboxOverlay handles a variety of props differently than the Deck class.
  // https://deck.gl/docs/api-reference/mapbox/mapbox-overlay#constructor
  const deck = useControl<MapboxOverlay>(
    () => new MapboxOverlay({ ...props, interleaved: !renderer.multipass })
  )

  if (!isRendering) {
    deck.setProps({
      ...props,
      // TODO: Cleanup onAfterRender from draw loop as a post-render step instead
      onAfterRender: props.onAfterRender ? props.onAfterRender : () => {},
    })
  }

  // @ts-expect-error private property
  const deckgl = deck._deck

  const gl = deckgl?.animationLoop.gl
  // const gl = deckgl?.props.gl

  const getFramebuffer = useFrameBuffer(gl)

  useDeckDrawLoop({
    deck: deckgl,
    isRendering,
    layerGroups,
    getFramebuffer,
    fboCaptureFrame,
    rendererConfig: renderer,
    baseDeckProps: props,
  })

  // @ts-expect-error private property
  setRef(ref, deck._deck)
  return null
})

const isMapReady = (map: MapLibre | null) => !map || (map.isStyleLoaded() && map.areTilesLoaded())

export default function TimelineEditor({
  getVisualization,
  project,
  sheet,
}: {
  getVisualization: VisCreator
  project: IProject
  sheet: ISheet
}) {
  const startRenderRef = useRef(async () => {})
  const takeScreenshotRef = useRef(async () => {})

  const { mapSheet, rendererSheet } = useMemo(() => {
    const mapSheet = sheet?.object('map', INITIAL_MAP_STATE)
    const rendererSheet = sheet?.object('render', INITIAL_RENDER_STATE, {
      __actions__THIS_API_IS_UNSTABLE_AND_WILL_CHANGE_IN_THE_NEXT_VERSION: {
        startRender: async () => {
          await startRenderRef.current()
        },
        advanceFrame: () => {
          advanceFrame()
        },
        takeScreenshot: async () => {
          await takeScreenshotRef.current()
        },
      },
    })

    return {
      mapSheet,
      rendererSheet,
    }
  }, [sheet])

  const mapState = useSheetValue(mapSheet)
  const renderer = useSheetValue(rendererSheet)

  const [deckGLContext, setDeckGLContext] = useState<WebGL2RenderingContext | null>(null)
  const mapRef = useRef<MapLibre | null>(null)
  const deckRef = useRef<Deck>(null)

  // Trigger a redraw of React, mapbox and deck when the renderer state changes,
  // to ensure that the VideoStreamReader in renderer.ts runs
  const [_, setRand] = useState(0)
  const redraw = useCallback(() => {
    console.warn('redraw', mapRef.current, deckRef.current)
    mapRef.current?.redraw()
    deckRef.current?.redraw()
    setRand(Math.random())
  }, [])

  const layerGroups = [
    renderer.regex1,
    renderer.regex2,
    renderer.regex3,
    renderer.regex4,
    renderer.regex5,
  ].filter(val => renderer.multipass && Boolean(val))

  const layerGroupsRef = useRef(layerGroups)
  useEffect(() => {
    layerGroupsRef.current = layerGroups
  }, [layerGroups])

  const visualization = getVisualization({ sheet, mapRef, deckRef })
  const activeProject = visualization.project ? visualization.project : project
  const activeSequence = visualization.sheet ? visualization.sheet.sequence : sheet.sequence

  const { framerate, bitrateMbps, codec, resolution, waitForData, multipass } = renderer

  const {
    startCapture,
    canvasCaptureFrame,
    fboCaptureFrame,
    currentFrame,
    advanceFrame,
    _animate,
    isRendering,
  } = useRenderer({
    project: activeProject,
    sequence: activeSequence,
    fps: framerate,
    bitrate: bitrateMbps * 1_000_000,
    redraw,
  })

  // If the visType doesn't supply mapProps, disable basemap.
  // TODO: Detect if deck is in othorgraphic mode, and disable?
  const basemapEnabled = Boolean(mapState.enabled && visualization.mapProps)
  // console.log(rgbaToClearColor(mapState.background))
  const deckProps: DeckProps = {
    _animate,
    glOptions: {
      stencil: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    },
    useDevicePixels: false,
    parameters: {
      clearColor: rgbaToClearColor(mapState.background),
    },
    ...visualization.deckProps,
    onClick: (info, event) => {
      // Override onClick to pass deck to visType so that picking methods can be called.
      visualization.deckProps.onClick?.(info, event, deckRef.current)
    },
    onWebGLInitialized: gl => {
      // Redraw react to ensure hooks check for deck ref changes
      setDeckGLContext(gl)
      visualization.deckProps?.onWebGLInitialized?.(gl)
      redraw()
    },
  }

  const mapProps: MapProps = {
    interactive: false,
    mapStyle: mapState.mapStyle,
    antialias: true,
    preserveDrawingBuffer: true,
    onLoad: ({ target: map }) => {
      // Redraw react to ensure hooks check for map ref changes
      mapRef.current = map
      redraw()
    },
    ...visualization.mapProps,
    ...(visualization.mapProps?.maxPitch
      ? { maxPitch: Math.min(visualization.mapProps?.maxPitch, 85) }
      : {}),
  }

  useSky(mapState.sky, mapRef.current)

  const getFramebuffer = useFrameBuffer(deckGLContext)

  useEffect(() => {
    if (_animate) {
      mapRef.current?.redraw()
    }
  }, [_animate])

  // onIdle resolves when all data is loaded and drawing has settled.
  mapProps.onIdle = ({ target: map }) => {
    mapRef.current = map
    // Wait for map tiles to load before capturing.
    if (!isMapReady(map)) {
      console.warn('map waiting')
      return
    }
    // This should alert the renderer that the scene is ready to be captured
    // Because onIdle can be synchronous, we need to defer the promise resolution to the next tick.
    // TODO: Perhaps set up the promises refs before the render loop, and then later await the Promise.all?
    setTimeout(() => {
      canvasCaptureFrame()
    }, 0)
  }

  // TODO: Move to a TheatreJS extension:
  // https://www.theatrejs.com/docs/latest/manual/authoring-extensions

  const pureDeckInstance = !basemapEnabled ? deckRef.current : null
  useDeckDrawLoop({
    deck: pureDeckInstance,
    isRendering,
    layerGroups,
    getFramebuffer,
    fboCaptureFrame,
    canvasCaptureFrame,
    rendererConfig: {
      waitForData,
      multipass,
      drawPreviewAfterMultipass: false,
    },
    baseDeckProps: deckProps,
  })

  startRenderRef.current = useCallback(async () => {
    let canvas: HTMLCanvasElement | null = null

    if (basemapEnabled) {
      if (!mapRef.current) {
        console.error('Start Render: maplibre is not defined (when basemapEnabled is true)')
        return
      }
      canvas = mapRef.current.getCanvas()
    } else {
      // Pure Deck.gl mode
      if (!deckRef.current) {
        console.error('Start Render: deckRef is not defined (when basemapEnabled is false)')
        return
      }
      // @ts-expect-error canvas is protected but accessible
      canvas = deckRef.current.canvas
    }

    if (!canvas) {
      console.error('Start Render: Failed to get canvas element')
      return
    }

    await startCapture({
      canvas,
      layerGroups: layerGroupsRef.current,
      codec,
      // This always scales the video to the specified value, regardless of `canvas` size
      ...resolution,
    })
  }, [startCapture, codec, resolution, basemapEnabled, layerGroupsRef])

  takeScreenshotRef.current = useCallback(async () => {
    if (!deckRef.current) {
      console.error('Take Screenshot: deck is not defined')
      return
    }
    if (basemapEnabled && !mapRef.current) {
      console.error('Take Screenshot: maplibre is not defined')
      return
    }

    const suggestedName = project.address.projectId
    await captureScreenshot(suggestedName, () => {
      redraw()
      // @ts-expect-error canvas is protected
      return deckRef.current.canvas!
    })
  }, [project.address.projectId, redraw, basemapEnabled])

  // Double the render target resolution to increase map tile detail. Probably not always desired?
  // To convert viewport bounds back to their original size, add about 1 to the zoom value.
  const doubleResolution = {
    width: resolution.width * 2,
    height: resolution.height * 2,
  }

  return (
    <>
      {isRendering && (
        <div className="action-buttons">
          <progress
            max={val(activeSequence.pointer.length) * renderer.framerate}
            value={currentFrame}
            title={`Rendered ${currentFrame} / ${
              val(activeSequence.pointer.length) * renderer.framerate
            }`}
          />
        </div>
      )}
      <WidgetContainer widgets={visualization.widgets}>
        <TransformScale scale={renderer.scaleControl}>
          {basemapEnabled ? (
            <ReactMapGL style={doubleResolution} antialias {...mapProps}>
              <DeckGLOverlay
                ref={deckRef}
                renderer={renderer}
                isRendering={isRendering}
                layerGroups={layerGroups}
                fboCaptureFrame={fboCaptureFrame}
                {...deckProps}
              />
            </ReactMapGL>
          ) : (
            <DeckGL ref={ref => setRef(deckRef, ref?.deck)} {...deckProps} {...doubleResolution} />
          )}
        </TransformScale>
      </WidgetContainer>
    </>
  )
}
