"use client";

import { Component, type ReactNode } from "react";

interface PanelBoundaryProps {
  /** The panel's command: opening another one clears the crash. */
  command: string;
  children: ReactNode;
}

/** Keeps a crash inside its panel, so the others carry on. */
export class PanelBoundary extends Component<PanelBoundaryProps, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidUpdate({ command }: PanelBoundaryProps) {
    if (this.state.crashed && command !== this.props.command) this.setState({ crashed: false });
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <p role="alert" className="text-down">
        This panel hit an error. Open another function here, or reload the page.
      </p>
    );
  }
}
