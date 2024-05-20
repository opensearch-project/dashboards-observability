/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createSelector, createSlice } from '@reduxjs/toolkit';
import { concat, from, Observable, of } from 'rxjs';
import { map, mergeMap, toArray } from 'rxjs/operators';
import forEach from 'lodash/forEach';
import {
  createDemoPanel,
  CUSTOM_PANELS_API_PREFIX,
  CUSTOM_PANELS_SAVED_OBJECT_TYPE,
  samplePanelName,
} from '../../../../common/constants/custom_panels';
import {
  CustomPanelListType,
  CustomPanelType,
  ObservabilityPanelAttrs,
  PanelType,
} from '../../../../common/types/custom_panels';
import { coreRefs } from '../../../framework/core_refs';
import { SavedObject, SimpleSavedObject } from '../../../../../../src/core/public';
import { addVisualizationPanel } from '../helpers/add_visualization_helper';

interface InitialState {
  id: string;
  panel: CustomPanelType;
  panelList: CustomPanelType[];
}

export const newPanelTemplate = (newName): PanelType => ({
  title: newName,
  dateCreated: new Date().getTime(),
  dateModified: new Date().getTime(),
  visualizations: [],
  queryFilter: { language: '', query: '' },
  timeRange: { from: 'now-1d', to: 'now' },
});

const initialState: InitialState = {
  id: '',
  panel: newPanelTemplate(''),
  panelList: [],
  loadingFlag: false,
};

export const panelSlice = createSlice({
  name: 'customPanel',
  initialState,
  reducers: {
    setPanelId: (state, action) => ({ ...state, id: action.payload }),

    setPanel: (state, action) => {
      return { ...state, panel: action.payload };
    },

    setPanelList: (state, action) => {
      return { ...state, panelList: action.payload };
    },
  },
});

export const { setPanel, setPanelList } = panelSlice.actions;

export const panelReducer = panelSlice.reducer;

export const selectPanel = createSelector(
  (rootState) => rootState.customPanel.panel,
  (panel) => normalizedPanel(panel)
);

const normalizedPanel = (panel: CustomPanelType): CustomPanelType => ({
  ...newPanelTemplate(''),
  ...panel,
});

export const selectPanelList = (rootState): CustomPanelType[] => rootState.customPanel.panelList;

/*
 ** ASYNC DISPATCH FUNCTIONS
 */

const fetchSavedObjectPanels$ = () =>
  from(savedObjectPanelsClient.find()).pipe(
    mergeMap((res) => res.savedObjects),
    map(savedObjectToCustomPanel)
  );

const fetchObservabilityPanels$ = () =>
  of(coreRefs.http.get(`${CUSTOM_PANELS_API_PREFIX}/panels`)).pipe(
    mergeMap((res) => res),
    mergeMap((res) => res.panels as ObservabilityPanelAttrs[]),
    map((p: ObservabilityPanelAttrs) => ({
      ...p,
      title: p.name,
      savedObject: false,
      type: 'observability-savedObject',
    }))
  );

// Fetches all saved Custom Panels
const fetchCustomPanels = async () => {
  const panels$: Observable<CustomPanelListType> = concat(
    fetchSavedObjectPanels$(),
    fetchObservabilityPanels$()
  ).pipe(
    map((res) => {
      return res as CustomPanelListType;
    })
  );

  return panels$.pipe(toArray()).toPromise();
};

export const fetchPanels = () => async (dispatch, getState) => {
  const panels = await fetchCustomPanels();
  dispatch(setPanelList(panels));
};

export const fetchPanel = (id) => async (dispatch, getState) => {
  const soPanel = await savedObjectPanelsClient.get(id);
  const panel = savedObjectToCustomPanel(soPanel);
  dispatch(setPanel(panel));
};

export const fetchVisualization = () => (dispatch, getState) => {};

const updateLegacyPanel = (panel: CustomPanelType) =>
  coreRefs.http!.post(`${CUSTOM_PANELS_API_PREFIX}/panels/update`, {
    body: JSON.stringify({ panelId: panel.id, panel: panel as PanelType }),
  });

const updateSavedObjectPanel = (panel: CustomPanelType) => savedObjectPanelsClient.update(panel);

export const uuidRx = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/;

export const isUuid = (id) => !!id.match(uuidRx);

