import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Roller Coaster Builder Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full text-center">
            <div className="text-4xl mb-4">🎢💥</div>
            <h1 className="text-xl font-bold text-white mb-2">
              Oops! Something went wrong
            </h1>
            <p className="text-gray-400 mb-4 text-sm">
              The roller coaster builder encountered an unexpected error.
            </p>
            {this.state.error && (
              <pre className="bg-gray-900 rounded p-2 text-xs text-red-400 mb-4 overflow-auto max-h-32 text-left">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Simple fallback for 3D canvas errors
export function Canvas3DErrorFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
      <div className="text-center p-4">
        <div className="text-4xl mb-4">🎢</div>
        <h2 className="text-white text-lg font-semibold mb-2">
          3D Rendering Error
        </h2>
        <p className="text-gray-400 text-sm mb-4">
          WebGL might not be supported or enabled in your browser.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
