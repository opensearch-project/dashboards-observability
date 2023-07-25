/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './accelerate.scss';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiGlobalToastList,
  EuiLoadingSpinner,
  EuiOverlayMask,
  EuiPage,
  EuiPageBody,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiCheckableCard,
  htmlIdGenerator,
  EuiTitle,
  EuiText,
  EuiLink,
} from '@elastic/eui';
import React, { ReactChild, useEffect, useState } from 'react';
import { AccelerateHeader } from './accelerate_header';
import { AccelerateCallout } from './accelerate_callout';
import { OPENSEARCH_DOCUMENTATION_URL } from '../../../common/constants/integrations';

export function AcceleratePage(props: any) {
  const [useCase, setUseCase] = useState('queryAcceleration');
  const [accelerationMethod, setAccelerationMethod] = useState('coveredIndex');

  const useCaseGroup = () => {
    return (
      <EuiFlexGroup>
        <EuiFlexItem className="accelerateCheckableCard" grow={false}>
          <EuiCheckableCard
            label="Query acceleration only"
            value="radio1"
            checked={useCase === 'queryAcceleration'}
            onChange={() => setUseCase('queryAcceleration')}
            id={htmlIdGenerator()()}
          >
            <EuiText>
              Index only meta-data in OpenSearch to speed up query performance when querying through
              Data Explorer.
            </EuiText>
          </EuiCheckableCard>
        </EuiFlexItem>
        <EuiFlexItem className="accelerateCheckableCard" grow={false}>
          <EuiCheckableCard
            label="Full OpenSearch functionality"
            value="radio1"
            checked={useCase === 'fullFunctionality'}
            onChange={() => setUseCase('fullFunctionality')}
            id={htmlIdGenerator()()}
          >
            <EuiText>
              Ingest data into OpenSearch to use all Dashboards features and better query
              performance in Data Explorer.
            </EuiText>
          </EuiCheckableCard>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  const accelerationMethodGroup = () => {
    return (
      <EuiFlexGroup>
        <EuiFlexItem className="accelerateCheckableCard" grow={false}>
          <EuiCheckableCard
            label="Covered Index"
            value="radio1"
            checked={accelerationMethod === 'coveredIndex'}
            onChange={() => setAccelerationMethod('coveredIndex')}
            id={htmlIdGenerator()()}
          >
            <EuiText>
              Index only meta-data in OpenSearch to speed up query performance when querying through
              Data Explorer.
            </EuiText>
          </EuiCheckableCard>
        </EuiFlexItem>
        <EuiFlexItem className="accelerateCheckableCard" grow={false}>
          <EuiCheckableCard
            label="Materialized View"
            value="radio1"
            checked={accelerationMethod === 'materializedView'}
            onChange={() => setAccelerationMethod('materializedView')}
            id={htmlIdGenerator()()}
          >
            <EuiText>
              Ingest data into OpenSearch to use all Dashboards features and better query
              performance in Data Explorer.
            </EuiText>
          </EuiCheckableCard>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  return (
    <EuiPage>
      <EuiPageBody>
        <AccelerateHeader />
        <AccelerateCallout />
        <EuiSpacer />
        <EuiTitle size="s" data-test-subj="accelerate-header">
          <h2>Select use case</h2>
        </EuiTitle>
        <EuiText size="s" color="subdued">
          Select the acceleration option that best suites your use case.{' '}
          <EuiLink external={true} href={OPENSEARCH_DOCUMENTATION_URL} target="blank">
            Learn more
          </EuiLink>
        </EuiText>
        <EuiSpacer />
        {useCaseGroup()}
        <EuiSpacer />
        {/* <EuiTitle size="s" data-test-subj="accelerate-header">
              <h2>Data source selection</h2>
              </EuiTitle>
              <EuiText size="s" color="subdued">
         Select the acceleration option that best suites your use case.{' '}
          <EuiLink external={true} href={OPENSEARCH_DOCUMENTATION_URL} target="blank">
            Learn more
          </EuiLink>
        </EuiText> */}
        <EuiTitle size="s" data-test-subj="accelerate-header">
          <h2>Acceleration Method</h2>
        </EuiTitle>
        <EuiText size="s" color="subdued">
          OpenSearch provides multiple ways to accelerate data. Select the best indexing option
          based on your needs{' '}
          <EuiLink external={true} href={OPENSEARCH_DOCUMENTATION_URL} target="blank">
            Learn more
          </EuiLink>
        </EuiText>
        <EuiSpacer />
        {accelerationMethodGroup()}
      </EuiPageBody>
    </EuiPage>
  );
}
