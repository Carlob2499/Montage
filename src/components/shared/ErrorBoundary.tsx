import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { db } from '../../db/db';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message: string;
  confirmingReset: boolean;
}

/**
 * Root error boundary. Catches render throws — including dexie-react-hooks
 * `useLiveQuery` re-throwing when IndexedDB fails to open — so the app shows
 * a recovery screen instead of a silent white page. Boundaries must be
 * class components.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '', confirmingReset: false };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Montage crashed:', error, info);
  }

  private resetDatabase = async () => {
    try {
      db.close();
      await db.delete();
    } catch (err) {
      console.error('DB reset failed', err);
    }
    location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="surface w-full max-w-sm rounded-2xl p-6 text-center">
          <div className="mb-2 text-3xl">😵‍💫</div>
          <h1 className="text-lg font-semibold">Something broke</h1>
          <p className="mt-2 text-sm text-ink-500">
            Montage hit an unexpected error. Your photos are safe on this device. Reloading usually
            fixes it.
          </p>
          {this.state.message && (
            <p className="mt-2 break-words rounded-lg bg-ink-100 px-2 py-1 text-[11px] text-ink-400 dark:bg-ink-800">
              {this.state.message}
            </p>
          )}
          <button className="btn-primary mt-4 w-full" onClick={() => location.reload()}>
            Reload
          </button>
          {this.state.confirmingReset ? (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-red-500">
                This erases all albums, photos and projects on this device. Sure?
              </p>
              <div className="flex gap-2">
                <button
                  className="btn-soft flex-1 text-xs"
                  onClick={() => this.setState({ confirmingReset: false })}
                >
                  Keep my data
                </button>
                <button
                  className="btn flex-1 bg-red-600 text-xs text-white"
                  onClick={() => void this.resetDatabase()}
                >
                  Erase & reload
                </button>
              </div>
            </div>
          ) : (
            <button
              className="btn-ghost mt-2 w-full text-xs text-ink-400"
              onClick={() => this.setState({ confirmingReset: true })}
            >
              Still broken? Reset the database
            </button>
          )}
        </div>
      </div>
    );
  }
}
