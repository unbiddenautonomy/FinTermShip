import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui';

/**
 * A screen that fails to load or render leaves a message, not a blank page. Every screen but
 * Home arrives as its own file, so a dropped connection mid-download used to take the whole app
 * down. Reloading fetches the file again, and the learner's progress is saved on this device.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Screen failed:', error, info.componentStack);
  }

  /** Moving to another screen tries again: one screen that failed shouldn't hold the others. */
  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto flex min-h-[60dvh] max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-extrabold text-ink">That screen didn&apos;t load.</p>
        <p className="text-sm text-ink-2">Your progress is safe. This is usually the connection, so trying again normally fixes it.</p>
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </div>
    );
  }
}
