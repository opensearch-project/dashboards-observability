import { createSlice } from '@reduxjs/toolkit';

const toastSlice = createSlice({
  name: 'toast',
  initialState: { toasts: [], toastRightSide: true },
  reducers: {
    appendToast: (state, action) => {
      state.toasts = [...state.toasts, action.payload];
    },

    setToastRightSide: (state, action) => (state.toastRightSide = action.payload),

    dismissToast: (state, action) => {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload.id);
    },

    resetToasts: (state, action) => {
      state.toasts = [];
      state.toastRightSide = true;
    },
  },
});

export const toastReducer = toastSlice.reducer;

export const { dismissToast, resetToasts } = toastSlice.actions;
const { appendToast, setToastRightSide } = toastSlice.actions;

export const selectToasts = (rootState) => rootState.toast.toasts;

export const selectToastRightSide = (rootState) => rootState.toast.toastRightSide;

export const addToast = (title, color?, textChild?, side?) => (dispatch, getState) => {
  const newToast = { id: new Date().toISOString(), title, textChild, color };
  dispatch(appendToast(newToast));

  if (side) {
    dispatch(setToastRightSide(side === 'left'));
  }
};
