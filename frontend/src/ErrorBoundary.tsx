import { Component, type PropsWithChildren } from 'react'

export class ErrorBoundary extends Component<PropsWithChildren, {failed: boolean}> {
  state = {failed: false}
  static getDerivedStateFromError() { return {failed: true} }
  render() {
    if (this.state.failed) return <main className="empty-state" role="alert">
      <h1>The route planner could not be displayed.</h1>
      <p>Reload the planner to try again.</p>
      <button className="primary-button" onClick={() => window.location.reload()}>Reload planner</button>
    </main>
    return this.props.children
  }
}
