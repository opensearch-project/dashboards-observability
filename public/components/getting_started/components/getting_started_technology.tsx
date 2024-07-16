/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiAccordion, EuiFlexGroup, EuiFlexItem, EuiCard } from '@elastic/eui';
import awsLogo from '../icons/logs.svg';
import otelLogo from '../icons/otel.svg';

interface TechnologyProps {
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
  onSelectTechnology: (technology: string) => void;
  selectedSource: string;
  selectedTechnology: string;
}

const Technology: React.FC<TechnologyProps> = ({
  isOpen,
  onToggle,
  onSelectTechnology,
  selectedSource,
  selectedTechnology,
}) => {
  const techCatalog = {
    Catalog: [
      // { name: 'AWS: VPC', image: awsLogo },
      // { name: 'AWS: Cloudtrail', image: awsLogo },
      // { name: 'AWS: Cloudfont', image: awsLogo },
      // { name: 'AWS: Waf', image: awsLogo },
      // { name: 'AWS: Rdf', image: awsLogo },
      // { name: 'AWS: S3 access', image: awsLogo },
      // { name: 'K8s', image: awsLogo },
      // { name: 'Nginx', image: awsLogo },
      { name: 'OTEL', image: otelLogo },
      // { name: 'HA-Proxy', image: awsLogo },
      // { name: 'Apache', image: awsLogo },
    ],
    Custom: [
      { name: 'Python Client', image: awsLogo },
      { name: 'Java Client', image: awsLogo },
      { name: 'Golang Client', image: awsLogo },
      { name: 'CSV File', image: awsLogo },
      { name: 'Json File', image: awsLogo },
    ],
    'Sample Data': [
      { name: 'OTEL-Demo', image: awsLogo },
      { name: 'AWS VPC', image: awsLogo },
      { name: 'AWS WAF', image: awsLogo },
      { name: 'AWS CloudTrail', image: awsLogo },
      { name: 'Apache Log', image: awsLogo },
      { name: 'Custom Applicative Log File', image: awsLogo },
      { name: 'K8s metrics', image: awsLogo },
    ],
  };

  const renderCards = (techList) => (
    <EuiFlexGroup wrap>
      {techList.map((tech) => (
        <EuiFlexItem key={tech.name} style={{ minWidth: '14rem', maxWidth: '14rem' }}>
          <EuiCard
            layout="vertical"
            icon={<img src={tech.image} alt={tech.name} style={{ width: 100, height: 100 }} />}
            title={tech.name}
            onClick={() => {
              onSelectTechnology(tech.name);
              onToggle(false);
            }}
          />
        </EuiFlexItem>
      ))}
    </EuiFlexGroup>
  );

  const buttonContent = `Technology: ${selectedTechnology || selectedSource}`;

  return (
    <EuiAccordion
      id="technology"
      buttonContent={buttonContent}
      paddingSize="m"
      forceState={isOpen ? 'open' : 'closed'}
      onToggle={onToggle}
    >
      {selectedSource in techCatalog ? (
        renderCards(techCatalog[selectedSource])
      ) : (
        <div>Select a source to see technologies.</div>
      )}
    </EuiAccordion>
  );
};

export { Technology };
