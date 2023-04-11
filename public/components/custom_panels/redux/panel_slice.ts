import { createSlice } from '@reduxjs/toolkit';
import {
  CUSTOM_PANELS_SAVED_OBJECT_TYPE,
  CUSTOM_PANEL_SLICE,
} from '../../../../common/constants/custom_panels';
import { CustomPanelType, VisualizationType } from '../../../../common/types/custom_panels';
import { coreRefs } from '../../../framework/core_refs';

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
  panelList: []
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
      return { ...state, panelList: action.payload }
    }
  },
});

export const { setPanel } = panelSlice.actions;

export const panelReducer = panelSlice.reducer;

export const selectPanel = (rootState): CustomPanelType => rootState.customPanel.panel;

export const selectPanelList = (rootState): CustomPanelType[] => {
  console.log("selectPanelList", { rootState, panelList: rootState.customPanel.panelList })
  return rootState.customPanel.panelList;
}

/*
 ** ASYNC DISPATCH FUNCTIONS
 */


export const fetchPanels = () => async (dispatch, getState) => {
  const soPanels = await coreRefs.savedObjectsClient?.find({ type: CUSTOM_PANELS_SAVED_OBJECT_TYPE });
  const panels = soPanels?.savedObjects?.map(savedObjectToCustomPanel)
  dispatch(setPanelList(panels));
};

export const fetchPanel = (id) => async (dispatch, getState) => {
  const soPanel = await coreRefs.savedObjectsClient?.get(CUSTOM_PANELS_SAVED_OBJECT_TYPE, id);
  const panel = savedObjectToCustomPanel(soPanel);
  dispatch(setPanel(panel));
};

export const fetchVisualization = () => (dispatch, getState) => {};

export const updatePanel = (panel: CustomPanelType) => async (dispatch, getState) => {
  await coreRefs.savedObjectsClient?.update(CUSTOM_PANELS_SAVED_OBJECT_TYPE, panel.id, panel);
  dispatch(setPanel(panel));
};

export const deletePanel = (id) => () => {
  coreRefs.savedObjectsClient?.delete(CUSTOM_PANELS_SAVED_OBJECT_TYPE, id);
};

/*
 ** UTILITY FUNCTIONS
 */
const savedObjectToCustomPanel = (so: SimpleSavedObject<PanelType>): CustomPanelType => ({
  id: so.id,
  ...so.attributes,
});
