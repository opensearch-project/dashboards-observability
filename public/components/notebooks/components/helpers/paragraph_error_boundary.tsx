/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiCallOut } from '@elastic/eui';
import React, { Component } from 'react';

// Isolates render failures in individual paragraphs so one bad paragraph
// (or a library-side render crash, e.g. EuiDataGrid cell ref becoming null)
// can't take down the whole notebook view.
export class ParagraphErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('Paragraph render error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <EuiCallOut title="Paragraph failed to render" color="warning" iconType="alert" size="s">
          <p>
            This paragraph hit a render error. Try reloading the notebook or deleting this
            paragraph.
          </p>
        </EuiCallOut>
      );
    }
    return this.props.children;
  }
}
