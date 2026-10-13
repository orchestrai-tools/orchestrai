import { Button } from "@warpforge/ui/components/button";
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  contained?: boolean;
}

interface State {
  error: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error.message : "Something broke in the window." };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
        >
          <h1 className="text-base font-semibold">
            {this.props.contained ? "This page hit an error" : "The window hit an error"}
          </h1>
          {this.props.contained && (
            <p className="text-sm text-muted-foreground">
              Your workspace is still available. Retry or open another page from the sidebar.
            </p>
          )}
          <p className="max-w-md text-sm text-destructive">{this.state.error}</p>
          <Button size="sm" variant="outline" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
          <Button size="sm" variant="ghost" onClick={() => window.location.reload()}>
            Reload app
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
