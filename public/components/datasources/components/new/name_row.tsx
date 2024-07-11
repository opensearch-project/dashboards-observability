/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiText, EuiCompressedFormRow, EuiCompressedFieldText } from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { coreRefs } from '../../../../../public/framework/core_refs';

interface ConfigureNameProps {
  currentName: string;
  currentError: string;
  setErrorForForm: React.Dispatch<React.SetStateAction<string>>;
  setNameForRequest: React.Dispatch<React.SetStateAction<string>>;
}

export const NameRow = (props: ConfigureNameProps) => {
  const { setNameForRequest, currentName, currentError, setErrorForForm } = props;
  const { pplService } = coreRefs;

  const [name, setName] = useState<string>(currentName);
  const [existingNames, setExistingNames] = useState<string[]>([]);

  useEffect(() => {
    pplService!.fetch({ query: 'show datasources', format: 'jdbc' }).then((dataconnections) =>
      setExistingNames(
        dataconnections.jsonData.map((x) => {
          return x.DATASOURCE_NAME;
        })
      )
    );
  }, []);

  const onBlur = (e) => {
    if (e.target.value === '') {
      setErrorForForm('Name is a required parameter.');
    } else if (existingNames.includes(e.target.value)) {
      setErrorForForm('Name must be unique across data sources.');
    } else {
      setErrorForForm('');
    }

    setNameForRequest(e.target.value);
  };

  return (
    <EuiCompressedFormRow label="Data source name" isInvalid={currentError.length !== 0} error={currentError}>
      <>
        <EuiText size="xs">
          <p>
            Connection name that OpenSearch Dashboards references. This name should be descriptive
            and concise.
          </p>
        </EuiText>
        <EuiCompressedFieldText
          data-test-subj="name"
          placeholder="Title"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          onBlur={onBlur}
          isInvalid={currentError.length !== 0}
        />
      </>
    </EuiCompressedFormRow>
  );
};
