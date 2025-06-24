import type { IExtension } from '@theatre/studio'
import projects from '../projects'

const editorExtension: IExtension = {
  id: 'editor-extension',
  toolbars: {
    global(set, _studio) {
      set([
        {
          type: 'Flyout',
          label: '📂',
          items: Object.entries(projects).flatMap(([visType, projects]) =>
            Object.keys(projects).map(projectId => ({
              label: `${visType}: ${projectId}`,
              onClick: () => {
                window.location.href = `?type=${visType}&project=${projectId}`
              },
            }))
          ),
        },
      ])
      return () => {
        // remove any listeners if necessary when the extension is unloaded
      }
    },
  },
}
export default editorExtension
