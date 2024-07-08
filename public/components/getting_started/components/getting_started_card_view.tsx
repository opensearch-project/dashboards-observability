/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiPanel, EuiCard, EuiFlexGroup, EuiFlexItem, EuiSpacer, EuiIcon } from '@elastic/eui';
import React, { useState } from 'react';
import { GettingStartedDescription } from './getting_started_description';
import logs from '../icons/logs.svg';
import { GettingStartedType } from '../../../../common/types/getting_started';

export interface GettingStartedCard {
  name: GettingStartedType;
  displayName: string;
  description: string;
  displayIcon: JSX.Element;
  // onClick: () => void;
}

interface GettingStartedCardViewProps {
  category: 'byType' | 'byTechnology' | 'byLanguage';
  size?: 'small' | 'large';
}

export function GettingStartedCardView({ category, size = 'large' }: GettingStartedCardViewProps) {
  const [selectedCards, setSelectedCards] = useState<GettingStartedType[]>([]);
  const byType: GettingStartedCard[] = [
    {
      name: 'Logs',
      displayName: 'Logs',
      description: 'The Logs',
      displayIcon: <EuiIcon type={logs} size="xl" />,
      // onClick: () => (window.location.hash = `#tutorial/${LogsURL}`),
    },
    {
      name: 'Metrics',
      displayName: 'Metrics',
      description: 'The Metrics',
      displayIcon: <EuiIcon type={logs} size="xl" />,
      // onClick: () => (window.location.hash = `#/tutorial/${MetricsURL}`),
    },
    {
      name: 'Traces',
      displayName: 'Traces',
      description: 'The Traces',
      displayIcon: <EuiIcon type={logs} size="xl" />,
      // onClick: () => (window.location.hash = `#/tutorial/${TracesURL}`),
    },
    {
      name: 'Profiling',
      displayName: 'Profiling',
      description: 'The Profiling',
      displayIcon: <EuiIcon type={logs} size="xl" />,
      // onClick: () => (window.location.hash = `#/tutorial/${ProfilingURL}`),
    },
  ];

  const byTechnology: GettingStartedCard[] = [
    {
      name: 'Logs',
      displayName: 'OpenTelemtry',
      description: '..',
      displayIcon: <EuiIcon type={logs} size="xl" />,
      // onClick: () => (window.location.hash = `#tutorial/${LogsURL}`),
    },
    {
      name: 'Metrics',
      displayName: 'Kubernetes',
      description: '...',
      displayIcon: <EuiIcon type={logs} size="xl" />,
      // onClick: () => (window.location.hash = `#/tutorial/${MetricsURL}`),
    },
    {
      name: 'Metrics',
      displayName: 'AWS',
      description: '...',
      displayIcon: <EuiIcon type={logs} size="xl" />,
      // onClick: () => (window.location.hash = `#/tutorial/${MetricsURL}`),
    },
  ];

  const byLanguage: GettingStartedCard[] = [
    {
      name: 'Logs',
      displayName: 'Java',
      description: '',
      displayIcon: <EuiIcon type={logs} size="xl" />,
      // onClick: () => (window.location.hash = `#tutorial/${LogsURL}`),
    },
    {
      name: 'Metrics',
      displayName: 'Python',
      description: '',
      displayIcon: <EuiIcon type={logs} size="xl" />,
      // onClick: () => (window.location.hash = `#/tutorial/${MetricsURL}`),
    },
    {
      name: 'Metrics',
      displayName: 'GoLang',
      description: '',
      displayIcon: <EuiIcon type={logs} size="xl" />,
      // onClick: () => (window.location.hash = `#/tutorial/${MetricsURL}`),
    },
  ];

  const getCardsByCategory = () => {
    switch (category) {
      case 'byTechnology':
        return byTechnology;
      case 'byLanguage':
        return byLanguage;
      case 'byType':
      default:
        return byType;
    }
  };

  const getTitleByCategory = () => {
    switch (category) {
      case 'byTechnology':
        return 'By Technology';
      case 'byLanguage':
        return 'By Language';
      case 'byType':
      default:
        return 'By Type';
    }
  };

  const handleCardClick = (name: GettingStartedType) => {
    setSelectedCards((prevSelectedCards) =>
      prevSelectedCards.includes(name)
        ? prevSelectedCards.filter((card) => card !== name)
        : [...prevSelectedCards, name]
    );
  };

  const renderRows = (gettingStarted: GettingStartedCard[]) => {
    return (
      <>
        <EuiFlexGroup gutterSize="l" style={{ flexWrap: 'wrap' }}>
          {gettingStarted.map((i) => (
            <EuiFlexItem
              key={i.name}
              style={{
                minWidth: size === 'small' ? '10rem' : '14rem',
                maxWidth: size === 'small' ? '10rem' : '14rem',
              }}
            >
              <EuiCard
                icon={i.displayIcon}
                title={i.displayName}
                description={i.description}
                data-test-subj={`datasource_card_${i.name.toLowerCase()}`}
                titleElement="span"
                onClick={() => handleCardClick(i.name)}
                isSelected={selectedCards.includes(i.name)}
              />
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
        <EuiSpacer />
      </>
    );
  };

  return (
    <EuiPanel>
      <GettingStartedDescription title={getTitleByCategory()} />
      {renderRows(getCardsByCategory())}
    </EuiPanel>
  );
}