export const updatePanel = (
  panel: CustomPanelType,
  successMsg: string,
  failureMsg: string
) => async (dispatch, getState) => {
  const { toasts } = coreRefs;

  try {
    if (isUuid(panel.id)) await updateSavedObjectPanel(panel);
    else await updateLegacyPanel(panel);
    if (successMsg) {
      toasts!.add(successMsg);
    }
    dispatch(setPanel(panel));
    const panelList = getState().customPanel.panelList.map((p) => (p.id === panel.id ? panel : p));
    dispatch(setPanelList(panelList));
  } catch (e) {
    if (failureMsg) {
      toasts!.addDanger(failureMsg);
    }
    console.error(e);
  }
};

export const addVizToPanels = (panels, vizId) => async (dispatch, getState) => {
  forEach(panels, (oldPanel) => {
    const panel = getState().customPanel.panelList.find((p) => p.id === oldPanel.panel.id);

    const allVisualizations = panel!.visualizations;

    const visualizationsWithNewPanel = addVisualizationPanel(vizId, undefined, allVisualizations);

    const updatedPanel = { ...panel, visualizations: visualizationsWithNewPanel };
    dispatch(updatePanel(updatedPanel, '', ''));
  });
};

export const addMultipleVizToPanels = async (panels, vizIds) => {
  await Promise.all(
    panels.map(async ({ panel: { id } }) => {
      const soPanel = await savedObjectPanelsClient.get(id);
      const oldPanel = savedObjectToCustomPanel(soPanel);

      const allVisualizations = oldPanel!.visualizations;

      let visualizationsWithNewPanel = allVisualizations;

      forEach(vizIds, (vizId) => {
        visualizationsWithNewPanel = addVisualizationPanel(
          vizId,
          undefined,
          visualizationsWithNewPanel
        );
      });

      const updatedPanel = { ...oldPanel, visualizations: visualizationsWithNewPanel };

      if (isUuid(updatedPanel.id)) {
        await updateSavedObjectPanel(updatedPanel);
      } else {
        await updateLegacyPanel(updatedPanel);
      }
    })
  );
};

export const replaceVizInPanel = (oldPanel, oldVizId, vizId, newVisualizationTitle) => async (
  dispatch,
  getState
) => {
  const panel = getState().customPanel.panelList.find((p) => p.id === oldPanel.id);

  const allVisualizations = panel!.visualizations;

  const visualizationsWithNewPanel = addVisualizationPanel(vizId, oldVizId, allVisualizations);

  const updatedPanel = { ...panel, visualizations: visualizationsWithNewPanel };

  dispatch(
    updatePanel(
      updatedPanel,
      `Visualization ${newVisualizationTitle} successfully added!`,
      `Error in adding ${newVisualizationTitle} visualization to the panel`
    )
  );
};

const deletePanelSO = (customPanelIdList: string[]) => {
  const soPanelIds = customPanelIdList.filter((id) => isUuid(id));
  return Promise.all(soPanelIds.map((id) => savedObjectPanelsClient.delete(id)));
};

const deleteLegacyPanels = (customPanelIdList: string[]) => {
  const panelIds = customPanelIdList.filter((id) => !isUuid(id));
  if (panelIds.length === 0) return;

  const concatList = panelIds.toString();
  return coreRefs.http!.delete(`${CUSTOM_PANELS_API_PREFIX}/panelList/` + concatList);
};

export const deletePanels = (panelsToDelete: CustomPanelType[]) => async (dispatch, getState) => {
  const { toasts } = coreRefs;

  const toastMessage = `Observability Dashboard${
    panelsToDelete.length > 1 ? 's' : ' ' + panelsToDelete[0].title
  } successfully deleted!`;
  try {
    const ids = panelsToDelete.map((p) => p.id);
    await Promise.all([deleteLegacyPanels(ids), deletePanelSO(ids)]);

    const panelList: CustomPanelType[] = getState().customPanel.panelList.filter(
      (p) => !ids.includes(p.id)
    );
    dispatch(setPanelList(panelList));
    toasts!.add(toastMessage);
  } catch (e) {
    toasts!.addDanger(
      'Error deleting Observability Dashboards, please make sure you have the correct permission.'
    );
    console.error(e);
  }
};

