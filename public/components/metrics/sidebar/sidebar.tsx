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
  otelDocumentNamesSelector,
  loadOtelDocuments,
  // selectedOtelIndexSelector,
  selectedDataSourcesSelector,
  setOtelDocumentNames,
  fetchOpenTelemetryDocuments,
} from '../redux/slices/metrics_slice';
import { MetricsAccordion } from './metrics_accordion';
import { SearchBar } from './search_bar';
import { DataSourcePicker } from './data_source_picker';
import { IndexPicker } from './index_picker';
import { DATASOURCE_OPTIONS } from '../../../../common/constants/metrics';

interface SideBarMenuProps {
  selectedDataSource: React.SetStateAction<Array<{ label: string; 'data-test-subj': string }>>;
  setSelectedDataSource: React.Dispatch<React.SetStateAction<unknown>>;
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
  // const [selectedDataSource, setSelectedDataSource] = useState();

  const availableMetrics = useSelector(availableMetricsSelector);
  const selectedMetrics = useSelector(selectedMetricsSelector);
  const selectedMetricsIds = useSelector(selectedMetricsIdsSelector);

  const additionalMetric = useSelector(selectMetricByIdSelector(additionalSelectedMetricId));

  const dataSource = useSelector(selectedDataSourcesSelector);
  // let isOpenTelemetry: boolean;
  // console.log('dataSourceeee: ', dataSource.label);
  // console.log('dataSourceeeeee.label: ', dataSource.label);
  const otelIndices = useSelector(otelIndexSelector);
  // const selectedOtelIndex = useSelector(selectedOtelIndexSelector);
  const otelDocuments = useSelector(otelDocumentNamesSelector);
  // console.log('selectedOtelIndex after useSelc: ', selectedOtelIndex);

  useEffect(() => {
    batch(() => {
      dispatch(loadMetrics());
    });
  }, [dispatch]);

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
    console.log('hereeeee');
    if (selectedOTIndex.length > 0 && selectedDataSource) {
      const fetchOtelDocuments = async () => {
        try {
          console.log('selectedOtelIndex: ', selectedOTIndex);
          console.log('selectedOtelIndex label: ', selectedOTIndex[0]?.label);
          const documents = await fetchOpenTelemetryDocuments(selectedOTIndex[0]?.label)();
          console.log('1');
          // setAvailableTestOtelDocuments(documents.aggregations);
          console.log('2');
          // dispatch(setOtelDocumentNames(documents.aggregations));
          console.log('3');
          console.log('docs after 3: ', documents);
          const availableOtelDocuments = documents?.aggregations?.distinct_names?.buckets.map(
            (item: any) => {
              return { id: item.key, name: item.key, catalog: 'OpenTelemetry' };
            }
          );
          console.log('4');
          console.log('otel metrics after 4: ', availableOtelDocuments);
          setAvailableOTDocuments(availableOtelDocuments);
          console.log('5');
          console.log('otel metrics: ', availableOtelDocuments);
        } catch (error) {
          console.error('Error fetching OpenTelemetry documents:', error);
          // Handle errors if needed
        }
      };

      fetchOtelDocuments();
    }
  }, [dispatch, selectedDataSource, selectedOTIndex, setAvailableTestOtelDocuments]);

  const indexPicker = useMemo(() => {
    console.log('selectedDataSource: ', selectedDataSource);
    console.log('selectedDataSource with label: ', selectedDataSource[0]?.label);
    const isOpenTelemetry = selectedDataSource[0]?.label === 'OpenTelemetry' ? true : false;
    console.log('isOpenTelemetry: ', isOpenTelemetry);
    if (isOpenTelemetry) {
      console.log('otelIndices: ', otelIndices);
      return <IndexPicker otelIndices={otelIndices} setSelectedOTIndex={setSelectedOTIndex} />;
    }
  }, [selectedDataSource]);

  // useEffect(() => {
  //   if (availableOTDocuments === undefined) setAvailableOTDocuments([]);
  //   console.log('availableOTDocuments in useEff: ', availableOTDocumentsRef.current);
  // }, [availableOTDocuments]);

  // console.log('availableTestOtelDocuments: ', availableTestOtelDocuments);

  console.log('available metrics: ', availableMetrics);
  console.log('availableOTDocuments outside: ', availableOTDocumentsRef.current);

  // console.log('otel metrics: ', availableOtelDocuments);

  const handleAddMetric = (metric: any) => dispatch(selectMetric(metric));

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
        {/* <IndexPicker otelIndices={otelIndices} isDisabled={isDisabled} /> */}
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
