import { types, type ISheet } from '@theatre/core'
import type { LayersList } from '@deck.gl/core/typed'
import { useMemo } from 'react'

import type { Visualization } from '.'
import { useEffects } from '../features/effects'
import { useBasicView } from '../features/views'
import { colorToRgba, rgbaToColor } from '../utils/color'
import useSheetValue from '../utils/use-sheet-value'
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers/typed'
import { generateRoutePath } from '../utils/flight-geometry'

const INITIAL_POIS_STATE = {
  visible: types.boolean(true),
  fillColor: types.rgba(colorToRgba([0, 137, 255, 255])),
  strokeColor: types.rgba(colorToRgba([255, 255, 255, 255])),
  strokeWidth: types.number(50),
  strokeOpacity: types.number(0.5),
  stroked: types.boolean(true),
  filled: types.boolean(true),
  opacity: types.number(1, { range: [0, 1], nudgeMultiplier: 0.01 }),
  radius: types.number(200),
  radiusUnits: types.stringLiteral('meters', {
    meters: 'meters',
    pixels: 'pixels',
  }),
}

const INITIAL_FLY_STATE = {
  visible: types.boolean(true),
  time: types.number(100_000, { nudgeMultiplier: 1000 }),

  path: types.compound({
    color: types.rgba(colorToRgba([191, 202, 227, 240])),
    billboard: types.boolean(false),
    fadeTrail: types.boolean(false),
    width: types.number(8),
    widthScale: types.number(20),
    capRounded: types.boolean(false),
    jointRounded: types.boolean(false),
    miterLimit: types.number(4),
    widthMinPixels: types.number(20),
  }),
}

const INITIAL_ARCS_STATE = {
  height: types.number(8000),
  segmentCount: types.number(50),
  tilt: types.number(0),
}

const origin = { lat: 36.6807456, lng: -121.7658948, alt: 0 }
const destination = { lat: 36.586786, lng: -121.8458613, alt: 0 }

function useLayers({ sheet }: { sheet: ISheet }): LayersList {
  const { flySheet, arcsSheet, poisSheet } = useMemo(() => {
    const flySheet = sheet?.object('fly', INITIAL_FLY_STATE)
    const arcsSheet = sheet?.object('arcs', INITIAL_ARCS_STATE)
    const poisSheet = sheet?.object('pois', INITIAL_POIS_STATE)
    return {
      flySheet,
      arcsSheet,
      poisSheet,
    }
  }, [sheet])

  const fly = useSheetValue(flySheet)
  const arcs = useSheetValue(arcsSheet)
  const pois = useSheetValue(poisSheet)

  const routePath = useMemo(() => generateRoutePath({
    origin,
    destination,
    arcHeight: arcs.height,
    segmentCount: arcs.segmentCount,
    tilt: arcs.tilt,
  }), [arcs.height, arcs.segmentCount, arcs.tilt])

  const path = routePath.filter((_d, i) => i * 2000 < fly.time)

  const layers = [
    new ScatterplotLayer({
      id: 'pois',
      data: [origin, destination],
      getPosition: (d: { lat: number; lng: number }) => [d.lng, d.lat],
      getRadius: pois.radius,
      radiusUnits: pois.radiusUnits,
      getFillColor: rgbaToColor(pois.fillColor),
      getStrokeColor: rgbaToColor(pois.strokeColor),
      getStrokeWidth: pois.strokeWidth,
      getStrokeOpacity: pois.strokeOpacity,
      visible: pois.visible,
      opacity: pois.opacity,
      filled: pois.filled,
      stroked: pois.stroked,
    }),
    new PathLayer({
      id: 'fly',
      data: [path],
      getPath: d => d,
      getColor: rgbaToColor(fly.path.color),
      billboard: fly.path.billboard,
      jointRounded: fly.path.jointRounded,
      miterLimit: fly.path.miterLimit,
      widthMinPixels: fly.path.widthMinPixels,
      getWidth: fly.path.width,
      getWidthScale: fly.path.widthScale,
      getCapRounded: fly.path.capRounded,
      getFadeTrail: fly.path.fadeTrail,
      visible: fly.visible,
    }),
  ]

  return layers
}

export default function useVisualization(props: {
  sheet: ISheet
}): Visualization {
  const { views, viewState } = useBasicView(props)
  const effects = useEffects({ sheet: props.sheet, viewState })
  const layers = useLayers(props)
  return {
    deckProps: {
      effects,
      layers,
      views,
      viewState,
    },
    mapProps: {
      ...viewState,
    },
  }
}
