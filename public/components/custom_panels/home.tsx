/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiBreadcrumb, EuiGlobalToastList, EuiLink, ShortDate } from '@elastic/eui';
import { Toast } from '@elastic/eui/src/components/toast/global_toast_list';
import _ from 'lodash';
import React, { ReactChild, useState } from 'react';
import { useDispatch } from 'react-redux';
// eslint-disable-next-line @osd/eslint/module_migration
import { StaticContext } from 'react-router';
import { HashRouter, Route, RouteComponentProps, Switch } from 'react-router-dom';
import { CoreStart, SavedObjectsStart } from '../../../../../src/core/public';
import {
  CUSTOM_PANELS_API_PREFIX,
  CUSTOM_PANELS_DOCUMENTATION_URL,
  CUSTOM_PANELS_SAVED_OBJECT_TYPE,
} from '../../../common/constants/custom_panels';
import {
  EVENT_ANALYTICS,
  observabilityLogsID,
  observabilityPanelsID,
  OBSERVABILITY_BASE,
  SAVED_OBJECTS,
} from '../../../common/constants/shared';
import { ObservabilityPanelAttrs } from '../../../common/types/custom_panels';
import { coreRefs } from '../../framework/core_refs';
import DSLService from '../../services/requests/dsl';
import PPLService from '../../services/requests/ppl';
import { CustomPanelTable } from './custom_panel_table';
import { CustomPanelView } from './custom_panel_view';
import { CustomPanelViewSO } from './custom_panel_view_so';
import { isNameValid } from './helpers/utils';
import { fetchPanels } from './redux/panel_slice';

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
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loading, setLoading] = useState(false);
  const [toastRightSide, setToastRightSide] = useState<boolean>(true);
  const [start, setStart] = useState<ShortDate>('');
  const [end, setEnd] = useState<ShortDate>('');

  const dispatch = useDispatch();

  const customPanelBreadCrumbs = [
    ...parentBreadcrumbs,
    {
      text: 'Dashboards',
      href: `${observabilityPanelsID}#/`,
    },
  ];

  const setToast = (title: string, color = 'success', text?: ReactChild, side?: string) => {
    if (!text) text = '';
    setToastRightSide(!side ? true : false);
    setToasts([...toasts, { id: new Date().toISOString(), title, text, color } as Toast]);
  };

  const onEditClick = (savedVisualizationId: string) => {
    window.location.assign(`${observabilityLogsID}#/explorer/${savedVisualizationId}`);
  };

  // Creates a new CustomPanel
  const createCustomPanel = async (newCustomPanelName: string) => {
    if (!isNameValid(newCustomPanelName)) {
      setToast('Invalid Operational Panel name', 'danger');
      return;
    }

    const newPanel: ObservabilityPanelAttrs = {
      title: newCustomPanelName,
      description: '',
      dateCreated: new Date().getTime(),
      dateModified: new Date().getTime(),
      timeRange: {
        to: 'now',
        from: 'now-1d',
      },
      queryFilter: {
        query: '',
        language: 'ppl',
      },
      visualizations: [],
      applicationId: '',
    };

    return coreSavedObjects.client
      .create<ObservabilityPanelAttrs>('observability-panel', newPanel, {})
      .then(async (res) => {
        setToast(`Operational Panel "${newCustomPanelName}" successfully created!`);
        window.location.assign(`${_.last(parentBreadcrumbs)!.href}${res.id}`);
      })
      .catch((err) => {
        setToast(
          'Please ask your administrator to enable Operational Panels for you.',
          'danger',
          <EuiLink href={CUSTOM_PANELS_DOCUMENTATION_URL} target="_blank">
            Documentation
          </EuiLink>
        );
        console.error('create error', err);
      });
  };

  const isUuid = (id) => !!id.match(uuidRx);

  const fetchSavedObjectPanel = async (id: string) => {
    const soPanel = await coreRefs.savedObjectsClient?.get(CUSTOM_PANELS_SAVED_OBJECT_TYPE, id);
    return savedObjectToCustomPanel(soPanel);
  };

  // Fetch Panel by id
  const fetchLegacyPanel = async (id: string) => {
    return http.get(`${CUSTOM_PANELS_API_PREFIX}/panels/${id}`);
    // .then((res) => res.operationalPanel)
    // .catch((err) => {
    //   console.error('Issue in fetching the operational panel to duplicate', err);
    // });
  };

  const deletePanelSO = (customPanelIdList: string[]) => {
    const soPanelIds = customPanelIdList.filter((id) => id.match(uuidRx));
    return Promise.all(
      soPanelIds.map((id) =>
        coreRefs.savedObjectsClient?.delete(CUSTOM_PANELS_SAVED_OBJECT_TYPE, id)
      )
    );
  };

  const deletePanels = (customPanelIdList: string[]) => {
    const panelIds = customPanelIdList.filter((id) => !id.match(uuidRx));
    const concatList = panelIds.toString();
    return http.delete(`${CUSTOM_PANELS_API_PREFIX}/panelList/` + concatList);
  };

  // Deletes multiple existing Operational Panels
  const deleteCustomPanelList = (customPanelIdList: string[], toastMessage: string) => {
    Promise.all([deletePanelSO(customPanelIdList), deletePanels(customPanelIdList)])
      .then((res) => {
        // setcustomPanelData((prevCustomPanelData) => {
        //   return prevCustomPanelData.filter(
        //     (customPanel) => !customPanelIdList.includes(customPanel.id)
        //   );
        // });
        // setToast(toastMessage);
      })
      .catch((err) => {
        setToast(
          'Error deleting Operational Panels, please make sure you have the correct permission.',
          'danger'
        );
        console.error(err.body.message);
      });
  };

  // Deletes an existing Operational Panel
  const deleteCustomPanel = async (customPanelId: string, customPanelName: string) => {
    return http
      .delete(`${CUSTOM_PANELS_API_PREFIX}/panels/` + customPanelId)
      .then((res) => {
        dispatch(fetchPanels());
        setToast(`Operational Panel "${customPanelName}" successfully deleted!`);
        return res;
      })
      .catch((err) => {
        setToast(
          'Error deleting Operational Panel, please make sure you have the correct permission.',
          'danger'
        );
        console.error(err.body.message);
      });
  };

  // Deletes an existing SO Operational Panel
  const deleteCustomPanelSO = async (customPanelId: string, customPanelName: string) => {
    dispatch(deletePanel(customPanelId));
    // TODO: toast here
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

      await http
        .post(`${CUSTOM_PANELS_API_PREFIX}/panels/addSamplePanels`, {
          body: JSON.stringify({
            savedVisualizationIds,
          }),
        })
        .then((res) => {
          dispatch(fetchPanels());
        });
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
      <EuiGlobalToastList
        toasts={toasts}
        dismissToast={(removedToast) => {
          setToasts(toasts.filter((toast) => toast.id !== removedToast.id));
        }}
        side={toastRightSide ? 'right' : 'left'}
        toastLifeTimeMs={6000}
      />
      <Switch>
        <Route
          exact
          path={['/create', '/']}
          render={(props) => {
            return (
              <CustomPanelTable
                loading={loading}
                createCustomPanel={createCustomPanel}
                setBreadcrumbs={chrome.setBreadcrumbs}
                parentBreadcrumbs={customPanelBreadCrumbs}
                deleteCustomPanelList={deleteCustomPanelList}
                addSamplePanels={addSamplePanels}
              />
            );
          }}
        />
        <Route
          path={`${parentPath}/:id`}
          render={(props) => {
            const isSavedObject = !!props.match.params.id.match(uuidRx);

            return isSavedObject ? (
              <CustomPanelViewSO
                panelId={props.match.params.id}
                chrome={chrome}
                parentBreadcrumbs={customPanelBreadCrumbs}
                deleteCustomPanel={deleteCustomPanel}
                setToast={setToast}
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
                deleteCustomPanel={deleteCustomPanel}
                setToast={setToast}
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
