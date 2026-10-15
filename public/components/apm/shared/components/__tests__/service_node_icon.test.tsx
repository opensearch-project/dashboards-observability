/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

const mockUiSettingsGet = jest.fn();
jest.mock('../../../../../framework/core_refs', () => ({
  coreRefs: { core: { uiSettings: { get: (key: string) => mockUiSettingsGet(key) } } },
}));

const mockGetIcon = jest.fn((key: string) => <img alt="" data-icon-key={key} />);
const mockGetDependencyIconKey = jest.fn(
  (type?: string, system?: string) => `Dependency::${system || type}`
);
jest.mock('@osd/apm-topology', () => ({
  getIcon: (key: string) => mockGetIcon(key),
  getDependencyIconKey: (type?: string, system?: string) => mockGetDependencyIconKey(type, system),
}));

jest.mock('../language_icon', () => ({
  LanguageIcon: ({ language }: { language?: string }) => (
    <span data-test-subj="languageIcon">{language}</span>
  ),
}));

import { ServiceNodeIcon } from '../service_node_icon';

describe('ServiceNodeIcon', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUiSettingsGet.mockReturnValue(false);
  });

  it('shows the SDK language icon for a service', () => {
    render(<ServiceNodeIcon name="checkout" nodeType="service" language="java" />);
    expect(screen.getByTestId('languageIcon')).toHaveTextContent('java');
    expect(screen.queryByTestId('apmDependencyIcon')).toBeNull();
  });

  it('shows the language icon when the node type is unknown', () => {
    render(<ServiceNodeIcon name="checkout" language="go" />);
    expect(screen.getByTestId('languageIcon')).toBeInTheDocument();
  });

  it('shows the system icon the map uses for a database, read from its name', () => {
    const { container } = render(
      <ServiceNodeIcon name="postgresql:orders" nodeType="database" environment="generic:default" />
    );
    expect(mockGetDependencyIconKey).toHaveBeenCalledWith('database', 'postgresql');
    expect(container.querySelector('img')).toHaveAttribute(
      'data-icon-key',
      'Dependency::postgresql'
    );
    expect(screen.queryByTestId('languageIcon')).toBeNull();
  });

  it('shows the system icon for a message broker', () => {
    const { container } = render(<ServiceNodeIcon name="kafka:orders" nodeType="messaging" />);
    expect(container.querySelector('img')).toHaveAttribute('data-icon-key', 'Dependency::kafka');
  });

  it('shows the generic glyph for an external endpoint', () => {
    const { container } = render(<ServiceNodeIcon name="api.openai.com" nodeType="external" />);
    expect(mockGetDependencyIconKey).toHaveBeenCalledWith('external', undefined);
    expect(container.querySelector('img')).toHaveAttribute('data-icon-key', 'Dependency::external');
  });

  it('marks the icon for dark mode when the dark theme is on', () => {
    mockUiSettingsGet.mockReturnValue(true);
    render(<ServiceNodeIcon name="redis:cart" nodeType="database" />);
    expect(screen.getByTestId('apmDependencyIcon')).toHaveClass('apmNodeIcon--dark');
  });

  it('does not mark the icon for dark mode in the light theme', () => {
    render(<ServiceNodeIcon name="redis:cart" nodeType="database" />);
    expect(screen.getByTestId('apmDependencyIcon')).not.toHaveClass('apmNodeIcon--dark');
  });

  it('sizes the icon from the size prop', () => {
    render(<ServiceNodeIcon name="redis:cart" nodeType="database" size="l" />);
    expect(screen.getByTestId('apmDependencyIcon')).toHaveStyle({ width: '24px', height: '24px' });
  });
});
