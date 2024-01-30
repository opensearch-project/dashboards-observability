/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiFlexGroup, EuiFlexItem, EuiSpacer, EuiText, EuiHorizontalRule } from '@elastic/eui';
import React, { useState } from 'react';
import { EuiPanel } from '@elastic/eui';
import { ConnectionManagementCallout } from './connection_management_callout';
import { PrometheusProperties, S3GlueProperties } from './data_connection';
import { DatasourceType } from '../../../../../common/types/data_connections';

interface ConnectionDetailProps {
  dataConnection: string;
  connector: DatasourceType;
  description: string;
  properties: S3GlueProperties | PrometheusProperties;
}

export const ConnectionDetails = (props: ConnectionDetailProps) => {
  const { dataConnection, connector, description, properties } = props;

  const S3ConnectionConfigurationView = () => {
    return (
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiFlexGroup direction="column">
            <EuiFlexItem grow={false}>
              <EuiText className="overview-title">Data source name</EuiText>
              <EuiText size="s" className="overview-content">
                {dataConnection}
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText className="overview-title">Data source description</EuiText>
              <EuiText size="s" className="overview-content">
                {description || '-'}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFlexGroup direction="column">
            <EuiFlexItem grow={false}>
              <EuiText className="overview-title">Index store region</EuiText>
              <EuiText size="s" className="overview-content">
                {(properties as S3GlueProperties)['glue.indexstore.opensearch.region'] || '-'}
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText className="overview-title">Index store URI</EuiText>
              <EuiText size="s" className="overview-content">
                {(properties as S3GlueProperties)['glue.indexstore.opensearch.uri'] || '-'}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  const PrometheusConnectionConfigurationView = () => {
    return (
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiFlexGroup direction="column">
            <EuiFlexItem grow={false}>
              <EuiText className="overview-title">Data source name</EuiText>
              <EuiText size="s" className="overview-content">
                {dataConnection}
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText className="overview-title">Data source description</EuiText>
              <EuiText size="s" className="overview-content">
                {description || '-'}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFlexGroup direction="column">
            <EuiFlexItem grow={false}>
              <EuiText className="overview-title">Prometheus URI</EuiText>
              <EuiText size="s" className="overview-content">
                {(properties as PrometheusProperties)['prometheus.uri'] || '-'}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  const ConnectionConfigurationHeader = () => {
    return (
      <EuiFlexGroup direction="row">
        <EuiFlexItem>
          <EuiText size="m">
            <h2 className="panel-title">Data source configurations</h2>
            Control configurations for your data source.
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  return (
    <>
      <EuiSpacer />
      <ConnectionManagementCallout />
      <EuiSpacer />
      <EuiPanel>
        <ConnectionConfigurationHeader />
        <EuiHorizontalRule />
        {connector === 'S3GLUE' ? (
          <S3ConnectionConfigurationView />
        ) : (
          <PrometheusConnectionConfigurationView />
        )}
      </EuiPanel>
      <EuiSpacer />
      <EuiSpacer />
    </>
  );
};
