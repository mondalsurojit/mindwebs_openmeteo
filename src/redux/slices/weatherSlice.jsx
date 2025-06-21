import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';

// IndexedDB utilities for better caching (supports 50MB+ data)
const DB_NAME = 'WeatherDataCache';
const DB_VERSION = 1;
const STORE_NAME = 'weatherBatches';
const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours in milliseconds
const backendUrl = import.meta.env.VITE_BACKEND_URL;

class IndexedDBCache {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'batchNumber' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  async get(batchNumber) {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(batchNumber);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          const now = Date.now();
          if (now - result.timestamp < CACHE_DURATION) {
            console.log(`📦 Using cached data for batch ${batchNumber}`);
            resolve(result.data);
          } else {
            // Cache expired, remove it
            this.delete(batchNumber);
            console.log(`⏰ Cache expired for batch ${batchNumber}`);
            resolve(null);
          }
        } else {
          resolve(null);
        }
      };
    });
  }

  async set(batchNumber, data) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const cacheEntry = {
        batchNumber,
        data,
        timestamp: Date.now()
      };

      const request = store.put(cacheEntry);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const sizeEstimate = JSON.stringify(data).length / (1024 * 1024);
        console.log(`✅ Cached batch ${batchNumber} (≈${sizeEstimate.toFixed(2)}MB) in IndexedDB`);
        resolve();
      };
    });
  }

  async delete(batchNumber) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(batchNumber);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clear() {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log('🗑️ IndexedDB cache cleared');
        resolve();
      };
    });
  }

  async cleanExpired() {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const now = Date.now();
      let deletedCount = 0;

      const request = index.openCursor();
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (now - cursor.value.timestamp >= CACHE_DURATION) {
            cursor.delete();
            deletedCount++;
          }
          cursor.continue();
        } else {
          console.log(`🧹 Cleaned ${deletedCount} expired cache entries`);
          resolve(deletedCount);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
}

const cache = new IndexedDBCache();

// Helper to parse timestamp strings from API
const parseTimestamp = (timestampStr) => {
  const [datePart, timePart] = timestampStr.split('_');
  const [year, month, day] = datePart.split('-');
  const [hour, minute, second] = timePart.split(':');
  
  return new Date(
    parseInt(year),
    parseInt(month) - 1, // Month is 0-indexed
    parseInt(day),
    parseInt(hour),
    parseInt(minute),
    parseInt(second)
  );
};

