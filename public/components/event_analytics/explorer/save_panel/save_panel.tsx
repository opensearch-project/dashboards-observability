/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  EuiTitle,
  EuiComboBox,
  EuiFormRow,
  EuiFieldText,
  EuiSwitch,
  EuiToolTip,
} from '@elastic/eui';
import { useEffect } from 'react';
import { isEmpty } from 'lodash';
import { useDispatch, useSelector } from 'react-redux';
import SavedObjects from '../../../../services/saved_objects/event_analytics/saved_objects';
import {
  fetchPanels,
  selectPanelList,
} from '../../../../../public/components/custom_panels/redux/panel_slice';

interface ISavedPanelProps {
  selectedOptions: any;
  handleNameChange: any;
  handleOptionChange: any;
  savedObjects: SavedObjects;
  savePanelName: string;
  showOptionList: boolean;
  curVisId: string;
  setSubType: any;
  isSaveAsMetricEnabled: boolean;
}

interface CustomPanelOptions {
  id: string;
  name: string;
  dateCreated: string;
  dateModified: string;
}

export const SavePanel = ({
  selectedOptions,
  handleNameChange,
  handleOptionChange,
  savedObjects,
  savePanelName,
  showOptionList,
  setSubType,
  isSaveAsMetricEnabled,
}: ISavedPanelProps) => {
  const [checked, setChecked] = useState(false);
  const [svpnlError, setSvpnlError] = useState(null);

  const customPanels = useSelector(selectPanelList);

  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(fetchPanels());
  }, []);

  const onToggleChange = (e: { target: { checked: React.SetStateAction<boolean> } }) => {
    setChecked(e.target.checked);
    if (e.target.checked) {
      setSubType('metric');
    } else {
      setSubType('visualization');
    }
  };

  return (
    <>
      {showOptionList && (
        <>
          <EuiTitle size="xxs">
            <h3>{'Custom operational dashboards/application'}</h3>
          </EuiTitle>
          <EuiFormRow helpText="Search existing dashboards or applications by name">
            <EuiComboBox
              placeholder="Select dashboards/applications"
              onChange={(daOptions) => {
                handleOptionChange(daOptions);
              }}
              selectedOptions={selectedOptions}
              options={customPanels.map((option: any) => {
                return {
                  panel: option,
                  label: option.title,
                };
              })}
              isClearable={true}
              data-test-subj="eventExplorer__querySaveComboBox"
            />
          </EuiFormRow>
        </>
      )}
      <EuiTitle size="xxs">
        <h3>Name</h3>
      </EuiTitle>
      <EuiFormRow helpText="Name for your savings">
        <EuiFieldText
          key={'save-panel-id'}
          value={savePanelName}
          isInvalid={isEmpty(savePanelName)}
          onChange={(e) => {
            handleNameChange(e.target.value);
          }}
          data-test-subj="eventExplorer__querySaveName"
        />
      </EuiFormRow>
      {showOptionList && (
        <>
          <EuiFormRow display="columnCompressedSwitch">
            <EuiToolTip content="Only Time Series visualization and a query including stats/span can be saved as Metric">
              <EuiSwitch
                showLabel={true}
                label="Save as Metric"
                checked={checked}
                onChange={onToggleChange}
                compressed
                disabled={!isSaveAsMetricEnabled}
              />
            </EuiToolTip>
          </EuiFormRow>
        </>
      )}
    </>
  );
};
