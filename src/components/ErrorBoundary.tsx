/* App-level error boundary: catches render-time throws anywhere in the tree and
   shows a recoverable fallback instead of a blank white screen. Error boundaries
   must be class components — there is no hook equivalent for componentDidCatch. */
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface to the console so a crash leaves a trace; no remote logging here.
    console.error("[ErrorBoundary] render failure:", error, info.componentStack);
  }

  handleReload = () => {
    // Full reload is the safest reset — component state is unrecoverable here.
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="container" style={{ paddingTop: "4rem", maxWidth: "40rem" }}>
        <div className="panel">
          <h1>Something broke</h1>
          <p className="text-faint">
            The page hit an unexpected error and couldn't finish rendering.
          </p>
          {error.message && (
            <pre className="rule" style={{ whiteSpace: "pre-wrap", overflowX: "auto" }}>
              {error.message}
            </pre>
          )}
          <button className="btn btn--primary" onClick={this.handleReload}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
