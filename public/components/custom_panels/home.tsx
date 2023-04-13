/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiBreadcrumb, EuiGlobalToastList, EuiLink, ShortDate } from '@elastic/eui';
import { Toast } from '@elastic/eui/src/components/toast/global_toast_list';
import _ from 'lodash';
import React, { ReactChild, useState } from 'react';
// eslint-disable-next-line @osd/eslint/module_migration
import { StaticContext } from 'react-router';
import { Route, RouteComponentProps, Switch } from 'react-router-dom';
import { map, mergeMap, tap, toArray } from 'rxjs/operators';
import { concat, from, Observable, of } from 'rxjs';
import PPLService from '../../services/requests/ppl';
import DSLService from '../../services/requests/dsl';
import { CoreStart, SavedObjectsStart } from '../../../../../src/core/public';

import {
  CUSTOM_PANELS_API_PREFIX,
  CUSTOM_PANELS_DOCUMENTATION_URL,
  CUSTOM_PANELS_SAVED_OBJECT_TYPE,
} from '../../../common/constants/custom_panels';
import {
  EVENT_ANALYTICS,
  OBSERVABILITY_BASE,
  SAVED_OBJECTS,
} from '../../../common/constants/shared';
import {
  CustomPanelListType,
  ObservabilityPanelAttrs,
  PanelType,
} from '../../../common/types/custom_panels';
import { ObservabilitySideBar } from '../common/side_nav';
import { CustomPanelTable } from './custom_panel_table';
import { CustomPanelView } from './custom_panel_view';
import { isNameValid } from './helpers/utils';
import { SavedObject } from '../../../../../src/core/types';
import { CustomPanelViewSO } from './custom_panel_view_so';
import { coreRefs } from '../../framework/core_refs';
import { CustomPanelType } from '../../../common/types/custom_panels';
import { fetchPanels } from './redux/panel_slice';
import { useDispatch } from 'react-redux';

// import { ObjectFetcher } from '../common/objectFetcher';

/*
 * "Home" module is initial page for Operantional Panels
 *
 * Props taken in as params are:
 * http: http core service;
 * chrome: chrome core service;
 * parentBreadcrumb: parent breadcrumb name and link
 * pplService: ppl requestor service
 * renderProps: Props from router
 */

