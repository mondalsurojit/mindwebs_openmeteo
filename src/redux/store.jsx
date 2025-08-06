// redux/store.jsx
import { configureStore } from '@reduxjs/toolkit';
import weatherReducer from './slices/weatherSlice';
import uiReducer from './slices/uiSlice';
import dataTableReducer from './slices/dataTableSlice'
import zomatoReducer from './slices/zomatoSlice';
import openMeteoReducer from './slices/openMeteoSlice';

export const store = configureStore({
  reducer: {
    weather: weatherReducer,
    ui: uiReducer,
    dataTable: dataTableReducer,
    zomato: zomatoReducer,
    openMeteo: openMeteoReducer,
  },

  //   // Enable Redux DevTools in development
  //   devTools: process.env.NODE_ENV !== 'production',

  //   // Middleware configuration (optional)
  //   middleware: (getDefaultMiddleware) =>
  //     getDefaultMiddleware({
  //       // Configure serializable check (useful for complex data)
  //       serializableCheck: {
  //         ignoredActions: ['persist/PERSIST'],
  //         ignoredPaths: ['weather.weatherData.some_non_serializable_field'],
  //       },
  //     }),
});

export default store;