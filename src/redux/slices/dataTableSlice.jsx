import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  // Station comparison
  selectedPointsForComparison: [], maxComparison: 5,

  // Table settings
  tableSettings: {
    itemsPerPage: 10,
    sortBy: 'id',
    sortOrder: 'asc',
    showGridData: true,
    showStationData: true,
  },

  // Search and filter
  searchTerm: '',
  currentPage: 1,

  // Data export
  exportSettings: {
    format: 'csv', // csv, json, excel
    includeMetadata: true,
    selectedColumns: [],
  }
};

const dataTableSlice = createSlice({
  name: 'dataTable',
  initialState,
  reducers: {
    // ===== POINT COMPARISON ACTIONS =====
    addPointForComparison: (state, action) => {
      const stationId = action.payload;
      if (!state.selectedPointsForComparison.includes(stationId) &&
        state.selectedPointsForComparison.length < state.maxComparison) {
        state.selectedPointsForComparison.push(stationId);
      }
    },

    removePointForComparison: (state, action) => {
      const stationId = action.payload;
      state.selectedPointsForComparison = state.selectedPointsForComparison.filter(
        id => id !== stationId
      );
    },

    clearPointsForComparison: (state) => {
      state.selectedPointsForComparison = [];
    },

    setselectedPointsForComparison: (state, action) => {
      const stations = action.payload.slice(0, state.maxComparison);
      state.selectedPointsForComparison = stations;
    },

    // ===== TABLE SETTINGS ACTIONS =====
    setTableSettings: (state, action) => {
      state.tableSettings = { ...state.tableSettings, ...action.payload };
    },

    setItemsPerPage: (state, action) => {
      state.tableSettings.itemsPerPage = action.payload;
      state.currentPage = 1; // Reset to first page
    },

    // setSortBy: (state, action) => {
    //   const { sortBy, sortOrder } = action.payload;
    //   state.tableSettings.sortBy = sortBy;
    //   state.tableSettings.sortOrder = sortOrder || 'asc';
    // },

    // toggleSortOrder: (state) => {
    //   state.tableSettings.sortOrder = state.tableSettings.sortOrder === 'asc' ? 'desc' : 'asc';
    // },

    // setShowGridData: (state, action) => {
    //   state.tableSettings.showGridData = action.payload;
    // },

    // setShowStationData: (state, action) => {
    //   state.tableSettings.showStationData = action.payload;
    // },

    // ===== SEARCH AND FILTER ACTIONS =====
    setSearchTerm: (state, action) => {
      state.searchTerm = action.payload;
      state.currentPage = 1; // Reset to first page when searching
    },

    clearSearchTerm: (state) => {
      state.searchTerm = '';
      state.currentPage = 1;
    },

    setCurrentPage: (state, action) => {
      state.currentPage = action.payload;
    },

    // ===== EXPORT SETTINGS ACTIONS =====
    setExportSettings: (state, action) => {
      state.exportSettings = { ...state.exportSettings, ...action.payload };
    },

    setExportFormat: (state, action) => {
      state.exportSettings.format = action.payload;
    },

    setIncludeMetadata: (state, action) => {
      state.exportSettings.includeMetadata = action.payload;
    },

    setSelectedColumns: (state, action) => {
      state.exportSettings.selectedColumns = action.payload;
    },

    // ===== BULK ACTIONS =====
    resetDataTable: (state) => {
      return { ...initialState, selectedPointsForComparison: state.selectedPointsForComparison };
    },

    resetToDefaults: () => {
      return initialState;
    },

    // Batch update multiple settings
    updateDataTableState: (state, action) => {
      Object.keys(action.payload).forEach(key => {
        if (key in state) {
          state[key] = action.payload[key];
        }
      });
    },
  }
});

// Export actions
export const {
  // Point comparison
  addPointForComparison, removePointForComparison, clearPointsForComparison, setselectedPointsForComparison,

  // Table settings  
  setTableSettings, setItemsPerPage, setSortBy, toggleSortOrder, setShowGridData, setShowStationData,

  // Search and filter
  setSearchTerm, clearSearchTerm, setCurrentPage,

  // Export settings
  setExportSettings, setExportFormat, setIncludeMetadata, setSelectedColumns,

  // Bulk actions
  resetDataTable, resetToDefaults, updateDataTableState,
} = dataTableSlice.actions;

// ===== SELECTORS =====

// Basic selectors
export const selectselectedPointsForComparison = (state) => state.dataTable.selectedPointsForComparison;
export const selectmaxComparison = (state) => state.dataTable.maxComparison;
export const selectTableSettings = (state) => state.dataTable.tableSettings;
export const selectSearchTerm = (state) => state.dataTable.searchTerm;
export const selectCurrentPage = (state) => state.dataTable.currentPage;
export const selectExportSettings = (state) => state.dataTable.exportSettings;

// Table settings selectors
export const selectItemsPerPage = (state) => state.dataTable.tableSettings.itemsPerPage;
export const selectSortBy = (state) => state.dataTable.tableSettings.sortBy;
export const selectSortOrder = (state) => state.dataTable.tableSettings.sortOrder;
export const selectShowGridData = (state) => state.dataTable.tableSettings.showGridData;
export const selectShowStationData = (state) => state.dataTable.tableSettings.showStationData;

// Export settings selectors
export const selectExportFormat = (state) => state.dataTable.exportSettings.format;
export const selectIncludeMetadata = (state) => state.dataTable.exportSettings.includeMetadata;
export const selectSelectedColumns = (state) => state.dataTable.exportSettings.selectedColumns;

// Compound selectors
export const selectSortSettings = (state) => ({
  sortBy: state.dataTable.tableSettings.sortBy,
  sortOrder: state.dataTable.tableSettings.sortOrder,
});

export const selectPaginationSettings = (state) => ({
  currentPage: state.dataTable.currentPage,
  itemsPerPage: state.dataTable.tableSettings.itemsPerPage,
});

export const selectDataTypeSettings = (state) => ({
  showGridData: state.dataTable.tableSettings.showGridData,
  showStationData: state.dataTable.tableSettings.showStationData,
});

// Derived selectors
export const selectCanAddMoreStations = (state) =>
  state.dataTable.selectedPointsForComparison.length < state.dataTable.maxComparison;

export const selectHasSelectedStations = (state) =>
  state.dataTable.selectedPointsForComparison.length > 0;

export const selectComparisonStationsCount = (state) =>
  state.dataTable.selectedPointsForComparison.length;

export const selectIsStationSelected = (stationId) => (state) =>
  state.dataTable.selectedPointsForComparison.includes(stationId);

export default dataTableSlice.reducer;