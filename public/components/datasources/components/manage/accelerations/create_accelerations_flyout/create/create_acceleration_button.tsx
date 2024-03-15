/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiButton } from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { CreateAccelerationForm } from '../../../../../../../../common/types/data_connections';
import {
  DirectQueryLoadingStatus,
  DirectQueryRequest,
} from '../../../../../../../../common/types/explorer';
import { useDirectQuery } from '../../../../../../../framework/datasources/direct_query_hook';
import { useToast } from '../../../../../../common/toast';
import { accelerationQueryBuilder } from '../visual_editors/query_builder';
import { formValidator, hasError } from './utils';

interface CreateAccelerationButtonProps {
  accelerationFormData: CreateAccelerationForm;
  setAccelerationFormData: React.Dispatch<React.SetStateAction<CreateAccelerationForm>>;
  resetFlyout: () => void;
}

export const CreateAccelerationButton = ({
  accelerationFormData,
  setAccelerationFormData,
  resetFlyout,
}: CreateAccelerationButtonProps) => {
  const { setToast } = useToast();
  const { loadStatus: directqueryLoadStatus, startLoading: startDirectQuery } = useDirectQuery();
  const [isLoading, setIsLoading] = useState(false);

  const createAcceleration = () => {
    const errors = formValidator(accelerationFormData);
    if (hasError(errors)) {
      setAccelerationFormData({ ...accelerationFormData, formErrors: errors });
      return;
    }

    const requestPayload: DirectQueryRequest = {
      lang: 'sql',
      query: accelerationQueryBuilder(accelerationFormData),
      datasource: accelerationFormData.dataSource,
    };

    startDirectQuery(requestPayload);
    setIsLoading(true);
  };

  useEffect(() => {
    const status = directqueryLoadStatus.toLowerCase();
    if (status === DirectQueryLoadingStatus.SUCCESS) {
      setIsLoading(false);
      setToast('Create acceleration query submitted successfully!', 'success');
      resetFlyout();
    } else if (
      status === DirectQueryLoadingStatus.FAILED ||
      status === DirectQueryLoadingStatus.CANCELED
    ) {
      setIsLoading(false);
      setToast('Create acceleration query failed', 'success');
    }
  }, [directqueryLoadStatus]);

  return (
    <EuiButton onClick={createAcceleration} fill isLoading={isLoading}>
      Create acceleration
    </EuiButton>
  );
};
