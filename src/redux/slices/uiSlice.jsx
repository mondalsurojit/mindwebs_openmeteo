import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  // Visuals
  isPlaying: false, isResetting: false, opacity: 0.5, showWindAnimation: false,

  // Interaction state
  hoverData: null,

  // Map controls (if needed) 17.4065, 78.4772
  mapCenter: [17.4065, 78], mapZoom: 9,

  // Panel states
  isControlPanelExpanded: true,

  // Stations/Grids control
  showGrids: false, showStations: false, selectedStationId: null,

  showDataTable: false,
  
  // Data source selection
  selectedDataSource: 'openmeteo', // Default to openmeteo as mentioned
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setIsPlaying: (state, action) => { state.isPlaying = action.payload },
    setReset: (state, action) => { state.isResetting = action.payload },
    setOpacity: (state, action) => {
      state.opacity = Math.max(0, Math.min(1, action.payload)) // Clamp b/w 0 & 1
    },
    setShowWindAnimation: (state, action) => { state.showWindAnimation = action.payload },

    // ===== INTERACTION STATE =====
    setHoverData: (state, action) => { state.hoverData = action.payload },
    clearHoverData: (state, action) => { state.hoverData = null },

    // ===== MAP CONTROLS =====
    setMapCenter: (state, action) => { state.mapCenter = action.payload },
    setMapZoom: (state, action) => { state.mapZoom = action.payload },
    updateMapView: (state, action) => {
      const { center, zoom } = action.payload;
      if (center) state.mapCenter = center;
      if (zoom) state.mapZoom = zoom;
    },

    // ===== PANEL CONTROLS =====
    setControlPanelExpanded: (state, action) => { state.isControlPanelExpanded = action.payload },
    setShowDataTable: (state, action) => { state.showDataTable = action.payload },

    // ===== STATION CONTROLS =====
    setShowStations: (state, action) => { state.showStations = action.payload },
    setSelectedStationId: (state, action) => { state.selectedStationId = action.payload },

    // ==== GRID CONTROLS ====
    setShowGrid: (state, action) => { state.showGrids = action.payload },

    // ==== DATA SOURCE CONTROLS ====
    setSelectedDataSource: (state, action) => { state.selectedDataSource = action.payload },

    // ===== BULK ACTIONS =====
    resetUI: (state) => {
      // Reset to initial state but preserve map position
      const { mapCenter, mapZoom } = state;
      return { ...initialState, mapCenter, mapZoom };
    },
    resetToDefaults: () => {
      // Complete reset to initial state
      return initialState;
    },
    // Batch update multiple UI states
    updateUIState: (state, action) => {
      Object.keys(action.payload).forEach(key => {
        if (key in state) state[key] = action.payload[key];
      });
    },

    // ===== PRESET CONFIGURATIONS =====
    applyUIPreset: (state, action) => {
      const presets = {
        presentation: {
          opacity: 0.8,
          showWindAnimation: true,
          isControlPanelExpanded: false,
          isLegendVisible: true,
        },
        analysis: {
          opacity: 0.6,
          showWindAnimation: false,
          isControlPanelExpanded: true,
          isLegendVisible: true,
        },
        minimal: {
          opacity: 0.4,
          showWindAnimation: false,
          isControlPanelExpanded: false,
          isLegendVisible: false,
        }
      };

      const preset = presets[action.payload];
      if (preset) Object.assign(state, preset);
    },
  }
});

// Export actions
export const {
  // Visuals
  setIsPlaying, setOpacity, setShowWindAnimation, setReset,

  // Interaction
  setHoverData, clearHoverData, updateHoverData,

  // Map
  setMapCenter, setMapZoom, updateMapView,

  // Stations/Grids
  setShowStations, setSelectedStationId, setShowGrid,

  // Panels
  setControlPanelExpanded, setShowDataTable,
  
  // Data Source
  setSelectedDataSource,

  // Bulk
  resetUI, resetToDefaults, updateUIState, applyUIPreset,
} = uiSlice.actions;

// ===== SELECTORS =====

// Basic selectors
export const selectIsPlaying = (state) => state.ui.isPlaying;
export const selectOpacity = (state) => state.ui.opacity;
export const selectShowWindAnimation = (state) => state.ui.showWindAnimation;
export const selectHoverData = (state) => state.ui.hoverData;
export const selectMapCenter = (state) => state.ui.mapCenter;
export const selectMapZoom = (state) => state.ui.mapZoom;
export const selectIsControlPanelExpanded = (state) => state.ui.isControlPanelExpanded;
export const selectIsLegendVisible = (state) => state.ui.isLegendVisible;
export const selectIsResetting = (state) => state.ui.isResetting;
export const selectShowStations = (state) => state.ui.showStations;
export const selectSelectedStationId = (state) => state.ui.selectedStationId;
export const selectShowGrid = (state) => state.ui.showGrids;
export const selectShowDataTable = (state) => state.ui.showDataTable;
export const selectSelectedDataSource = (state) => state.ui.selectedDataSource;

// Compound selectors
export const selectMapView = (state) => ({
  center: state.ui.mapCenter,
  zoom: state.ui.mapZoom,
});

export const selectAnimationState = (state) => ({
  isPlaying: state.ui.isPlaying,
  isResetting: state.ui.isResetting,
});

export const selectVisualSettings = (state) => ({
  opacity: state.ui.opacity,
  showWindAnimation: state.ui.showWindAnimation,
});

export const selectPanelStates = (state) => ({
  isControlPanelExpanded: state.ui.isControlPanelExpanded,
  isLegendVisible: state.ui.isLegendVisible,
});

// Derived selectors
export const selectHasHoverData = (state) => state.ui.hoverData !== null;
export const selectOpacityPercentage = (state) => Math.round(state.ui.opacity * 100);
export const selectCanPlay = (state) => !state.ui.isResetting;

export default uiSlice.reducer;