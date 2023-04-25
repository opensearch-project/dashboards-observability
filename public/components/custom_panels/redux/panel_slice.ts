import { createSelector, createSlice } from '@reduxjs/toolkit';
import { async, concat, from, Observable, of } from 'rxjs';
import { map, mergeMap, tap, toArray } from 'rxjs/operators';
import { forEach, last } from 'lodash';
import {
  CUSTOM_PANELS_API_PREFIX,
  CUSTOM_PANELS_SAVED_OBJECT_TYPE,
  CUSTOM_PANEL_SLICE,
} from '../../../../common/constants/custom_panels';
import {
  CustomPanelListType,
  CustomPanelType,
  ObservabilityPanelAttrs,
  PanelType,
  VisualizationType,
} from '../../../../common/types/custom_panels';
import { coreRefs } from '../../../framework/core_refs';
import { SavedObject, SimpleSavedObject } from '../../../../../../src/core/public';
import { isNameValid } from '../helpers/utils';
import {
  addMultipleVisualizations,
  addVisualizationPanel,
} from '../helpers/add_visualization_helper';

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
  timeRange: { from: 'now', to: 'now-1d' },
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
    map((p: ObservabilityPanelAttrs) => ({ ...p, title: p.name, savedObject: false }))
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

export const doesNameExist = (newCustomPanelName: string) => async() => {
  const panels = await fetchCustomPanels();
  if((panels.some((i: { title: string; }) => i.title === newCustomPanelName))){
    return true;
  }
  return false;
}

export const updatePanel = (panel: CustomPanelType) => async (dispatch, getState) => {
  try {
    if (isUuid(panel.id)) await updateSavedObjectPanel(panel);
    else await updateLegacyPanel(panel);

    dispatch(setPanel(panel));
    const panelList = getState().customPanel.panelList.map((p) => (p.id === panel.id ? panel : p));
    dispatch(setPanelList(panelList));
  } catch (err) {
    console.log('Error updating Dashboard', { err, panel });
  }
};

export const addVizToPanels = (panels, vizId) => async (dispatch, getState) => {
  forEach(panels, (oldPanel) => {
    const panel = getState().customPanel.panelList.find((p) => p.id === oldPanel.panel.id);

    const allVisualizations = panel!.visualizations;

    const visualizationsWithNewPanel = addVisualizationPanel(vizId, undefined, allVisualizations);

    const updatedPanel = { ...panel, visualizations: visualizationsWithNewPanel };
    try {
      dispatch(updatePanel(updatedPanel));
    } catch (err) {
      console.error(err?.body?.message || err);
    }
  });
};

export const addMultipleVizToPanels = (panels, vizIds) => async (dispatch, getState) => {
  forEach(panels, (oldPanel) => {
    const panel = getState().customPanel.panelList.find((p) => p.id === oldPanel.panel.id);

    const allVisualizations = panel!.visualizations;

    const visualizationsWithNewPanel = addMultipleVisualizations(vizIds, allVisualizations);

    const updatedPanel = { ...panel, visualizations: visualizationsWithNewPanel };
    try {
      dispatch(updatePanel(updatedPanel));
    } catch (err) {
      console.error(err?.body?.message || err);
    }
  });
};

export const replaceVizInPanel = (oldPanel, oldVizId, vizId) => async (dispatch, getState) => {
  const panel = getState().customPanel.panelList.find((p) => p.id === oldPanel.id);

  const allVisualizations = panel!.visualizations;

  const visualizationsWithNewPanel = addVisualizationPanel(vizId, oldVizId, allVisualizations);

  const updatedPanel = { ...panel, visualizations: visualizationsWithNewPanel };
  try {
    dispatch(updatePanel(updatedPanel));
  } catch (err) {
    console.error(err?.body?.message || err);
  }
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
  const ids = panelsToDelete.map((p) => p.id);
  await Promise.all([deleteLegacyPanels(ids), deletePanelSO(ids)]);

  const panelList: CustomPanelType[] = getState().customPanel.panelList.filter(
    (p) => !ids.includes(p.id)
  );
  dispatch(setPanelList(panelList));
};

export const createPanel = (panel) => async (dispatch, getState) => {
  const newSOPanel = await savedObjectPanelsClient.create(panel);
  const newPanel = savedObjectToCustomPanel(newSOPanel);
  const panelList = getState().customPanel.panelList;
  dispatch(setPanelList([...panelList, newPanel]));
};

export const clonePanel = (panel, newPanelName) => async (dispatch, getState) => {
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

  window.location.replace(`#/${newPanel.id}`);
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
  if (!isNameValid(editedCustomPanelName)) {
    console.log('Invalid Observability Dashboard name', 'danger');
    return Promise.reject();
  }

  const panel = getState().customPanel.panelList.find((p) => p.id === id);
  const updatedPanel = { ...panel, title: editedCustomPanelName };
  dispatch(updatePanel(updatedPanel));

  // try {
  //   // await savePanelFn(editedCustomPanelId, editedCustomPanelName);

  //   // setcustomPanelData((prevCustomPanelData) => {
  //   //   const newCustomPanelData = [...prevCustomPanelData];
  //   //   const renamedCustomPanel = newCustomPanelData.find(
  //   //     (customPanel) => customPanel.id === editedCustomPanelId
  //   //   );
  //   //   if (renamedCustomPanel) renamedCustomPanel.name = editedCustomPanelName;
  //   //   return newCustomPanelData;
  //   // });
  //   // setToast(`Observability Dashboard successfully renamed into "${editedCustomPanelName}"`);
  // } catch (err) {
  //   console.log(
  //     'Error renaming Observability Dashboard, please make sure you have the correct permission.',
  //     'danger'
  //   );
  //   console.error(err.body.message);
  // }
};

/*
 ** UTILITY FUNCTIONS
 */
const savedObjectToCustomPanel = (so: SimpleSavedObject<PanelType>): CustomPanelType => ({
  id: so.id,
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
