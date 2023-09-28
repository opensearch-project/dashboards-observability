/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { DataSourceSelectable, DataSourceType } from '../../../../../../../src/plugins/data/public';
import {
  selectSearchMetaData,
  update as updateSearchMetaData,
} from '../../../event_analytics/redux/slices/search_meta_data_slice';
import { coreRefs } from '../../../../framework/core_refs';

export const DataSourceSelection = ({ tabId }) => {
  const { dataSources } = coreRefs;
  const dispatch = useDispatch();
  const explorerSearchMetadata = useSelector(selectSearchMetaData)[tabId];
  console.log('new explorerSearchMetadata: ', explorerSearchMetadata);
  const [activeDataSources, setActiveDataSources] = useState([]);
  const [dataSourceOptionList, setDataSourceOptionList] = useState([]);
  const [selectedSources, setSelectedSources] = useState([...explorerSearchMetadata.datasources]);

  const handleSourceChange = (selectedSource) => {
    console.log('handle selectedSource: ', selectedSource);
    dispatch(
      updateSearchMetaData({
        tabId,
        data: {
          datasources: selectedSource,
        },
      })
    );
    setSelectedSources(selectedSource);
  };

  useEffect(() => {
    setSelectedSources([...explorerSearchMetadata.datasources]);
    return () => {};
  }, [explorerSearchMetadata.datasources]);

  const handleDataSetFetchError = useCallback(() => {
    return (error) => {};
  }, []);

  useEffect(() => {
    const subscription = dataSources.dataSourceService.dataSources$.subscribe(
      (currentDataSources) => {
        console.log('currentDataSources: ', currentDataSources);
        setActiveDataSources([...Object.values(currentDataSources)]);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <DataSourceSelectable
      dataSources={activeDataSources}
      dataSourceOptionList={dataSourceOptionList}
      setDataSourceOptionList={setDataSourceOptionList}
      selectedSources={selectedSources}
      setSelectedSources={handleSourceChange}
      onFetchDataSetError={handleDataSetFetchError}
      singleSelection={{ asPlainText: true }}
    />
  );
};
