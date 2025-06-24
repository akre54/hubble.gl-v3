import type React from 'react'
import type { Deck, DeckProps, FirstPersonViewState, MapViewState } from '@deck.gl/core/typed'
import type * as maplibregl from 'maplibre-gl'
import type { IProject, ISheet } from '@theatre/core'

import type { MapProps } from 'react-map-gl/maplibre'

export type ViewState =
  | MapViewState
  | FirstPersonViewState
  | { [viewId: string]: MapViewState | FirstPersonViewState }

export type BetterMapProps = MapProps & MapViewState
export type BetterDeckProps = Partial<DeckProps & { viewState: ViewState }>

export type Visualization = {
  widgets?: {
    fill?: React.ReactNode // overlays the composition area
    right?: React.ReactNode // primary vertical panel for widgets
    bottom?: React.ReactNode // primary horizontal panel for widgets
    top?: React.ReactNode
    left?: React.ReactNode
  }
  mapProps?: BetterMapProps
  deckProps: BetterDeckProps
  project?: IProject
  sheet?: ISheet
}

export type VisCreator = (props: {
  sheet: ISheet
  mapRef: React.Ref<maplibregl.Map>
  deckRef: React.Ref<Deck>
}) => Visualization

export type VisType =
  | 'Example-VisType'

type VisImporter = () => Promise<VisCreator>

const visComponents = import.meta.glob('./*.tsx', {
  import: 'default',
}) as Record<string, VisImporter>

const visualizations = Object.fromEntries(
  Object.entries(visComponents).map(([path, vis]) => {
    const key = path.match(/\.\/(.+)\.tsx$/)?.[1]
    return [key, vis]
  })
) as unknown as Record<VisType, VisImporter>

export default visualizations
