import { type IProject, type ISheet, getProject } from '@theatre/core'
import studio from '@theatre/studio'
import { useEffect, useState } from 'react'

import TimelineEditor from './TimelineEditor'
import { rafDriver } from './render/renderer'

import NotFound from './NotFound'
import extension from './features/extension'
import projects, { type ProjectId } from './projects'
import visualizations, { type VisCreator, type VisType } from './visualizations'

import './Project.css'

const queryParams = new URLSearchParams(window.location.search)

// https://www.theatrejs.com/docs/latest/manual/advanced#rafdrivers
studio.extend(extension)
// the rafDriver breaks things like spacebar playback
studio.initialize({
  __experimental_rafDriver: rafDriver,
  usePersistentStorage: import.meta.env.PROD,
})

type Vis = {
  project: IProject
  sheet: ISheet
  getVisualization: VisCreator
}
const EMPTY_VIS = {
  project: null,
  sheet: null,
  getVisualization: null,
} as unknown as Vis

function Project() {
  const [ready, setReady] = useState(false)
  const visType = queryParams.get('type') as VisType | null
  const projectId = queryParams.get('project') as ProjectId | null
  const [{ getVisualization, project, sheet }, setVis] = useState<Vis>(EMPTY_VIS)

  useEffect(() => {
    if (!visType || !projectId) {
      console.log('No projectId or visType found in URL', queryParams)
      return
    }
    ;(async () => {
      let state = null
      let name = projectId

      console.assert(projects[visType], `No projects found for visType ${visType}`)

      const found = projects[visType][projectId]
      if (found) {
        name = found.name
        state = found.state ? await fetch(found.state).then(res => res.json()) : null
      }

      if (!state) {
        console.warn(`No state found for ${visType} with id ${projectId}. Using default project`)
      }

      const project = getProject(name as string, {
        state,
        assets: {
          baseUrl: './src/projects/assets',
        },
      })

      // Maybe store on project?
      // this breaks the rules of hooks, but it's fine because it's only changed once on load.
      // If we decide to allow you to change pages then we should rethink
      const getVisualization = await visualizations[visType]()

      // TODO: Move to a TheatreJS extension that allows multiple takes
      const sheet = project.sheet('Take 1')

      setVis({ project, sheet, getVisualization })
    })()
  }, [visType, projectId])

  useEffect(() => {
    project?.ready.then(() => setReady(true))
  }, [project])

  if (!project) {
    return <NotFound />
  }

  if (!ready || !project || !sheet || !getVisualization) {
    // don't call project.getAssetUrl until Theatre project is ready
    return <div>loading project...</div>
  }

  return (
    <div className="Project">
      <TimelineEditor getVisualization={getVisualization} project={project} sheet={sheet} />
    </div>
  )
}

export default Project
