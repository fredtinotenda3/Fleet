// frontend/shared/errors/ErrorBoundary.tsx

'use client';

import * as React from 'react';
import { AppError } from './AppError';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
     
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <AppError
          title={this.props.fallbackTitle}
          message={this.props.fallbackMessage}
          onRetry={this.handleRetry}
        />
      );
    }
    return this.props.children;
  }
}
