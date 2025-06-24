import type { VisType } from '../visualizations'
import example1State from './Example 1.theatre-project-state.json?url'

type Projects = {
  [visType in VisType]: {
    [id: string]: {
      name: string
      state: string | null
    }
  }
}

const projects: Projects = {
  'Example-VisType': {
    'example1': {
      name: 'Example 1',
      state: example1State,
    },
  }
}

export default projects
export type ProjectId = keyof (typeof projects)[VisType]
