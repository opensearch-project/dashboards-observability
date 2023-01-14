/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable no-console */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiButton,
  EuiButtonIcon,
  EuiCallOut,
  EuiComboBox,
  EuiComboBoxOptionOption,
  EuiDatePicker,
  EuiDatePickerRange,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiFormRow,
  EuiIcon,
  EuiLoadingChart,
  EuiSelect,
  EuiSelectOption,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
  ShortDate,
  htmlIdGenerator,
} from '@elastic/eui';
import _ from 'lodash';
import React, { useEffect, useState } from 'react';
import { FlyoutContainers } from '../../../common/flyout_containers';
import {
  createDashboardVizObject,
  displayVisualization,
  getQueryResponse,
  isDateValid,
} from '../../helpers/utils';
import { convertDateTime } from '../../helpers/utils';
import PPLService from '../../../../services/requests/ppl';
import { CoreStart } from '../../../../../../../src/core/public';
import { CUSTOM_PANELS_API_PREFIX } from '../../../../../common/constants/custom_panels';
import {
  pplResponse,
  SavedVisualizationType,
  VisualizationType,
} from '../../../../../common/types/custom_panels';
import './visualization_flyout.scss';
import { uiSettingsService } from '../../../../../common/utils';
import { DashboardStart } from '../../../../../../../src/plugins/dashboard/public';
import { NOTEBOOKS_API_PREFIX } from '../../../../../common/constants/notebooks';

/*
 * VisaulizationFlyout - This module create a flyout to add visualization
 *
 * Props taken in as params are:
 * panelId: panel Id of current operational panel
 * closeFlyout: function to close the flyout
 * start: start time in date filter
 * end: end time in date filter
 * setToast: function to set toast in the panel
 * http: http core service
 * pplService: ppl requestor service
 * setPanelVisualizations: function set the visualization list in panel
 * isFlyoutReplacement: boolean to see if the flyout is trigger for add or replace visualization
 * replaceVisualizationId: string id of the visualization to be replaced
 */

interface VisualizationFlyoutProps {
  panelId: string;
  DashboardContainerByValueRenderer: DashboardStart['DashboardContainerByValueRenderer'];
  pplFilterValue: string;
  closeFlyout: () => void;
  start: ShortDate;
  end: ShortDate;
  setToast: (
    title: string,
    color?: string,
    text?: React.ReactChild | undefined,
    side?: string | undefined
  ) => void;
  http: CoreStart['http'];
  pplService: PPLService;
  setPanelVisualizations: React.Dispatch<React.SetStateAction<VisualizationType[]>>;
  isFlyoutReplacement?: boolean | undefined;
  replaceVisualizationId?: string | undefined;
  appId?: string;
}