export const createPanel = (panel) => async (dispatch, getState) => {
  const { toasts } = coreRefs;
  try {
    const newSOPanel = await savedObjectPanelsClient.create(panel);
    const newPanel = savedObjectToCustomPanel(newSOPanel);
    const panelList = getState().customPanel.panelList;
    dispatch(setPanelList([...panelList, newPanel]));
    toasts!.add(`Observability Dashboard "${newPanel.title}" successfully created!`);
    window.location.replace(`#/${newPanel.id}`);
  } catch (e) {
    toasts!.addDanger(
      'Error occurred while creating Observability Dashboard, please make sure you have the correct permission.'
    );
    console.error(e);
  }
};

export const createPanelSample = (vizIds) => async (dispatch, getState) => {
  const samplePanel = {
    ...createDemoPanel(vizIds),
    dateCreated: new Date().getTime(),
    dateModified: new Date().getTime(),
    title: samplePanelName,
  };
  const newSOPanel = await savedObjectPanelsClient.create(samplePanel);
  const newPanel = savedObjectToCustomPanel(newSOPanel);
  const panelList = getState().customPanel.panelList;
  dispatch(setPanelList([...panelList, newPanel]));
};

export const clonePanel = (panel, newPanelName) => async (dispatch, getState) => {
  const { toasts } = coreRefs;

  try {
    const { id, ...panelCopy } = {
      ...panel,
      title: newPanelName,
      dateCreated: new Date().getTime(),
      dateModified: new Date().getTime(),
    } as PanelType;

    const newSOPanel = await savedObjectPanelsClient.create(panelCopy);

    const newPanel = savedObjectToCustomPanel(newSOPanel);
    const panelList = getState().customPanel.panelList;
    dispatch(setPanelList([...panelList, newPanel]));
    dispatch(setPanel(newPanel));
    toasts!.add(`Observability Dashboard "${newPanel.title}" successfully created!`);
    window.location.replace(`#/${newPanel.id}`);
  } catch (e) {
    toasts!.addDanger(
      'Error cloning Observability Dashboard, please make sure you have the correct permission.'
    );
    console.error(e);
  }
};

const saveRenamedPanel = async (id, name) => {
  const renamePanelObject = {
    panelId: id,
    panelName: name,
  };

  return http.post(`${CUSTOM_PANELS_API_PREFIX}/panels/rename`, {
    body: JSON.stringify(renamePanelObject),
  });
};

const saveRenamedPanelSO = async (id, name) => {
  const panel: SavedObject<PanelType> = await coreRefs.savedObjectsClient!.get(
    CUSTOM_PANELS_SAVED_OBJECT_TYPE,
    id
  );
  panel.title = name;
  await coreRefs.savedObjectsClient!.update(CUSTOM_PANELS_SAVED_OBJECT_TYPE, id, panel);
};

// Renames an existing CustomPanel
export const renameCustomPanel = (editedCustomPanelName: string, id: string) => async (
  dispatch,
  getState
) => {
  const panel = getState().customPanel.panelList.find((p) => p.id === id);
  const updatedPanel = { ...panel, title: editedCustomPanelName };
  dispatch(
    updatePanel(
      updatedPanel,
      `Operational Panel successfully renamed into "${editedCustomPanelName}"`,
      'Error renaming Operational Panel, please make sure you have the correct permission.'
    )
  );
};

/*
 ** UTILITY FUNCTIONS
 */
const savedObjectToCustomPanel = (so: SimpleSavedObject<PanelType>): CustomPanelType => ({
  id: so.id,
  type: so.type,
  objectId: so.type + ':' + so.id,
  ...so.attributes,
  savedObject: true,
});

const savedObjectPanelsClient = {
  find: (options) =>
    coreRefs.savedObjectsClient!.find({ type: CUSTOM_PANELS_SAVED_OBJECT_TYPE, ...options }),
  delete: (id) => coreRefs.savedObjectsClient!.delete(CUSTOM_PANELS_SAVED_OBJECT_TYPE, id),
  update: (panel) =>
    coreRefs.savedObjectsClient!.update(CUSTOM_PANELS_SAVED_OBJECT_TYPE, panel.id, panel),
  get: (id) => coreRefs.savedObjectsClient!.get(CUSTOM_PANELS_SAVED_OBJECT_TYPE, id),
  create: (panel) => coreRefs.savedObjectsClient!.create(CUSTOM_PANELS_SAVED_OBJECT_TYPE, panel),
};
