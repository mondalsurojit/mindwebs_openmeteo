import React, { useEffect, useState } from 'react';
import './App.css';
import { useSelector, useDispatch } from 'react-redux';

import CustomMap from './versions/CustomMap';
import WeatherDataTable from './components/WeatherDataTable';
import ControlPanel from './components/ControlPanel';

import {
  fetchInitialWeatherData, fetchWeatherBatchFromWorker, loadCachedBatch, addFetchingBatch, removeFetchingBatch,
  selectLoading, selectError, selectWeatherData, selectBatchInfo, selectCacheStats,
} from './redux/slices/weatherSlice';

import { setShowDataTable, selectIsPlaying } from './redux/slices/uiSlice';

function App() {
  const dispatch = useDispatch();
  const loading = useSelector(selectLoading);
  const error = useSelector(selectError);
  const weatherData = useSelector(selectWeatherData);
  const batchInfo = useSelector(selectBatchInfo);
  const cacheStats = useSelector(selectCacheStats);

  const [viewMode, setViewMode] = useState('map'); // 'map', 'table'
  const [backgroundFetchStarted, setBackgroundFetchStarted] = useState(false);
  const [worker, setWorker] = useState(null);
  const backendUrl = import.meta.env.VITE_BACKEND_URL;

  // Initialize Web Worker
  useEffect(() => {
    const workerBlob = new Blob([`
      self.onmessage = async function(e) {
        const { type, batchNumber } = e.data;
        
        if (type === 'FETCH_BATCH') {
          try {
            console.log(\`🔄 Worker fetching batch \${batchNumber}...\`);
            
            const paddedBatchNumber = String(batchNumber).padStart(3, '0');
            const response = await fetch(\`${backendUrl}/data/\${paddedBatchNumber}\`);
            
            if (!response.ok) {
              throw new Error(\`HTTP error! status: \${response.status}\`);
            }
            
            const data = await response.json();
            
            self.postMessage({
              type: 'FETCH_SUCCESS',
              batchNumber,
              data
            });
            
            console.log(\`✅ Worker completed batch \${batchNumber}\`);
            
          } catch (error) {
            console.error(\`❌ Worker error for batch \${batchNumber}:\`, error);
            
            self.postMessage({
              type: 'FETCH_ERROR',
              batchNumber,
              error: error.message
            });
          }
        }
      };
    `], { type: 'application/javascript' });

    const newWorker = new Worker(URL.createObjectURL(workerBlob));

    newWorker.onmessage = function (e) {
      const { type, batchNumber, data, error } = e.data;

      if (type === 'FETCH_SUCCESS') {
        // Use the Web Worker specific action
        dispatch(fetchWeatherBatchFromWorker({ batchNumber, data }));
      } else if (type === 'FETCH_ERROR') {
        // Remove from fetching batches and log error
        dispatch(removeFetchingBatch(batchNumber));
        console.error(`❌ Worker failed to fetch batch ${batchNumber}:`, error);
      }
    };

    setWorker(newWorker);

    return () => {
      if (newWorker) newWorker.terminate();
    };
  }, [dispatch]);

  // Fetch initial weather data on app start
  useEffect(() => {
    dispatch(fetchInitialWeatherData());
  }, [dispatch]);

  // Simplified IndexedDB cache check
  const checkCache = async (batchNumber) => {
    const DB_NAME = 'WeatherDataCache';
    const STORE_NAME = 'weatherBatches';
    const CACHE_DURATION = 12 * 60 * 60 * 1000; // 12 hours

    try {
      return new Promise((resolve) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction([STORE_NAME], 'readonly');
          const store = transaction.objectStore(STORE_NAME);
          const getRequest = store.get(batchNumber);

          getRequest.onsuccess = () => {
            const result = getRequest.result;
            if (result) {
              const now = Date.now();
              if (now - result.timestamp < CACHE_DURATION) resolve(result.data);
              else resolve(null); // Cache expired
            } else resolve(null); // Not found
          };

          getRequest.onerror = () => resolve(null);
        };

        request.onerror = () => resolve(null);
      });
    } catch (error) {
      return null;
    }
  };

  // Non-blocking background fetching - completely separate from animation
  useEffect(() => {
    if (weatherData && batchInfo && !backgroundFetchStarted && worker) {
      const { totalBatches, loadedBatches } = batchInfo;

      if (totalBatches > 1 && loadedBatches.length === 1) {
        console.log(`🚀 Starting background fetch of ${totalBatches - 1} remaining batches...`);
        setBackgroundFetchStarted(true);

        // Truly async background fetching that doesn't block animation
        const fetchRemainingBatches = async () => {
          // Process batches one at a time with minimal delay
          for (let batchNumber = 2; batchNumber <= totalBatches; batchNumber++) {
            try {
              // Check IndexedDB cache first (fast, non-blocking)
              const cachedData = await checkCache(batchNumber);

              if (cachedData) {
                // FIXED: Cache hit - use direct action (no pending state, no async)
                console.log(`📦 Loading batch ${batchNumber} from cache (instant)`);
                dispatch(loadCachedBatch({ batchNumber, data: cachedData }));
                // Tiny delay to prevent overwhelming
                await new Promise(resolve => setTimeout(resolve, 10));
              } else {
                // Cache miss - use worker for API call (non-blocking)
                dispatch(addFetchingBatch(batchNumber));
                worker.postMessage({ type: 'FETCH_BATCH', batchNumber });
              }

              // Very small delay to prevent overwhelming - this doesn't affect animation
              await new Promise(resolve => setTimeout(resolve, 100));

            } catch (error) {
              console.warn(`Cache check failed for batch ${batchNumber}, using worker:`, error);
              // Fallback to worker
              dispatch(addFetchingBatch(batchNumber));
              worker.postMessage({ type: 'FETCH_BATCH', batchNumber });
              await new Promise(resolve => setTimeout(resolve, 10));
            }
          }
          console.log('✅ Background fetching process initiated');
        };

        // Start background fetching without blocking
        fetchRemainingBatches().catch(error => {
          console.error('Background fetching error:', error);
        });
      }
    }
  }, [weatherData, batchInfo, backgroundFetchStarted, worker, dispatch]);

  // Retry function for error state
  const handleRetry = () => {
    setBackgroundFetchStarted(false); // Reset background fetch flag
    dispatch(fetchInitialWeatherData());
  };

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    dispatch(setShowDataTable(mode === 'table'));
  };

  const renderContent = () => {
    switch (viewMode) {
      case 'table':
        return (
          <div className="h-screen w-full overflow-auto">
            <WeatherDataTable />
          </div>
        );
      default:
        return (
          <div className="w-full h-screen overflow-hidden">
            <CustomMap />
          </div>
        );
    }
  };

  // if (loading) {
  //   return (
  //     <div className="max-w-screen-3xl h-screen m-auto overflow-hidden">
  //       <ControlPanel
  //         viewMode={viewMode}
  //         handleViewModeChange={handleViewModeChange} />

  //       {renderContent()}

  //       {/* Loading Overlay */}
  //       <div className="fixed inset-0 z-40 bg-gray-600/25 backdrop-blur-xs"></div>
  //       <div className="absolute inset-0 flex items-center justify-center z-50">
  //         <div className="animate-spin rounded-full h-20 w-20 border-b-4 shadow-2xs border-blue-600"></div>
  //       </div>
  //     </div>
  //   );
  // }

  // if (error) {
  //   return (
  //     <div className="max-w-screen-3xl h-screen m-auto overflow-hidden">
  //       <ControlPanel
  //         viewMode={viewMode}
  //         handleViewModeChange={handleViewModeChange} />

  //       {renderContent()}

  //       {/* Error Overlay */}
  //       <div className="fixed inset-0 z-40 bg-gray-600/25 backdrop-blur-xs"></div>
  //       <div className="absolute inset-0 flex items-center justify-center z-50">
  //         <div className="bg-white p-8 rounded-lg shadow-lg max-w-md text-center">
  //           <div className="text-red-500 mb-4 text-4xl">⚠️</div>
  //           <h2 className="text-xl font-semibold text-gray-800 mb-2">Failed to Load Weather Data</h2>

  //           <div className="space-y-2 text-sm text-gray-500 mb-6 px-10">
  //             <p>Check your internet connection</p>
  //             <p>Verify the Backend/API server is running</p>
  //           </div>

  //           <button onClick={handleRetry}
  //             className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium cursor-pointer">
  //             Retry Loading</button>
  //         </div>
  //       </div>
  //     </div>
  //   );
  // }

  // Success state - Show the app
  return (
    <div className="relative max-w-screen-3xl h-screen m-auto overflow-hidden">
      <ControlPanel
        viewMode={viewMode}
        handleViewModeChange={handleViewModeChange} />

      {renderContent()}
    </div>
  );
}

export default App;