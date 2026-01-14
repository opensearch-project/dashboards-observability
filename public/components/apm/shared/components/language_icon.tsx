/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiIcon } from '@elastic/eui';
import 'devicon/devicon.min.css';

interface LanguageIconProps {
  language?: string;
  size?: 's' | 'm' | 'l';
}

// Language to devicon class mapping
// Maps OpenTelemetry SDK language names to devicon CSS classes
// Covers all OpenTelemetry SDK supported languages
// See: https://devicon.dev/
const LANGUAGE_ICON_MAP: Record<string, string> = {
  java: 'devicon-java-plain colored',
  python: 'devicon-python-plain colored',
  js: 'devicon-javascript-plain colored',
  javascript: 'devicon-javascript-plain colored',
  nodejs: 'devicon-nodejs-plain colored',
  node: 'devicon-nodejs-plain colored',
  go: 'devicon-go-original-wordmark colored',
  golang: 'devicon-go-original-wordmark colored',
  ruby: 'devicon-ruby-plain colored',
  php: 'devicon-php-plain colored',
  rust: 'devicon-rust-original colored',
  cpp: 'devicon-cplusplus-plain colored',
  'c++': 'devicon-cplusplus-plain colored',
  swift: 'devicon-swift-plain colored',
  dotnet: 'devicon-csharp-plain colored',
  '.net': 'devicon-csharp-plain colored',
  csharp: 'devicon-csharp-plain colored',
  'c#': 'devicon-csharp-plain colored',
  erlang: 'devicon-erlang-plain colored',
  elixir: 'devicon-elixir-plain colored',
};

/**
 * LanguageIcon - Displays SDK language icon for a service
 *
 * Shows devicon for supported languages, EUI gear icon for unknown/empty.
 * Language detected from service's `telemetry.sdk.language` attribute.
 *
 * @param language - Language string from OpenTelemetry SDK (optional)
 * @param size - Icon size ('s', 'm', 'l')
 */
export const LanguageIcon: React.FC<LanguageIconProps> = ({ language, size = 'm' }) => {
  // Handle missing or empty language - show gear icon
  if (!language || language.trim() === '') {
    return <EuiIcon type="gear" size={size} />;
  }

  const normalizedLang = language.toLowerCase().trim();
  const iconClass = LANGUAGE_ICON_MAP[normalizedLang];

  // Unknown language - show gear icon
  if (!iconClass) {
    return <EuiIcon type="gear" size={size} />;
  }

  // Map EUI size to pixel size
  const iconSize = size === 's' ? 16 : size === 'm' ? 20 : 24;

  return (
    <i
      className={iconClass}
      style={{
        fontSize: iconSize,
        width: iconSize,
        height: iconSize,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      aria-label={`${language} language icon`}
    />
  );
};
