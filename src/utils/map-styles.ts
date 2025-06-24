import type maplibre from 'maplibre-gl'
import { useEffect } from 'react'
import { type RGBX, rgbaToHex } from './color'

const MAPTILER_API_KEY = import.meta.env.VITE_MAPTILER_API_KEY

const MAPTILER_BASEMAPS = [
  {
    name: 'Terrain 3D - Cesium quantized mesh',
    url: 'https://api.maptiler.com/tiles/terrain-quantized-mesh-v2/tiles.json?key=DbiE2lrrDavk3fVUHkJo',
  },
  {
    name: 'Satellite Hybrid',
    url: 'https://api.maptiler.com/maps/hybrid/style.json',
  },
  {
    name: 'Contour Lines',
    url: 'https://api.maptiler.com/tiles/contours/tiles.json',
  },
  {
    name: 'MapTiler Topo',
    url: 'https://api.maptiler.com/maps/topo-v2/style.json',
  },
  {
    name: 'UK OS Open Zoomstack Light',
    url: 'https://api.maptiler.com/maps/uk-openzoomstack-light/style.json',
  },
].map(({ url, name }) => ({ url: `${url}?key=${MAPTILER_API_KEY}`, name }))

export const MAPTILER_BLUE = MAPTILER_BASEMAPS[0].url

const CARTO_BASEMAPS = [
  {
    name: 'Streets',
    url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  },
  {
    name: 'Light',
    url: 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json',
  },
  {
    name: 'Dark',
    url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  },
  {
    name: 'Dark-NoLabels',
    url: 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json',
  },
  {
    name: 'Voyager',
    url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  },
  {
    name: 'Voyager-NoLabels',
    url: 'https://basemaps.cartocdn.com/gl/voyager-nolabels-gl-style/style.json',
  },
]

export const MAP_STYLES = [...MAPTILER_BASEMAPS, ...CARTO_BASEMAPS].reduce(
  (acc, { url, name }) => {
    acc[url] = name
    return acc
  },
  {} as { [key: string]: string }
)

type Sky = {
  enabled: boolean
  skyColor: RGBX
  skyHorizonBlend: number
  horizonColor: RGBX
  horizonFogBlend: number
  fogColor: RGBX
  fogGroundBlend: number
}

export const useSky = (sky: Sky, map: maplibre.Map | null) => {
  useEffect(() => {
    const {
      enabled,
      skyColor,
      skyHorizonBlend,
      horizonColor,
      horizonFogBlend,
      fogColor,
      fogGroundBlend,
    } = sky
    if (enabled) {
      map?.setSky({
        'sky-color': rgbaToHex(skyColor),
        'sky-horizon-blend': skyHorizonBlend,
        'horizon-color': rgbaToHex(horizonColor),
        'horizon-fog-blend': horizonFogBlend,
        'fog-color': rgbaToHex(fogColor),
        'fog-ground-blend': fogGroundBlend,
      })
    } else {
      // @ts-expect-error an undefined input resets the sky
      map?.setSky()
    }
  }, [sky, map])
}
