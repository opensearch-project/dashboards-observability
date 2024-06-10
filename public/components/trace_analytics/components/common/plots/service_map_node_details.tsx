/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiButton,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import React from 'react';
import { ServiceNodeDetails } from '../../../../../../common/types/trace_analytics';

interface ServiceMapNodeDetailsProps {
  selectedNodeDetails: ServiceNodeDetails | null;
  setSelectedNodeDetails: React.Dispatch<React.SetStateAction<ServiceNodeDetails | null>>;
  addServiceFilter: (selectedServiceName: string) => void;
  setCurrentSelectedService?: (value: React.SetStateAction<string>) => void;
}

export const ServiceMapNodeDetails = ({
  selectedNodeDetails,
  setSelectedNodeDetails,
  addServiceFilter,
  setCurrentSelectedService,
}: ServiceMapNodeDetailsProps) => {
  return (
    <EuiPanel>
      <EuiFlexGroup justifyContent="spaceBetween">
        <EuiFlexItem grow={false}>
          <EuiText>
            <h4>{selectedNodeDetails?.label}</h4>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonIcon
            aria-label="Close node details"
            iconType="cross"
            color="text"
            onClick={() => setSelectedNodeDetails(null)}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="l" />
      <EuiText>{selectedNodeDetails?.average_latency}</EuiText>
      <EuiText>{selectedNodeDetails?.error_rate}</EuiText>
      <EuiText>{selectedNodeDetails?.throughput}</EuiText>
      <EuiSpacer size="l" />
      <EuiFlexGroup direction="column" gutterSize="s">
        <EuiFlexItem>
          <EuiButton
            fill
            onClick={() =>
              setCurrentSelectedService &&
              selectedNodeDetails &&
              setCurrentSelectedService(selectedNodeDetails?.label)
            }
          >
            View service details
          </EuiButton>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiButton
            onClick={() => selectedNodeDetails && addServiceFilter(selectedNodeDetails?.label)}
          >
            Filter map
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};
