/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useCallback, useEffect, useState, useContext } from 'react';
import { batch, useDispatch, useSelector } from 'react-redux';
import { DataSourceSelectable } from '../../../../../../../src/plugins/data/public';
import {
  selectSearchMetaData,
  update as updateSearchMetaData,
} from '../../../event_analytics/redux/slices/search_meta_data_slice';
import { coreRefs } from '../../../../framework/core_refs';
import { reset as resetFields } from '../../redux/slices/field_slice';
import { reset as resetPatterns } from '../../redux/slices/patterns_slice';
import { reset as resetQueryResults } from '../../redux/slices/query_result_slice';
import { reset as resetVisConfig } from '../../redux/slices/viualization_config_slice';
import { reset as resetVisualization } from '../../redux/slices/visualization_slice';
import { reset as resetCountDistribution } from '../../redux/slices/count_distribution_slice';
import { LogExplorerRouterContext } from '../..';

export const DataSourceSelection = ({ tabId }) => {
  const { dataSources } = coreRefs;
  const dispatch = useDispatch();
  const routerContext = useContext(LogExplorerRouterContext);
  const explorerSearchMetadata = useSelector(selectSearchMetaData)[tabId];
  const [activeDataSources, setActiveDataSources] = useState([]);
  const [dataSourceOptionList, setDataSourceOptionList] = useState([]);
  const [selectedSources, setSelectedSources] = useState([...explorerSearchMetadata.datasources]);

  const resetStateOnDatasourceChange = () => {
    dispatch(
      resetFields({
        tabId,
      })
    );
    dispatch(
      resetPatterns({
        tabId,
      })
    );
    dispatch(
      resetQueryResults({
        tabId,
      })
    );
    dispatch(
      resetVisConfig({
        tabId,
      })
    );
    dispatch(
      resetVisualization({
        tabId,
      })
    );
    dispatch(
      resetCountDistribution({
        tabId,
      })
    );
  };

  const handleSourceChange = (selectedSource) => {
    batch(() => {
      resetStateOnDatasourceChange();
      dispatch(
        updateSearchMetaData({
          tabId,
          data: {
            datasources: selectedSource,
          },
        })
      );
    });
    setSelectedSources(selectedSource);
  };

  useEffect(() => {
    setSelectedSources([...(explorerSearchMetadata.datasources || [])]);
    return () => {};
  }, [explorerSearchMetadata.datasources]);

  const handleDataSetFetchError = useCallback(() => {
    return (error) => {};
  }, []);

  useEffect(() => {
    const subscription = dataSources.dataSourceService.dataSources$.subscribe(
      (currentDataSources) => {
        setActiveDataSources([...Object.values(currentDataSources)]);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // update datasource if url contains
    const datasourceName = routerContext?.searchParams.get('datasourceName');
    const datasourceType = routerContext?.searchParams.get('datasourceType');
    if (datasourceName && datasourceType) {
      dispatch(
        updateSearchMetaData({
          tabId,
          data: {
            datasources: [
              {
                label: datasourceName,
                type: datasourceType,
              },
            ],
          },
        })
      );
    }
  }, []);

  return (
    <DataSourceSelectable
      dataSources={activeDataSources}
      dataSourceOptionList={dataSourceOptionList}
      setDataSourceOptionList={setDataSourceOptionList}
      selectedSources={selectedSources}
      onDataSourceSelect={handleSourceChange}
      onFetchDataSetError={handleDataSetFetchError}
      singleSelection={{ asPlainText: true }}
    />
  );
};
