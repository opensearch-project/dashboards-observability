/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiBreadcrumb, htmlIdGenerator, ShortDate } from '@elastic/eui';
import React, { useState } from 'react';
import { batch, useDispatch } from 'react-redux';
// eslint-disable-next-line @osd/eslint/module_migration
import { StaticContext } from 'react-router';
import { HashRouter, Route, RouteComponentProps, Switch } from 'react-router-dom';
import { CoreStart, SavedObjectsStart } from '../../../../../src/core/public';
import {
  EVENT_ANALYTICS,
  OBSERVABILITY_BASE,
  observabilityLogsID,
  observabilityPanelsID,
  SAVED_OBJECTS,
} from '../../../common/constants/shared';
import DSLService from '../../services/requests/dsl';
import PPLService from '../../services/requests/ppl';
import { CustomPanelTable } from './custom_panel_table';
import { CustomPanelView } from './custom_panel_view';
import { CustomPanelViewSO } from './custom_panel_view_so';
import { createPanelSample, uuidRx } from './redux/panel_slice';
import { REDIRECT_TAB, TAB_CREATED_TYPE, TAB_ID_TXT_PFX } from '../../../common/constants/explorer';
import { init as initFields } from '../event_analytics/redux/slices/field_slice';
import { init as initPatterns } from '../event_analytics/redux/slices/patterns_slice';
import { init as initQueryResult } from '../event_analytics/redux/slices/query_result_slice';
import { changeQuery, init as initQuery } from '../event_analytics/redux/slices/query_slice';
import { addTab, setSelectedQueryTab } from '../event_analytics/redux/slices/query_tab_slice';
import { useToast } from '../common/toast';

// import { ObjectFetcher } from '../common/objectFetcher';

/*
 * "Home" module is initial page for Operantional Panels
 *
 * Props taken in as params are:
 * http: http core service;
 * chrome: chrome core service;
 * parentBreadcrumb: parent breadcrumb name and link
 * pplService: ppl requestor service
 * renderProps: Props from router of parent component
 *            - Used to calculate path when this component embedded into another (WHY?!)
 */

interface PanelHomeProps {
  http: CoreStart['http'];
  chrome: CoreStart['chrome'];
  parentBreadcrumbs: EuiBreadcrumb[];
  setBreadcrumbs: (newBreadcrumbs: EuiBreadcrumb[]) => void;
  pplService: PPLService;
  dslService: DSLService;
  renderProps: RouteComponentProps<any, StaticContext, any>;
  coreSavedObjects: SavedObjectsStart;
}

export const Home = ({
  http,
  chrome,
  parentBreadcrumbs,
  pplService,
  dslService,
  renderProps,
  coreSavedObjects,
  setBreadcrumbs,
}: PanelHomeProps) => {
  const [loading, setLoading] = useState(false);
  const [start, setStart] = useState<ShortDate>('');
  const [end, setEnd] = useState<ShortDate>('');

  const dispatch = useDispatch();

  const { setToast } = useToast();

  const customPanelBreadCrumbs = [
    ...parentBreadcrumbs,
    {
      text: 'Dashboards',
      href: `${observabilityPanelsID}#/`,
    },
  ];

  const addNewTab = async () => {
    // get a new tabId
    const tabId = htmlIdGenerator(TAB_ID_TXT_PFX)();

    // create a new tab
    await batch(() => {
      dispatch(initQuery({ tabId }));
      dispatch(initQueryResult({ tabId }));
      dispatch(initFields({ tabId }));
      dispatch(addTab({ tabId }));
      dispatch(initPatterns({ tabId }));
    });

    return tabId;
  };

  const onEditClick = async (savedVisualizationId: string) => {
    // open a new tab in explorer for loading this perticular visualization data to edit
    const newTabId = await addNewTab();
    batch(() => {
      dispatch(
        changeQuery({
          tabId: newTabId,
          query: {
            [TAB_CREATED_TYPE]: REDIRECT_TAB,
          },
        })
      );
      dispatch(setSelectedQueryTab({ tabId: newTabId }));
    });
    window.location.assign(`${observabilityLogsID}#/explorer/${savedVisualizationId}`);
  };

  const addSamplePanels = async () => {
    try {
      setLoading(true);
      const flights = await http
        .get('../api/saved_objects/_find', {
          query: {
            type: 'index-pattern',
            search_fields: 'title',
            search: 'opensearch_dashboards_sample_data_flights',
          },
        })
        .then((resp) => resp.total === 0);
      const logs = await http
        .get('../api/saved_objects/_find', {
          query: {
            type: 'index-pattern',
            search_fields: 'title',
            search: 'opensearch_dashboards_sample_data_logs',
          },
        })
        .then((resp) => resp.total === 0);
      if (flights || logs) setToast('Adding sample data. This can take some time.');
      await Promise.all([
        flights ? http.post('../api/sample_data/flights') : Promise.resolve(),
        logs ? http.post('../api/sample_data/logs') : Promise.resolve(),
      ]);

      let savedVisualizationIds: string[] = [];
      await http
        .get(`${OBSERVABILITY_BASE}${EVENT_ANALYTICS}${SAVED_OBJECTS}/addSampleSavedObjects/panels`)
        .then((resp) => (savedVisualizationIds = [...resp.savedVizIds]));

      dispatch(createPanelSample(savedVisualizationIds));
      setToast(`Sample panels successfully added.`);
    } catch (err: any) {
      setToast('Error adding sample panels.', 'danger');
      console.error(err.body?.message || err);
    } finally {
      setLoading(false);
    }
  };

  const parentPath = renderProps ? renderProps.match.path : '';

  return (
    <HashRouter>
      <Switch>
        <Route
          exact
          path={['/create', '/']}
          render={(props) => {
            return (
              <CustomPanelTable
                loading={loading}
                setBreadcrumbs={chrome.setBreadcrumbs}
                parentBreadcrumbs={customPanelBreadCrumbs}
                addSamplePanels={addSamplePanels}
              />
            );
          }}
        />
        <Route
          path={[`${parentPath}/view/:id`, `${parentPath}/:id`]}
          render={(props) => {
            const isSavedObject = !!props.match.params.id.match(uuidRx);

            return isSavedObject ? (
              <CustomPanelViewSO
                panelId={props.match.params.id}
                chrome={chrome}
                pplService={pplService}
                dslService={dslService}
                parentBreadcrumbs={customPanelBreadCrumbs}
                onEditClick={onEditClick}
                page="operationalPanels"
                coreSavedObjects={coreSavedObjects}
              />
            ) : (
              <CustomPanelView
                panelId={props.match.params.id}
                http={http}
                pplService={pplService}
                dslService={dslService}
                chrome={chrome}
                parentBreadcrumbs={customPanelBreadCrumbs}
                // renameCustomPanel={renameCustomPanel}
                onEditClick={onEditClick}
                startTime={start}
                endTime={end}
                setStartTime={setStart}
                setEndTime={setEnd}
                page="operationalPanels"
                coreSavedObjects={coreSavedObjects}
              />
            );
          }}
        />
      </Switch>
    </HashRouter>
  );
};
