import projects from './projects'

export default function NotFound() {
  return (
    <div className="App">
      <h1>Not Found</h1>
      <h2>
        Options:
        <ul>
          {Object.entries(projects).map(([visType, projects]) =>
            Object.keys(projects).map(projectId => (
              <li key={`${visType}-${projectId}`}>
                <a href={`?type=${visType}&project=${projectId}`}>
                  type: {visType}, project: {projectId}
                </a>
              </li>
            ))
          )}
        </ul>
      </h2>
    </div>
  )
}
