/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiButton, EuiCallOut } from '@elastic/eui';
import React from 'react';
import {
  DATACONNECTIONS_BASE,
  DATACONNECTIONS_UPDATE_STATUS,
  EDIT,
} from '../../../../../common/constants/shared';
import { coreRefs } from '../../../../framework/core_refs';
import { useToast } from '../../../common/toast';
import { DatasourceDetails } from './data_connection';

interface InactiveDataConnectionCalloutProps {
  datasourceDetails: DatasourceDetails;
  fetchSelectedDatasource: () => void;
}

export const InactiveDataConnectionCallout = ({
  datasourceDetails,
  fetchSelectedDatasource,
}: InactiveDataConnectionCalloutProps) => {
  const { setToast } = useToast();
  const { http } = coreRefs;
  const enableDataSource = () => {
    http!
      .post(`${DATACONNECTIONS_BASE}${EDIT}${DATACONNECTIONS_UPDATE_STATUS}`, {
        body: JSON.stringify({ name: datasourceDetails.name, status: 'active' }),
      })
      .then(() => {
        setToast(`Data connection ${datasourceDetails.name} enabled successfully`);
        fetchSelectedDatasource();
      })
      .catch((err) => {
        console.error(err);
        setToast(`Data connection ${datasourceDetails.name} could not be enabled.`, 'danger');
      });
  };

  return (
    <EuiCallOut title="This data source connection is inactive" color="warning" iconType="help">
      <p>
        Associated objects and accelerations are not available while this connection is inactive.
      </p>
      <EuiButton onClick={enableDataSource} color="warning">
        Enable connection
      </EuiButton>
    </EuiCallOut>
  );
};
