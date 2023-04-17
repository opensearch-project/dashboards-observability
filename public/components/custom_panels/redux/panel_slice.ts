import { createSelector, createSlice } from '@reduxjs/toolkit';
import { async, concat, from, Observable, of } from 'rxjs';
import { map, mergeMap, tap, toArray } from 'rxjs/operators';
import { forEach } from 'lodash';
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
import { addVisualizationPanel } from '../helpers/add_visualization_helper';

interface InitialState {
  id: string;
  panel: CustomPanelType;
  panelList: CustomPanelType[];
}

const initialState: InitialState = {
  id: '',
  panel: {
    id: '',
    title: '',
    visualizations: [],
    dateCreated: 0,
    dateModified: 0,
    queryFilter: { language: '', query: '' },
    timeRange: { from: 'now', to: 'now-1d' },
  },
  panelList: [],
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

export const selectPanel = (rootState): CustomPanelType => rootState.customPanel.panel;

export const selectPanelList = (rootState): CustomPanelType[] => rootState.customPanel.panelList;

// export const selectPanelList = createSelector(
//   rootState => { console.log("selectPanelList", { rootState }); return rootState.customPanel.panelList },
//   panelList => panelList.map(p => p as CustomPanelListType)
// );

/*
 ** ASYNC DISPATCH FUNCTIONS
 */

const fetchSavedObjectPanels$ = () =>
  from(savedObjectPanelsClient.find()).pipe(
    mergeMap((res) => res.savedObjects),
    map(savedObjectToCustomPanel)
    // tap((res) => console.log('panel', res))
  );

const fetchObservabilityPanels$ = () =>
  of(coreRefs.http.get(`${CUSTOM_PANELS_API_PREFIX}/panels`)).pipe(
    mergeMap((res) => res),
    mergeMap((res) => res.panels as ObservabilityPanelAttrs[]),
    map((p: ObservabilityPanelAttrs) => ({ ...p, title: p.name, savedObject: false }))
    // tap((res) => console.log('observability panels', res))
  );

// Fetches all saved Custom Panels
const fetchCustomPanels = async () => {
  const panels$: Observable<CustomPanelListType> = concat(
    fetchSavedObjectPanels$(),
    fetchObservabilityPanels$()
  ).pipe(
    map((res) => {
      console.log('fetchCustomPanels', res);
      return res as CustomPanelListType;
    })
  );

  return panels$.pipe(toArray()).toPromise();
};

export const fetchPanels = () => async (dispatch, getState) => {
  const panels = await fetchCustomPanels();
  console.log('fetchPanels', { panels });
  dispatch(setPanelList(panels));
};

export const fetchPanel = (id) => async (dispatch, getState) => {
  const soPanel = await savedObjectPanelsClient.get(id);
  const panel = savedObjectToCustomPanel(soPanel);
  console.log('fetchPanel', panel);
  dispatch(setPanel(panel));
};

export const fetchVisualization = () => (dispatch, getState) => {};

const updateLegacyPanel = (panel: CustomPanelType) =>
  coreRefs.http!.post(`${CUSTOM_PANELS_API_PREFIX}/panels/update`, {
    body: JSON.stringify({ panelId: panel.id, panel: panel as PanelType }),
  });

const updateSavedObjectPanel = (panel: CustomPanelType) => savedObjectPanelsClient.update(panel);

export const uuidRx = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/;

const isUuid = (id) => !!id.match(uuidRx);

export const updatePanel = (panel: CustomPanelType) => async (dispatch, getState) => {
  try {
    if (isUuid(panel.id)) await updateSavedObjectPanel(panel);
    else await updateLegacyPanel(panel);

    dispatch(setPanel(panel));
    const panelList = getState().customPanel.panelList.map((p) => (p.id === panel.id ? panel : p));
    dispatch(setPanelList(panelList));
  } catch (err) {
    console.log('Error updating panel', { err, panel });
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

export const deletePanel = (id) => async (dispatch, getState) => {
  await savedObjectPanelsClient.delete(id);
  const panelList: CustomPanelType[] = getState().panelList.filter((p) => p.id !== id);
  dispatch(setPanelList(panelList));
};

export const createPanel = (panel) => async (dispatch, getState) => {
  const newSOPanel = await savedObjectPanelsClient.create(panel);
  const newPanel = savedObjectToCustomPanel(newSOPanel);
  const panelList = getState().customPanel.panelList;
  dispatch(setPanelList([...panelList, newPanel]));
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
    console.log('Invalid Custom Panel name', 'danger');
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
  //   // setToast(`Operational Panel successfully renamed into "${editedCustomPanelName}"`);
  // } catch (err) {
  //   console.log(
  //     'Error renaming Operational Panel, please make sure you have the correct permission.',
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
