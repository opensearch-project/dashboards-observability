/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import './sidebar.scss';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { EuiSpacer } from '@elastic/eui';
import { I18nProvider } from '@osd/i18n/react';
import { batch, useDispatch, useSelector } from 'react-redux';
import {
  addSelectedMetric,
  availableMetricsSelector,
  clearSelectedMetrics,
  loadMetrics,
  removeSelectedMetric,
  selectedMetricsIdsSelector,
  selectedMetricsSelector,
  selectMetricByIdSelector,
  otelIndexSelector,
  setDataSourceIcons,
  coloredIconsFrom,
  setMetrics,
  loadOTIndices,
  fetchOpenTelemetryDocumentNames,
} from '../redux/slices/metrics_slice';
import { MetricsAccordion } from './metrics_accordion';
import { SearchBar } from './search_bar';
import { DataSourcePicker } from './data_source_picker';
import { IndexPicker } from './index_picker';
import { OptionType } from '../../../../common/types/metrics';

interface SideBarMenuProps {
  selectedDataSource: OptionType[];
  setSelectedDataSource: (sources: OptionType[]) => void;
  selectedOTIndex: React.SetStateAction<Array<{}>>;
  setSelectedOTIndex: React.Dispatch<React.SetStateAction<unknown>>;
  availableTestOtelDocuments: Array<{}>;
  setAvailableTestOtelDocuments: React.Dispatch<React.SetStateAction<unknown>>;
  additionalSelectedMetricId?: string;
}
export const Sidebar = ({
  selectedDataSource,
  setSelectedDataSource,
  selectedOTIndex,
  setSelectedOTIndex,
  availableTestOtelDocuments,
  setAvailableTestOtelDocuments,
  additionalSelectedMetricId,
}: SideBarMenuProps) => {
  const dispatch = useDispatch();
  const [availableOTDocuments, setAvailableOTDocuments] = useState([]);
  const availableOTDocumentsRef = useRef();
  availableOTDocumentsRef.current = availableOTDocuments;
  const promethuesMetrics = useSelector(availableMetricsSelector);
  const selectedMetrics = useSelector(selectedMetricsSelector);
  const selectedMetricsIds = useSelector(selectedMetricsIdsSelector);

  const additionalMetric = useSelector(selectMetricByIdSelector(additionalSelectedMetricId));

  const dataSource = useSelector(selectedDataSourcesSelector);
  const otelIndices = useSelector(otelIndexSelector);

  useEffect(() => {
    batch(() => {
      dispatch(loadMetrics());
    });
  }, [dispatch, selectedDataSource]);

  useEffect(() => {
    batch(() => {
      dispatch(loadOTIndices());
    });
  }, [dispatch, selectedDataSource]);

  useEffect(() => {
    if (additionalMetric) {
      (async function () {
        await dispatch(clearSelectedMetrics());
        await dispatch(addSelectedMetric(additionalMetric));
      })();
    }
  }, [additionalMetric?.id]);

  const selectedMetricsList = useMemo(() => {
    return selectedMetricsIds.map((id) => selectedMetrics[id]).filter((m) => m); // filter away null entries
  }, [selectedMetrics, selectedMetricsIds]);

  // useEffect(() => {
  //   console.log('hereeeee');
  //   if (selectedOtelIndex.length > 0) {
  //     // getting undefined here due to selectedOtelIndex turning into undefined
  //     console.log('selectedOtelIndex: ', selectedOtelIndex);
  //     console.log('selectedOtelIndex label: ', selectedOtelIndex[0]?.label);
  //     loadOtelDocuments(dispatch, setAvailableTestOtelDocuments, selectedOtelIndex[0]?.label)();
  //     // console.log('temp: ', temp);
  //     console.log('atleasttttt');
  //     const availableOtelDocuments = availableTestOtelDocuments?.distinct_names?.buckets.map((item: any) => {
  //       return { id: item.key };
  //     });
  //     setAvailableOTDocuments(availableOtelDocuments);
  //     console.log('otel metrics: ', availableOtelDocuments);
  //     // console.log('availableOTDocuments: ', availableOTDocumentsRef.current);
  //   }
  // }, [selectedOtelIndex]);

  useEffect(() => {
    if (selectedOTIndex.length > 0 && selectedDataSource[0]?.label === 'OpenTelemetry') {
      const fetchOtelDocuments = async () => {
        try {
          const documentNames = await fetchOpenTelemetryDocumentNames(selectedOTIndex[0]?.label)();
          const availableOtelDocuments = documentNames?.aggregations?.distinct_names?.buckets.map(
            (item: any) => {
              return {
                id: item.key,
                name: item.key,
                catalog: 'OpenTelemetry',
                type: 'Histogram',
                index: selectedOTIndex[0]?.label,
              };
            }
          );
          setAvailableOTDocuments(availableOtelDocuments);
          dispatch(setMetrics(availableOtelDocuments));
          dispatch(setDataSourceIcons(coloredIconsFrom(['OpenTelemetry'])));
        } catch (error) {
          console.error('Error fetching OpenTelemetry documents:', error);
        }
      };

      fetchOtelDocuments();
    }
  }, [dispatch, selectedDataSource, selectedOTIndex]);

  const indexPicker = useMemo(() => {
    const isOpenTelemetry = selectedDataSource[0]?.label === 'OpenTelemetry' ? true : false;
    if (isOpenTelemetry) {
      return <IndexPicker otelIndices={otelIndices} setSelectedOTIndex={setSelectedOTIndex} />;
    }
  }, [selectedDataSource]);

  const availableMetrics = useMemo(() => {
    if (selectedDataSource[0]?.label === 'OpenTelemetry' && selectedOTIndex.length > 0)
      return promethuesMetrics;
    else if (selectedDataSource[0]?.label === 'Prometheus') return promethuesMetrics;
    else return [];
  }, [promethuesMetrics, selectedDataSource, availableOTDocuments, selectedOTIndex]);

  const handleAddMetric = (metric: any) => {
    console.log('handle add metrics: ', metric);
    dispatch(selectMetric(metric));
  };

  const handleRemoveMetric = (metric: any) => {
    dispatch(removeSelectedMetric(metric));
  };

  return (
    <I18nProvider>
      <div id="sidebar">
        <DataSourcePicker
          selectedDataSource={selectedDataSource}
          setSelectedDataSource={setSelectedDataSource}
        />
        <EuiSpacer size="s" />
        {indexPicker}
        <EuiSpacer size="s" />
        <SearchBar />
        <EuiSpacer size="s" />
        <section className="sidebar">
          <MetricsAccordion
            metricsList={selectedMetricsList}
            headerName="Selected Metrics"
            handleClick={handleRemoveMetric}
            dataTestSubj="metricsListItems_selectedMetrics"
          />
          <EuiSpacer size="s" />
          <MetricsAccordion
            metricsList={availableOTDocumentsRef.current}
            headerName="Available Metrics"
            handleClick={handleAddMetric}
            dataTestSubj="metricsListItems_availableMetrics"
          />
        </section>
      </div>
    </I18nProvider>
  );
};
