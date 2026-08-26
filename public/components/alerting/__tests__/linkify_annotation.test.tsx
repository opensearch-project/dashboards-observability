/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from '@testing-library/react';
import { LinkifyAnnotation, isSafeHttpUrl } from '../linkify_annotation';

describe('isSafeHttpUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isSafeHttpUrl('http://runbooks.example/api')).toBe(true);
    expect(isSafeHttpUrl('https://runbooks.example/api?x=1#frag')).toBe(true);
  });

  it('rejects non-URL plain text', () => {
    expect(isSafeHttpUrl('see the wiki')).toBe(false);
    expect(isSafeHttpUrl('www.example.com')).toBe(false);
    expect(isSafeHttpUrl('')).toBe(false);
  });

  it('rejects unsafe / non-http schemes', () => {
    // eslint-disable-next-line no-script-url
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeHttpUrl('ftp://host/file')).toBe(false);
  });
});

describe('LinkifyAnnotation', () => {
  it('renders a safe URL as an external link', () => {
    const { getByText } = render(
      <LinkifyAnnotation value="https://runbooks.example/api" data-test-subj="v" />
    );
    const link = getByText('https://runbooks.example/api');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', 'https://runbooks.example/api');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
  });

  it('renders plain text (not a link) for non-URL values', () => {
    const { getByText } = render(<LinkifyAnnotation value="oncall handbook" data-test-subj="v" />);
    const node = getByText('oncall handbook');
    expect(node.tagName).not.toBe('A');
  });

  it('does not linkify unsafe schemes', () => {
    // eslint-disable-next-line no-script-url
    const value = 'javascript:alert(1)';
    const { getByText } = render(<LinkifyAnnotation value={value} data-test-subj="v" />);
    const node = getByText(value);
    expect(node.tagName).not.toBe('A');
  });

  it('renders the fallback for empty values', () => {
    const { getByText } = render(<LinkifyAnnotation value="" fallback="—" data-test-subj="v" />);
    expect(getByText('—')).toBeInTheDocument();
  });
});
