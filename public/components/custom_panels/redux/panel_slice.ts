import { createSlice } from '@reduxjs/toolkit';
import { concat, from, Observable, of } from 'rxjs';
import { map, mergeMap, tap, toArray } from 'rxjs/operators';
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
import { panel } from '../../../../../../src/plugins/vis_type_timeseries/common/vis_schema';

interface InitialState {
  id: string;
  panel: CustomPanelType;
  visualizations: VisualizationType[];
  panelList: CustomPanelType[];
}

const initialState: InitialState = {
  id: '',
  panel: {
    visualizations: [],
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

export const selectPanelList = (rootState): CustomPanelType[] => {
  console.trace('selectPanelList', { rootState, panelList: rootState.customPanel.panelList });
  return rootState.customPanel.panelList;
};

/*
 ** ASYNC DISPATCH FUNCTIONS
 */

const fetchSavedObjectPanels$ = () =>
  from(savedObjectPanelsClient.find()).pipe(
    mergeMap((res) => res.savedObjects),
    map(savedObjectToCustomPanel),
    tap((res) => console.log('panel', res))
  );

const fetchObservabilityPanels$ = () =>
  of(coreRefs.http.get(`${CUSTOM_PANELS_API_PREFIX}/panels`)).pipe(
    mergeMap((res) => res),
    mergeMap((res) => res.panels as ObservabilityPanelAttrs[]),
    map((p: ObservabilityPanelAttrs) => ({ ...p, title: p.name, savedObject: false })),
    tap((res) => console.log('observability panels', res))
  );

// Fetches all saved Custom Panels
const fetchCustomPanels = async () => {
  const panels$: Observable<CustomPanelListType> = concat(
    fetchSavedObjectPanels$(),
    fetchObservabilityPanels$()
  ).pipe(map((res) => {
    console.log("fetchCustomPanels", res);
    return res as CustomPanelListType
  }));

  return panels$.pipe(toArray()).toPromise();
};

export const fetchPanels = () => async (dispatch, getState) => {
  const panels = await fetchCustomPanels()
  console.log('fetchPanels', { panels });
  dispatch(setPanelList(panels));
};

export const fetchPanel = (id) => async (dispatch, getState) => {
  const soPanel = await savedObjectPanelsClient.get(id);
  const panel = savedObjectToCustomPanel(soPanel);
  dispatch(setPanel(panel));
};

export const fetchVisualization = () => (dispatch, getState) => {};

export const updatePanel = (panel: CustomPanelType) => async (dispatch, getState) => {
  await savedObjectPanelsClient.update(panel);
  dispatch(setPanel(panel));
  const panelList = getState().panelList.map((p) => (p.id === panel.id ? panel : p));
  dispatch(setPanelList(panelList));
};

export const deletePanel = (id) => async (dispatch, getState) => {
  await savedObjectPanelsClient.delete(id);
  const panelList: CustomPanelType[] = getState().panelList.filter((p) => p.id !== id);
  dispatch(setPanelList(panelList));
};

export const createPanel = (panel) => async (dispatch, getState) => {
  const newPanel = await savedObjectPanelsClient.create(panel);
  const panelList = getState().panelList;
  dispatch(setPanelList([...panelList, newPanel]));
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