interface PanelHomeProps {
  http: CoreStart['http'];
  chrome: CoreStart['chrome'];
  parentBreadcrumbs: EuiBreadcrumb[];
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
}: PanelHomeProps) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loading, setLoading] = useState(false);
  const [toastRightSide, setToastRightSide] = useState<boolean>(true);
  const [start, setStart] = useState<ShortDate>('');
  const [end, setEnd] = useState<ShortDate>('');

  const dispatch = useDispatch()

  const setToast = (title: string, color = 'success', text?: ReactChild, side?: string) => {
    if (!text) text = '';
    setToastRightSide(!side ? true : false);
    setToasts([...toasts, { id: new Date().toISOString(), title, text, color } as Toast]);
  };

  const onEditClick = (savedVisualizationId: string) => {
    window.location.assign(`#/event_analytics/explorer/${savedVisualizationId}`);
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

  const uuidRx = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/;

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

  // Clones an existing Custom Panel, return new Custom Panel id
  const cloneCustomPanel = async (
    clonedCustomPanelName: string,
    clonedCustomPanelId: string
  ): Promise<string> => {
    if (!isNameValid(clonedCustomPanelName)) {
      setToast('Invalid Operational Panel name', 'danger');
      return Promise.reject();
    }

    const fetchPanelFn = isUuid(clonedCustomPanelId) ? fetchSavedObjectPanel : fetchLegacyPanel;

    try {
      // const panelToClone = await fetchPanelfn(clonedCustomPanelId)

      // const newPanel: PanelType = {
      //   ...panelToClone,
      //   title: clonedCustomPanelName,
      //   dateCreated: new Date().getTime(),
      //   dateModified: new Date().getTime()
      // }

      // const clonedPanel: CustomPanelType = await coreRefs.savedObjectsClient!.create(
      //   CUSTOM_PANELS_SAVED_OBJECT_TYPE, newPanel, { id: panelToClone.id }
      // )


      // setcustomPanelData((prevCustomPanelData) => {
      //   const newPanelData = [
      //     ...prevCustomPanelData,
      //     {
      //       id: clonedPanel.id,
      //       title: clonedCustomPanelName,
      //       dateCreated: clonedPanel.dateCreated,
      //       dateModified: clonedPanel.dateModified,
      //     },
      //   ];
      //   console.log("setcustomPanelData", newPanelData)
      //   return newPanelData
      // });
      // setToast(`Operational Panel "${clonedCustomPanelName}" successfully created!`);
      // return clonedPanel.id;
    } catch (err) {
      setToast(
        'Error cloning Operational Panel, please make sure you have the correct permission.',
        'danger'
      );
    }

    console.error(err.body.message);
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
    // Promise.all([
    //   deletePanelSO(customPanelIdList),
    //   deletePanels(customPanelIdList)
    // ]).then((res) => {
    //   setcustomPanelData((prevCustomPanelData) => {
    //     return prevCustomPanelData.filter(
    //       (customPanel) => !customPanelIdList.includes(customPanel.id)
    //     );
    //   });
    //   setToast(toastMessage);
    // })
    //   .catch((err) => {
    //     setToast(
    //       'Error deleting Operational Panels, please make sure you have the correct permission.',
    //       'danger'
    //     );
    //     console.error(err.body.message);
    //   });
  };

  // Deletes an existing Operational Panel
  const deleteCustomPanel = async (customPanelId: string, customPanelName: string) => {
    // return http
    //   .delete(`${CUSTOM_PANELS_API_PREFIX}/panels/` + customPanelId)
    //   .then((res) => {
    //     setcustomPanelData((prevCustomPanelData) => {
    //       return prevCustomPanelData.filter((customPanel) => customPanel.id !== customPanelId);
    //     });
    //     setToast(`Operational Panel "${customPanelName}" successfully deleted!`);
    //     return res;
    //   })
    //   .catch((err) => {
    //     setToast(
    //       'Error deleting Operational Panel, please make sure you have the correct permission.',
    //       'danger'
    //     );
    //     console.error(err.body.message);
    //   });
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
          dispatch(fetchPanels())
          // setcustomPanelData([...customPanelData, ...res.demoPanelsData]);
        });
      setToast(`Sample panels successfully added.`);
    } catch (err: any) {
      setToast('Error adding sample panels.', 'danger');
      console.error(err.body?.message || err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
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
          path={['/operational_panels/create', '/operational_panels']}
          render={(props) => {
            return (
              <ObservabilitySideBar>
                <CustomPanelTable
                  loading={loading}
                  createCustomPanel={createCustomPanel}
                  setBreadcrumbs={chrome.setBreadcrumbs}
                  parentBreadcrumbs={parentBreadcrumbs}
                  cloneCustomPanel={cloneCustomPanel}
                  deleteCustomPanelList={deleteCustomPanelList}
                  addSamplePanels={addSamplePanels}
                />
              </ObservabilitySideBar>
            );
          }}
        />
        <Route
          path={`${renderProps.match.path}/:id`}
          render={(props) => {
            const isSavedObject = !!props.match.params.id.match(uuidRx);

            return isSavedObject ? (
              <CustomPanelViewSO
                panelId={props.match.params.id}
                chrome={chrome}
                parentBreadcrumbs={parentBreadcrumbs}
                cloneCustomPanel={cloneCustomPanel}
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
                parentBreadcrumbs={parentBreadcrumbs}
                // renameCustomPanel={renameCustomPanel}
                cloneCustomPanel={cloneCustomPanel}
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
    </div>
  );
};
