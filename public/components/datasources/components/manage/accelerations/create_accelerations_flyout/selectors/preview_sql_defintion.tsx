/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiAccordion,
  EuiButton,
  EuiCodeBlock,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { CreateAccelerationForm } from '../../../../../../../../common/types/data_connections';
import { formValidator, hasError } from '../create/utils';
import { accelerationQueryBuilder } from '../visual_editors/query_builder';

interface PreviewSQLDefinitionProps {
  accelerationFormData: CreateAccelerationForm;
  setAccelerationFormData: React.Dispatch<React.SetStateAction<CreateAccelerationForm>>;
}

export const PreviewSQLDefinition = ({
  accelerationFormData,
  setAccelerationFormData,
}: PreviewSQLDefinitionProps) => {
  const [isPreviewStale, setIsPreviewStale] = useState(false);
  const [isPreviewTriggered, setIsPreviewTriggered] = useState(false);
  const [sqlCode, setSQLcode] = useState('');

  const onClickPreview = () => {
    const errors = formValidator(accelerationFormData);
    if (hasError(errors)) {
      setAccelerationFormData({ ...accelerationFormData, formErrors: errors });
      return;
    }
    setSQLcode(accelerationQueryBuilder(accelerationFormData));
    setIsPreviewStale(false);
    setIsPreviewTriggered(true);
  };

  useEffect(() => {
    setIsPreviewStale(true);
  }, [accelerationFormData]);

  return (
    <>
      <EuiAccordion
        id="accordion1"
        buttonContent={
          <EuiText data-test-subj="preview-sql-header">
            <h3>Preview SQL definition</h3>
          </EuiText>
        }
        paddingSize="l"
      >
        <EuiFlexGroup>
          <EuiFlexItem grow={false}>
            {isPreviewStale && isPreviewTriggered ? (
              <EuiButton
                iconType="kqlFunction"
                iconSide="left"
                color="success"
                onClick={onClickPreview}
              >
                Update preview
              </EuiButton>
            ) : (
              <EuiButton color="success" onClick={onClickPreview}>
                Generate preview
              </EuiButton>
            )}
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton iconType="popout" iconSide="right">
              Open in Query Workbench
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="l" />
        <EuiCodeBlock language="sql" fontSize="m" paddingSize="m" isCopyable>
          {sqlCode}
        </EuiCodeBlock>
      </EuiAccordion>
    </>
  );
};