export const VisaulizationFlyout = ({
  panelId,
  DashboardContainerByValueRenderer,
  appId = '',
  pplFilterValue,
  closeFlyout,
  start,
  end,
  setToast,
  http,
  pplService,
  setPanelVisualizations,
  isFlyoutReplacement,
  replaceVisualizationId,
}: VisualizationFlyoutProps) => {
  const [newVisualizationTitle, setNewVisualizationTitle] = useState('');
  const [newVisualizationType, setNewVisualizationType] = useState('');
  const [newVisualizationTimeField, setNewVisualizationTimeField] = useState('');
  const [previewMetaData, setPreviewMetaData] = useState<SavedVisualizationType>();
  const [pplQuery, setPPLQuery] = useState('');
  const [previewData, setPreviewData] = useState<pplResponse>({} as pplResponse);
  const [previewArea, setPreviewArea] = useState(<></>);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [isPreviewError, setIsPreviewError] = useState('');
  const [savedVisualizations, setSavedVisualizations] = useState<SavedVisualizationType[]>([]);
  const [visualizationOptions, setVisualizationOptions] = useState<EuiSelectOption[]>([]);
  // const [selectValue, setSelectValue] = useState('');

  const [visOptions, setVisOptions] = useState<EuiComboBoxOptionOption[]>([]); // options for loading saved visualizations
  const [selectedVisOption, setSelectedVisOption] = useState<EuiComboBoxOptionOption[]>([]);
  const [visInput, setVisInput] = useState(undefined);
  const [visType, setVisType] = useState('');

  // DateTimePicker States
  const startDate = convertDateTime(start, true, false);
  const endDate = convertDateTime(end, false, false);

  const isInputValid = () => {
    if (!isDateValid(convertDateTime(start), convertDateTime(end, false), setToast, 'left')) {
      return false;
    }

    if (selectedVisOption.length === 0) {
      setToast('Please make a valid selection', 'danger', undefined, 'left');
      return false;
    }

    return true;
  };

  const addVisualization = () => {
    if (!isInputValid()) return;

    if (isFlyoutReplacement) {
      http
        .post(`${CUSTOM_PANELS_API_PREFIX}/visualizations/replace`, {
          body: JSON.stringify({
            panelId,
            savedVisualizationId: selectedVisOption[0].key,
            oldVisualizationId: replaceVisualizationId,
            newVisualizationType: selectedVisOption[0].className,
          }),
        })
        .then(async (res) => {
          setPanelVisualizations(res.visualizations);
          setToast(`Visualization ${newVisualizationTitle} successfully added!`, 'success');
        })
        .catch((err) => {
          setToast(`Error in adding ${newVisualizationTitle} visualization to the panel`, 'danger');
          console.error(err);
        });
    } else {
      http
        .post(`${CUSTOM_PANELS_API_PREFIX}/visualizations`, {
          body: JSON.stringify({
            panelId,
            savedVisualizationId: selectedVisOption[0].key,
            newVisualizationType: selectedVisOption[0].className,
          }),
        })
        .then(async (res) => {
          setPanelVisualizations(res.visualizations);
          setToast(`Visualization ${newVisualizationTitle} successfully added!`, 'success');
        })
        .catch((err) => {
          setToast(`Error in adding ${newVisualizationTitle} visualization to the panel`, 'danger');
          console.error(err);
        });
    }
    closeFlyout();
  };

  const onRefreshPreview = () => {
    if (!isInputValid()) return;

    if (selectedVisOption[0].className === 'observability')
      getQueryResponse(
        pplService,
        pplQuery,
        newVisualizationType,
        start,
        end,
        setPreviewData,
        setPreviewLoading,
        setIsPreviewError,
        pplFilterValue,
        newVisualizationTimeField
      );
    else {
      setPreviewArea(
        <>
          {timeRange}
          <br />
          <DashboardContainerByValueRenderer
            // key={htmlIdGenerator()()}
            input={createDashboardVizObject(selectedVisOption[0].key, start, end)}
            // onInputUpdated={setVisInput}
          />
        </>
      );
    }
  };

  const timeRange = (
    <EuiToolTip
      position="bottom"
      content="Picker is disabled. Please edit date/time from panel"
      display="block"
    >
      <EuiFormRow label="Panel Time Range" fullWidth>
        <EuiDatePickerRange
          className="date-picker-preview"
          fullWidth
          readOnly
          startDateControl={
            <EuiDatePicker
              selected={startDate}
              startDate={startDate}
              endDate={endDate}
              isInvalid={startDate > endDate}
              aria-label="Start date"
              dateFormat={uiSettingsService.get('dateFormat')}
            />
          }
          endDateControl={
            <EuiDatePicker
              selected={endDate}
              startDate={startDate}
              endDate={endDate}
              isInvalid={startDate > endDate}
              aria-label="End date"
              dateFormat={uiSettingsService.get('dateFormat')}
            />
          }
        />
      </EuiFormRow>
    </EuiToolTip>
  );

  const flyoutHeader = (
    <EuiFlyoutHeader hasBorder>
      <EuiTitle size="m">
        <h2 id="addVisualizationFlyout">
          {isFlyoutReplacement ? 'Replace visualization' : 'Select existing visualization'}
        </h2>
      </EuiTitle>
    </EuiFlyoutHeader>
  );

  const emptySavedVisualizations = (
    <EuiCallOut iconType="help">
      <p>No saved visualizations found!</p>
    </EuiCallOut>
  );

  const flyoutBody =
    _.flatten(_.map(visOptions, 'options')).length > 0 ? (
      <EuiFlyoutBody>
        <>
          <EuiSpacer size="s" />
          <EuiFormRow label="Visualization name">
            <EuiComboBox
              placeholder="Find visualization"
              singleSelection={{ asPlainText: true }}
              options={visOptions}
              selectedOptions={selectedVisOption}
              onChange={(newOption: EuiComboBoxOptionOption[]) => {
                if (newOption.length > 0) setVisType(newOption[0].className);
                setSelectedVisOption(newOption);
                // setIsOutputStale(true);
              }}
            />
          </EuiFormRow>
          <EuiSpacer size="l" />
          <EuiFlexGroup alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiText grow={false}>
                <h4>Preview</h4>
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonIcon
                aria-label="refreshPreview"
                iconType="refresh"
                onClick={onRefreshPreview}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="s" />
          {previewArea}
        </>
      </EuiFlyoutBody>
    ) : (
      <EuiFlyoutBody banner={emptySavedVisualizations}>
        <>
          <div>{'Please use the "create new visualization" option in add visualization menu.'}</div>
        </>
      </EuiFlyoutBody>
    );

  const flyoutFooter = (
    <EuiFlyoutFooter>
      <EuiFlexGroup gutterSize="s" justifyContent="spaceBetween">
        <EuiFlexItem grow={false}>
          <EuiButton onClick={closeFlyout}>Cancel</EuiButton>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton onClick={addVisualization} fill>
            Add
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlyoutFooter>
  );

  // fetch OSD visualizations and observability vsualizations
  const fetchVisualizations = async () => {
    let opt1: EuiComboBoxOptionOption[] = [];
    let opt2: EuiComboBoxOptionOption[] = [];
    await http
      .get(`${NOTEBOOKS_API_PREFIX}/visualizations`)
      .then((res) => {
        opt1 = res.savedVisualizations.map((vizObject) => ({
          label: vizObject.label,
          key: vizObject.key,
          className: 'dashboards',
        }));
      })
      .catch((err) => console.error('Fetching dashboard visualization issue', err.body.message));

    await http
      .get(`${CUSTOM_PANELS_API_PREFIX}/visualizations`)
      .then((res) => {
        const noAppVisualizations = res.visualizations.filter((vis) => {
          return !!!vis.application_id;
        });
        setSavedVisualizations(noAppVisualizations);
        opt2 = noAppVisualizations.map((vizObject) => ({
          label: vizObject.name,
          key: vizObject.id,
          className: 'observability',
        }));
      })
      .catch((err) =>
        console.error('Fetching observability visualization issue', err.body.message)
      );

    const allVisualizations = [
      { label: 'Dashboards Visualizations', options: opt1 },
      { label: 'Observability Visualizations', options: opt2 },
    ];
    setVisOptions(allVisualizations);
  };

  useEffect(() => {
    const previewTemplate = (
      <>
        {timeRange}
        <EuiFlexGroup>
          <EuiFlexItem>
            {previewLoading ? (
              <EuiLoadingChart size="xl" mono className="visualization-loading-chart-preview" />
            ) : isPreviewError !== '' ? (
              <div className="visualization-error-div-preview">
                <EuiIcon type="alert" color="danger" size="s" />
                <EuiSpacer size="s" />
                <EuiText size="s">
                  <p>{isPreviewError}</p>
                </EuiText>
              </div>
            ) : (
              <div className="visualization-div-preview">
                {displayVisualization(previewMetaData, previewData, newVisualizationType)}
              </div>
            )}
          </EuiFlexItem>
        </EuiFlexGroup>
      </>
    );
    setPreviewArea(previewTemplate);
  }, [previewLoading]);

  // On change of selected visualization change options
  useEffect(() => {
    if (selectedVisOption.length > 0 && selectedVisOption[0].className === 'observability')
      for (let i = 0; i < savedVisualizations.length; i++) {
        const visualization = savedVisualizations[i];
        if (visualization.id === selectedVisOption[0].key) {
          setPPLQuery(visualization.query);
          setNewVisualizationTitle(visualization.name);
          setNewVisualizationType(visualization.type);
          setPreviewMetaData(visualization);
          setNewVisualizationTimeField(visualization.timeField);
          break;
        }
      }
  }, [selectedVisOption]);

  // load saved visualizations
  useEffect(() => {
    fetchVisualizations();
  }, []);

  return (
    <FlyoutContainers
      closeFlyout={closeFlyout}
      flyoutHeader={flyoutHeader}
      flyoutBody={flyoutBody}
      flyoutFooter={flyoutFooter}
      ariaLabel="addVisualizationFlyout"
    />
  );
};
