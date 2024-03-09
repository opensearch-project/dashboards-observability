/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiComboBox, EuiComboBoxOptionOption, EuiFormRow, EuiLink, EuiText } from '@elastic/eui';
import React, { useState } from 'react';
import {
  ACCELERATION_DEFUALT_SKIPPING_INDEX_NAME,
  ACCELERATION_INDEX_TYPES,
  ACC_INDEX_TYPE_DOCUMENTATION_URL,
} from '../../../../../../../common/constants/data_sources';
import {
  AccelerationIndexType,
  CreateAccelerationForm,
} from '../../../../../../../common/types/data_connections';

interface IndexTypeSelectorProps {
  accelerationFormData: CreateAccelerationForm;
  setAccelerationFormData: React.Dispatch<React.SetStateAction<CreateAccelerationForm>>;
}

export const IndexTypeSelector = ({
  accelerationFormData,
  setAccelerationFormData,
}: IndexTypeSelectorProps) => {
  const [selectedIndexType, setSelectedIndexType] = useState<
    Array<EuiComboBoxOptionOption<string>>
  >([ACCELERATION_INDEX_TYPES[0]]);
  const [loading, _setLoading] = useState(false);

  // useEffect(() => {
  // TODO: Load table schema from cache
  //   if (accelerationFormData.dataTable !== '') {
  //     setLoading(true);
  //     const idPrefix = htmlIdGenerator()();
  //     const query = {
  //       lang: 'sql',
  //       query: `DESC \`${accelerationFormData.dataSource}\`.\`${accelerationFormData.database}\`.\`${accelerationFormData.dataTable}\``,
  //       datasource: accelerationFormData.dataSource,
  //     };

  //     executeAsyncQuery(
  //       accelerationFormData.dataSource,
  //       query,
  //       (response: AsyncApiResponse) => {
  //         const status = response.data.resp.status.toLowerCase();
  //         if (status === AsyncQueryStatus.Success) {
  //           const dataTableFields: DataTableFieldsType[] = response.data.resp.datarows
  //             .filter((row) => !row[0].startsWith('#'))
  //             .map((row, index) => ({
  //               id: `${idPrefix}${index + 1}`,
  //               fieldName: row[0],
  //               dataType: row[1],
  //             }));
  //           setAccelerationFormData({
  //             ...accelerationFormData,
  //             dataTableFields,
  //           });
  //           setLoading(false);
  //         }
  //         if (status === AsyncQueryStatus.Failed || status === AsyncQueryStatus.Cancelled) {
  //           setLoading(false);
  //         }
  //       },
  //       () => setLoading(false)
  //     );
  //   }
  // }, [accelerationFormData.dataTable]);

  const onChangeIndexType = (indexTypeOption: Array<EuiComboBoxOptionOption<string>>) => {
    const indexType = indexTypeOption[0].value as AccelerationIndexType;
    setAccelerationFormData({
      ...accelerationFormData,
      accelerationIndexType: indexType,
      accelerationIndexName:
        indexType === 'skipping' ? ACCELERATION_DEFUALT_SKIPPING_INDEX_NAME : '',
    });
    setSelectedIndexType(indexTypeOption);
  };
  return (
    <>
      <EuiFormRow
        label="Index type"
        helpText="Select the type of index you want to create. Each index type has benefits and costs."
        labelAppend={
          <EuiText size="xs">
            <EuiLink href={ACC_INDEX_TYPE_DOCUMENTATION_URL} target="_blank">
              Help
            </EuiLink>
          </EuiText>
        }
      >
        <EuiComboBox
          placeholder="Select an index type"
          singleSelection={{ asPlainText: true }}
          options={ACCELERATION_INDEX_TYPES}
          selectedOptions={selectedIndexType}
          onChange={onChangeIndexType}
          isInvalid={selectedIndexType.length === 0}
          isClearable={false}
          isLoading={loading}
        />
      </EuiFormRow>
    </>
  );
};
