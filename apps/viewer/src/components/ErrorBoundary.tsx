import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

// Backstops any render error with a visible message — the SPA never shows a blank crash.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface to the console for debugging; the UI shows the notice below.
    console.error("multibrowser render error:", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div role="alert" className="mx-auto max-w-2xl p-8">
          <h1 className="text-xl font-semibold text-danger">Something went wrong</h1>
          <p className="mt-2 text-default-600">
            The page hit an unexpected error and couldn't render. Try reloading.
          </p>
          <pre className="mt-4 overflow-auto rounded bg-default-100 p-3 text-xs text-default-600">
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
