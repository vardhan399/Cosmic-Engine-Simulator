import { configureStore } from '@reduxjs/toolkit';
import universeReducer from './universeSlice';
import { saveLocal } from '../utils/urlState';

export const store = configureStore({
  reducer: { universe: universeReducer },
  middleware: (getDefault) => getDefault({ serializableCheck: false }),
});

// persist to localStorage on every change, throttled
let saveTimer = null;
store.subscribe(() => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveLocal(store.getState().universe);
  }, 250);
});
