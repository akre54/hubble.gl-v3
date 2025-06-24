import type { MapViewState, View } from '@deck.gl/core/typed'
import { MapView } from '@deck.gl/core/typed'
import { type ISheet, types } from '@theatre/core'
import { useMemo } from 'react'

import useSheetValue from '../utils/use-sheet-value'

export const INITIAL_MAP_CAMERA = {
  longitude: types.number(-121.7658948, { nudgeMultiplier: 0.001 }),
  latitude: types.number(36.6807456, { nudgeMultiplier: 0.001 }),
  pitch: types.number(0, { range: [0, 85] }),
  maxPitch: types.number(85),
  bearing: types.number(0),
  zoom: types.number(13.8, { range: [0, 20] }),
  lens: types.compound({
    orthographic: types.boolean(false),
    farZMultiplier: types.number(1.01, { range: [1, 5] }),
  }),
}

export const INITIAL_FPV_CAMERA = {
  longitude: types.number(-118.402894, { nudgeMultiplier: 0.001 }),
  latitude: types.number(33.944745, { nudgeMultiplier: 0.001 }),
  pitch: types.number(9, { range: [0, 90] }),
  bearing: types.number(-96),
  position: types.compound({
    x: types.number(0),
    y: types.number(0),
    z: types.number(71),
  }),
  lens: types.compound({
    near: types.number(0.1, { range: [0.000001, 100000] }),
    far: types.number(4000, { range: [0, 100000] }),
    fovy: types.number(40, { range: [1, 180] }),
    focalDistance: types.number(1),
    orthographic: types.boolean(false),
  }),
}

export function useBasicView(props: { sheet: ISheet }): {
  viewState: MapViewState
  views: View
} {
  const { sheet } = props
  const { map1Sheet } = useMemo(() => {
    const map1Sheet = sheet?.object('cameras / map-1', INITIAL_MAP_CAMERA)
    return {
      map1Sheet,
    }
  }, [sheet])

  const map1 = useSheetValue(map1Sheet)
  const { lens: _, ...viewState } = map1
  return {
    viewState,
    views: new MapView({ id: 'mapbox', ...map1.lens }),
  }
}