// Async thunk for fetching a specific batch of weather data
const fetchWeatherBatch = createAsyncThunk(
  'weather/fetchWeatherBatch',
  async (batchNumber, { rejectWithValue }) => {
    try {
      // Clean expired cache entries periodically
      await cache.cleanExpired();

      // Check cache first
      const cachedData = await cache.get(batchNumber);
      if (cachedData) {
        return { ...cachedData, batchNumber, fromCache: true };
      }

      // Fetch from API if not in cache
      console.log(`🌐 Fetching batch ${batchNumber} from API...`);
      const paddedBatchNumber = String(batchNumber).padStart(3, '0');
      const response = await fetch(`${backendUrl}/data/${paddedBatchNumber}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Cache the fetched data
      await cache.set(batchNumber, data);

      console.log(`📥 Fetched batch ${batchNumber} from API`);
      return { ...data, batchNumber, fromCache: false };
    } catch (error) {
      console.error(`❌ Error fetching batch ${batchNumber}:`, error);
      return rejectWithValue(error.message);
    }
  }
);

// Web Worker batch fetching action for manual dispatch
const fetchWeatherBatchFromWorker = createAsyncThunk(
  'weather/fetchWeatherBatchFromWorker',
  async ({ batchNumber, data }, { rejectWithValue }) => {
    try {
      // Cache the data received from worker
      await cache.set(batchNumber, data);
      console.log(`📥 Cached batch ${batchNumber} from Web Worker`);
      return { ...data, batchNumber, fromCache: false };
    } catch (error) {
      console.error(`❌ Error caching batch ${batchNumber} from worker:`, error);
      return rejectWithValue(error.message);
    }
  }
);

// Async thunk for fetching initial data (batch 1)
const fetchInitialWeatherData = createAsyncThunk(
  'weather/fetchInitialWeatherData',
  async (_, { dispatch, rejectWithValue }) => {
    try {
      return await dispatch(fetchWeatherBatch(1)).unwrap();
    } catch (error) {
      return rejectWithValue(error);
    }
  }
);

// Initial state
const initialState = {
  weatherData: null,
  loading: false,
  error: null,
  selectedVariable: 'T2',
  currentTimeIndex: 0,
  animationSpeed: 1000,

  // Batch management
  batchInfo: null,
  fetchingBatches: [],

  // Cache info
  cacheStats: { hits: 0, misses: 0, totalSize: 0 },

  // Available weather variables with their display info
  weatherVariables: {
    T2: { name: 'Temperature', unit: '°C' },
    RH: { name: 'Humidity', unit: '%' },
    TOTAL_RAIN: { name: 'Precipitation', unit: 'mm' },
    SST: { name: 'Sea Surface Temp', unit: '°C' },
    TSK: { name: 'Surface Temperature', unit: '°C' },
  }
};

const weatherSlice = createSlice({
  name: 'weather',
  initialState,
  reducers: {
    setSelectedVariable: (state, action) => {
      state.selectedVariable = action.payload;
    },

    setCurrentTimeIndex: (state, action) => {
      state.currentTimeIndex = action.payload;
    },

    setAnimationSpeed: (state, action) => {
      state.animationSpeed = action.payload;
    },

    // FIXED: Action to advance to next time step (for animation)
    advanceTime: (state) => {
      // Get total possible time steps from metadata
      const totalSteps = state.batchInfo ? state.batchInfo.totalTimestamps - 1 : 100;
      
      if (state.currentTimeIndex < totalSteps) {
        state.currentTimeIndex = state.currentTimeIndex + 1;
      } else {
        // Loop back to beginning
        state.currentTimeIndex = 0;
      }
    },

    // Reset to first time step
    resetTime: (state) => {
      state.currentTimeIndex = 0;
    },

    clearError: (state) => {
      state.error = null;
    },

    // Clear all weather data (for mode changes)
    clearWeatherData: (state) => {
      state.weatherData = null;
      state.batchInfo = null;
      state.fetchingBatches = [];
      state.currentTimeIndex = 0;
      state.error = null;
    },

    // Cache management actions
    clearCache: (state) => {
      cache.clear().then(() => {
        state.cacheStats = { hits: 0, misses: 0, totalSize: 0 };
        console.log('IndexedDB cache cleared successfully');
      }).catch(error => {
        console.warn('Error clearing IndexedDB cache:', error);
      });
    },

    // FIXED: Direct action for cached data (no async, no pending state)
    loadCachedBatch: (state, action) => {
      const { batchNumber, data } = action.payload;
      
      // Update cache stats
      state.cacheStats.hits += 1;

      // Merge with existing data (same logic as regular fetch)
      if (state.weatherData && state.batchInfo) {
        const existingTimeSeries = state.weatherData.time_series;
        const newTimeSeries = data.time_series;

        const existingTimeIndices = new Set(existingTimeSeries.map(t => t.time));
        const uniqueNewTimeSeries = newTimeSeries.filter(t => !existingTimeIndices.has(t.time));

        const combinedTimeSeries = [...existingTimeSeries, ...uniqueNewTimeSeries]
          .sort((a, b) => a.time - b.time);

        state.weatherData.time_series = combinedTimeSeries;

        if (!state.batchInfo.loadedBatches.includes(batchNumber)) {
          state.batchInfo.loadedBatches.push(batchNumber);
          state.batchInfo.loadedBatches.sort((a, b) => a - b);
        }
      }

      console.log(`✅ Batch ${batchNumber} loaded instantly from cache. Total loaded batches:`, state.batchInfo?.loadedBatches);
    },

    // Manual action dispatchers for Web Worker integration
    addFetchingBatch: (state, action) => {
      const batchNumber = action.payload;
      if (!state.fetchingBatches.includes(batchNumber)) {
        state.fetchingBatches.push(batchNumber);
      }
    },

    removeFetchingBatch: (state, action) => {
      const batchNumber = action.payload;
      state.fetchingBatches = state.fetchingBatches.filter(b => b !== batchNumber);
    }
  },

  extraReducers: (builder) => {
    builder
      // Handle fetchWeatherBatch pending
      .addCase(fetchWeatherBatch.pending, (state, action) => {
        const batchNumber = action.meta.arg;
        if (!state.fetchingBatches.includes(batchNumber)) {
          state.fetchingBatches.push(batchNumber);
        }
        // Only show loading for the first batch
        if (batchNumber === 1) state.loading = true;
        state.error = null;
      })

      // Handle fetchWeatherBatch fulfilled
      .addCase(fetchWeatherBatch.fulfilled, (state, action) => {
        const { batchNumber, fromCache, ...data } = action.payload;

        // Update cache stats
        if (fromCache) state.cacheStats.hits += 1;
        else state.cacheStats.misses += 1;

        // Remove from fetching batches
        state.fetchingBatches = state.fetchingBatches.filter(b => b !== batchNumber);

        if (batchNumber === 1) {
          // First batch - initialize everything
          state.loading = false;
          state.weatherData = data;
          state.batchInfo = {
            currentBatch: 1,
            totalBatches: data.metadata.batch_info.total_batches,
            batchSize: data.metadata.batch_info.batch_size,
            loadedBatches: [1],
            totalTimestamps: data.metadata.total_timestamps,
            initialTimestamp: data.metadata.initial_timestamp,
            finalTimestamp: data.metadata.final_timestamp
          };

          // Set initial time to first available time step (index 0)
          state.currentTimeIndex = 0;
        } else {
          // Subsequent batches - merge with existing data
          if (state.weatherData && state.batchInfo) {
            // Merge time series data
            const existingTimeSeries = state.weatherData.time_series;
            const newTimeSeries = data.time_series;

            // Combine time series, ensuring proper ordering and no duplicates
            const existingTimeIndices = new Set(existingTimeSeries.map(t => t.time));
            const uniqueNewTimeSeries = newTimeSeries.filter(t => !existingTimeIndices.has(t.time));

            const combinedTimeSeries = [...existingTimeSeries, ...uniqueNewTimeSeries]
              .sort((a, b) => a.time - b.time);

            state.weatherData.time_series = combinedTimeSeries;

            // Update batch info
            if (!state.batchInfo.loadedBatches.includes(batchNumber)) {
              state.batchInfo.loadedBatches.push(batchNumber);
              state.batchInfo.loadedBatches.sort((a, b) => a - b);
            }
          }
        }

        state.error = null;
        const cacheStatus = fromCache ? '(from cache)' : '(from API)';
        console.log(`✅ Batch ${batchNumber} loaded successfully ${cacheStatus}. Total loaded batches:`, state.batchInfo?.loadedBatches);
      })

      // Handle fetchWeatherBatch rejected
      .addCase(fetchWeatherBatch.rejected, (state, action) => {
        const batchNumber = action.meta.arg;

        // Remove from fetching batches
        state.fetchingBatches = state.fetchingBatches.filter(b => b !== batchNumber);

        if (batchNumber === 1) {
          state.loading = false;
          state.weatherData = null;
        }

        state.error = action.payload || `Failed to fetch batch ${batchNumber}`;
        console.error(`❌ Failed to fetch batch ${batchNumber}:`, action.payload);
      })

      // Handle fetchWeatherBatchFromWorker (Web Worker results)
      .addCase(fetchWeatherBatchFromWorker.pending, (state, action) => {
        const batchNumber = action.meta.arg.batchNumber;
        if (!state.fetchingBatches.includes(batchNumber)) {
          state.fetchingBatches.push(batchNumber);
        }
      })

      .addCase(fetchWeatherBatchFromWorker.fulfilled, (state, action) => {
        const { batchNumber, fromCache, ...data } = action.payload;

        // Update cache stats
        state.cacheStats.misses += 1; // Worker results are always fresh

        // Remove from fetching batches
        state.fetchingBatches = state.fetchingBatches.filter(b => b !== batchNumber);

        // Merge with existing data (same logic as regular fetch)
        if (state.weatherData && state.batchInfo) {
          const existingTimeSeries = state.weatherData.time_series;
          const newTimeSeries = data.time_series;

          const existingTimeIndices = new Set(existingTimeSeries.map(t => t.time));
          const uniqueNewTimeSeries = newTimeSeries.filter(t => !existingTimeIndices.has(t.time));

          const combinedTimeSeries = [...existingTimeSeries, ...uniqueNewTimeSeries]
            .sort((a, b) => a.time - b.time);

          state.weatherData.time_series = combinedTimeSeries;

          if (!state.batchInfo.loadedBatches.includes(batchNumber)) {
            state.batchInfo.loadedBatches.push(batchNumber);
            state.batchInfo.loadedBatches.sort((a, b) => a - b);
          }
        }

        console.log(`✅ Batch ${batchNumber} loaded successfully from Web Worker. Total loaded batches:`, state.batchInfo?.loadedBatches);
      })

      .addCase(fetchWeatherBatchFromWorker.rejected, (state, action) => {
        const batchNumber = action.meta.arg.batchNumber;
        state.fetchingBatches = state.fetchingBatches.filter(b => b !== batchNumber);
        console.error(`❌ Failed to load batch ${batchNumber} from Web Worker:`, action.payload);
      })

      // Handle fetchInitialWeatherData
      .addCase(fetchInitialWeatherData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(fetchInitialWeatherData.fulfilled, (state) => {
        // Handled by fetchWeatherBatch.fulfilled
      })

      .addCase(fetchInitialWeatherData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || 'Failed to fetch initial weather data';
      });
  }
});

// Export actions - FIXED: Added loadCachedBatch export
export const {
  setSelectedVariable, setCurrentTimeIndex, setAnimationSpeed, advanceTime, resetTime,
  clearError, clearWeatherData, clearCache, loadCachedBatch, addFetchingBatch, removeFetchingBatch
} = weatherSlice.actions;

// Backward compatibility actions (for existing components)
export const setCurrentTime = setCurrentTimeIndex; // Alias for setCurrentTimeIndex

// Export thunks
export { fetchWeatherBatch, fetchInitialWeatherData, fetchWeatherBatchFromWorker };

// Selectors
export const selectWeatherData = (state) => state.weather.weatherData;
export const selectLoading = (state) => state.weather.loading;
export const selectError = (state) => state.weather.error;
export const selectSelectedVariable = (state) => state.weather.selectedVariable;
export const selectCurrentTimeIndex = (state) => state.weather.currentTimeIndex;
export const selectAnimationSpeed = (state) => state.weather.animationSpeed;
export const selectWeatherVariables = (state) => state.weather.weatherVariables;
export const selectBatchInfo = (state) => state.weather.batchInfo;
export const selectFetchingBatches = (state) => state.weather.fetchingBatches;
export const selectCacheStats = (state) => state.weather.cacheStats;

// Memoized selector for available time indices
export const selectTimeIndices = createSelector(
  [(state) => state.weather.weatherData],
  (weatherData) => {
    if (!weatherData || !weatherData.time_series) return [];
    return weatherData.time_series.map(t => t.time);
  }
);

// Backward compatibility selectors (for existing components)
export const selectCurrentTime = (state) => state.weather.currentTimeIndex; // Maps to currentTimeIndex
export const selectTimeSteps = selectTimeIndices; // Alias for selectTimeIndices

// Complex selectors
// Memoized selector for current time data
export const selectCurrentTimeData = createSelector(
  [
    (state) => state.weather.weatherData,
    (state) => state.weather.currentTimeIndex
  ],
  (weatherData, currentTimeIndex) => {
    if (!weatherData || !weatherData.time_series) return null;
    return weatherData.time_series.find(t => t.time === currentTimeIndex);
  }
);

// Memoized selector for current stats to prevent unnecessary rerenders
export const selectCurrentStats = createSelector(
  [
    (state) => state.weather.weatherData,
    (state) => state.weather.currentTimeIndex,
    (state) => state.weather.selectedVariable
  ],
  (weatherData, currentTimeIndex, selectedVariable) => {
    if (!weatherData || !weatherData.time_series) return null;

    const timeData = weatherData.time_series.find(t => t.time === currentTimeIndex);
    if (!timeData || !timeData.variables[selectedVariable]) return null;

    const values = timeData.variables[selectedVariable];
    const scale = weatherData.metadata.variable_scales[selectedVariable] || 1;

    // Handle wind data with speed and direction
    let scaledValues;
    if (selectedVariable === 'WIND' && typeof values === 'object' && values.speed) {
      scaledValues = values.speed.map(v => v / scale);
    } else if (Array.isArray(values)) {
      scaledValues = values.map(v => v / scale);
    } else {
      return null;
    }

    return {
      min: Math.min(...scaledValues).toFixed(2),
      max: Math.max(...scaledValues).toFixed(2),
      avg: (scaledValues.reduce((a, b) => a + b, 0) / scaledValues.length).toFixed(2)
    };
  }
);

// Memoized selector for time range info with actual timestamps
export const selectTimeRangeInfo = createSelector(
  [(state) => state.weather.batchInfo, (state) => state.weather.weatherData],
  (batchInfo, weatherData) => {
    if (!batchInfo || !weatherData) return null;

    const { totalTimestamps, initialTimestamp, finalTimestamp } = batchInfo;
    const availableIndices = weatherData.time_series.map(t => t.time);
    
    // Parse the timestamp strings
    const startDate = parseTimestamp(initialTimestamp);
    const endDate = parseTimestamp(finalTimestamp);

    return {
      totalTimestamps,
      availableSteps: availableIndices.length,
      startDate,
      endDate,
      initialTimestamp,
      finalTimestamp,
      availableIndices
    };
  }
);

// Helper selector to get timestamp for current time index
export const selectCurrentTimestamp = createSelector(
  [
    (state) => state.weather.batchInfo,
    (state) => state.weather.currentTimeIndex
  ],
  (batchInfo, currentTimeIndex) => {
    if (!batchInfo) return null;
    
    const { totalTimestamps, initialTimestamp, finalTimestamp } = batchInfo;
    const startDate = parseTimestamp(initialTimestamp);
    const endDate = parseTimestamp(finalTimestamp);
    
    const totalDuration = endDate.getTime() - startDate.getTime();
    const stepDuration = totalDuration / (totalTimestamps - 1);
    
    return new Date(startDate.getTime() + (currentTimeIndex * stepDuration));
  }
);

// Memoized selector to get batch loading progress
export const selectBatchProgress = createSelector(
  [
    (state) => state.weather.batchInfo,
    (state) => state.weather.fetchingBatches
  ],
  (batchInfo, fetchingBatches) => {
    if (!batchInfo) return null;

    return {
      loadedBatches: batchInfo.loadedBatches.length,
      totalBatches: batchInfo.totalBatches,
      currentlyFetching: fetchingBatches.length,
      progress: (batchInfo.loadedBatches.length / batchInfo.totalBatches) * 100
    };
  }
);

export default weatherSlice.reducer;