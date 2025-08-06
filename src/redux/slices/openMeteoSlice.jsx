import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';

// Helper function to calculate polygon area using Shoelace formula
const calculatePolygonArea = (points) => {
    if (points.length < 3) return 0;
    
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].lat * points[j].lng;
        area -= points[j].lat * points[i].lng;
    }
    area = Math.abs(area) / 2;
    
    // Convert to km² (rough approximation)
    // 1 degree² ≈ 12,321 km² at equator
    return area * 12321;
};

// Helper function to check if a point is inside a polygon
const pointInPolygon = (point, polygon) => {
    const { lat, lng } = point;
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lat;
        const yi = polygon[i].lng;
        const xj = polygon[j].lat;
        const yj = polygon[j].lng;
        
        if (((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    
    return inside;
};

// Helper function to get polygon center (centroid)
const getPolygonCenter = (points) => {
    if (points.length === 0) return { lat: 0, lng: 0 };
    
    const center = points.reduce(
        (acc, point) => ({
            lat: acc.lat + point.lat,
            lng: acc.lng + point.lng
        }),
        { lat: 0, lng: 0 }
    );
    
    return {
        lat: center.lat / points.length,
        lng: center.lng / points.length
    };
};

// Async thunk for fetching OpenMeteo weather data
const fetchOpenMeteoData = createAsyncThunk(
    'openMeteo/fetchWeatherData',
    async (polygonPoints, { rejectWithValue }) => {
        try {
            if (polygonPoints.length < 3) {
                throw new Error('At least 3 points required for polygon');
            }

            // Get polygon center for API call
            const center = getPolygonCenter(polygonPoints);
            
            // Calculate date range (current date to 5 days from now)
            const startDate = new Date();
            const endDate = new Date();
            endDate.setDate(startDate.getDate() + 5);
            
            const formatDate = (date) => {
                return date.toISOString().split('T')[0];
            };

            // Construct API URL
            const apiUrl = `https://api.open-meteo.com/v1/forecast?` +
                `latitude=${center.lat.toFixed(6)}&` +
                `longitude=${center.lng.toFixed(6)}&` +
                `start_date=${formatDate(startDate)}&` +
                `end_date=${formatDate(endDate)}&` +
                `hourly=temperature_2m,relative_humidity_2m,precipitation,pressure_msl,wind_speed_10m,wind_direction_10m`;

            console.log('📡 Fetching OpenMeteo data from:', apiUrl);

            const response = await fetch(apiUrl);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            // Process and enhance the data
            const processedData = {
                ...data,
                polygon: polygonPoints,
                center: center,
                fetchedAt: new Date().toISOString(),
                area: calculatePolygonArea(polygonPoints)
            };

            console.log('✅ OpenMeteo data fetched successfully');
            return processedData;

        } catch (error) {
            console.error('❌ Error fetching OpenMeteo data:', error);
            return rejectWithValue(error.message);
        }
    }
);

// Initial state
const initialState = {
    // Drawing state
    drawingMode: 'view', // 'view', 'draw', 'edit', 'erase'
    polygonPoints: [],
    
    // Data state
    weatherData: null,
    loading: false,
    error: null,
    
    // Animation state
    currentTimeIndex: 0,
    animationSpeed: 1000,
    isPlaying: false,
    
    // UI state
    opacity: 0.7,
    showPolygon: true,
    
    // Cache
    lastFetchedPolygon: null,
    fetchedAt: null,
    
    // Manual fetch trigger (removed auto-fetch)
    shouldFetchData: false
};

const openMeteoSlice = createSlice({
    name: 'openMeteo',
    initialState,
    reducers: {
        // Drawing actions
        setDrawingMode: (state, action) => {
            state.drawingMode = action.payload;
        },

        setPolygonPoints: (state, action) => {
            state.polygonPoints = action.payload;
            // Clear weather data when polygon changes
            if (state.weatherData && action.payload.length === 0) {
                state.weatherData = null;
                state.currentTimeIndex = 0;
                state.error = null;
            }
        },

        addPolygonPoint: (state, action) => {
            const newPoint = action.payload;
            
            // Limit to 12 points
            if (state.polygonPoints.length < 12) {
                state.polygonPoints.push(newPoint);
                // Clear any existing weather data when adding points
                if (state.weatherData) {
                    state.weatherData = null;
                    state.currentTimeIndex = 0;
                }
            }
        },

        removeLastPolygonPoint: (state) => {
            state.polygonPoints.pop();
            // Clear weather data when modifying polygon
            if (state.weatherData) {
                state.weatherData = null;
                state.currentTimeIndex = 0;
            }
        },

        clearPolygonData: (state) => {
            state.polygonPoints = [];
            state.weatherData = null;
            state.currentTimeIndex = 0;
            state.error = null;
            state.drawingMode = 'view';
            state.shouldFetchData = false;
            state.lastFetchedPolygon = null;
            state.fetchedAt = null;
            state.loading = false;
        },

        // Animation actions
        setOpenMeteoCurrentTimeIndex: (state, action) => {
            state.currentTimeIndex = action.payload;
        },

        setOpenMeteoAnimationSpeed: (state, action) => {
            state.animationSpeed = action.payload;
        },

        advanceOpenMeteoTime: (state) => {
            if (state.weatherData?.hourly?.time) {
                const maxIndex = state.weatherData.hourly.time.length - 1;
                if (state.currentTimeIndex < maxIndex) {
                    state.currentTimeIndex += 1;
                } else {
                    // Loop back to beginning
                    state.currentTimeIndex = 0;
                }
            }
        },

        setOpenMeteoIsPlaying: (state, action) => {
            state.isPlaying = action.payload;
        },

        // UI actions
        setOpenMeteoOpacity: (state, action) => {
            state.opacity = action.payload;
        },

        setShowPolygon: (state, action) => {
            state.showPolygon = action.payload;
        },

        // Data actions
        clearOpenMeteoError: (state) => {
            state.error = null;
        },

        // Manual trigger for data fetching - ONLY way to fetch data now
        triggerDataFetch: (state) => {
            if (state.polygonPoints.length >= 3 && !state.loading) {
                state.shouldFetchData = true;
            }
        },

        // Remove specific polygon point
        removePolygonPoint: (state, action) => {
            const indexToRemove = action.payload;
            if (indexToRemove >= 0 && indexToRemove < state.polygonPoints.length) {
                state.polygonPoints.splice(indexToRemove, 1);
                // Clear weather data when modifying polygon
                if (state.weatherData) {
                    state.weatherData = null;
                    state.currentTimeIndex = 0;
                }
            }
        },

        // Edit/move polygon point
        editPolygonPoint: (state, action) => {
            const { index, newPoint } = action.payload;
            if (index >= 0 && index < state.polygonPoints.length) {
                state.polygonPoints[index] = newPoint;
                // Clear weather data when modifying polygon
                if (state.weatherData) {
                    state.weatherData = null;
                    state.currentTimeIndex = 0;
                }
            }
        }
    },

    extraReducers: (builder) => {
        builder
            // Handle fetchOpenMeteoData pending
            .addCase(fetchOpenMeteoData.pending, (state) => {
                state.loading = true;
                state.error = null;
                state.shouldFetchData = false; // Reset trigger
                console.log('🔄 Fetching OpenMeteo data...');
            })

            // Handle fetchOpenMeteoData fulfilled
            .addCase(fetchOpenMeteoData.fulfilled, (state, action) => {
                state.loading = false;
                state.weatherData = action.payload;
                state.currentTimeIndex = 0;
                state.error = null;
                state.lastFetchedPolygon = [...state.polygonPoints];
                state.fetchedAt = action.payload.fetchedAt;
                
                console.log(`✅ OpenMeteo data loaded successfully. 
                    Time points: ${action.payload.hourly?.time?.length || 0},
                    Polygon area: ${action.payload.area?.toFixed(2) || 0} km²`);
            })

            // Handle fetchOpenMeteoData rejected
            .addCase(fetchOpenMeteoData.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload || 'Failed to fetch OpenMeteo data';
                state.shouldFetchData = false; // Reset trigger
                console.error('❌ Failed to fetch OpenMeteo data:', action.payload);
            });
    }
});

// Export actions
export const {
    setDrawingMode, setPolygonPoints, addPolygonPoint, removeLastPolygonPoint, clearPolygonData,
    setOpenMeteoCurrentTimeIndex, setOpenMeteoAnimationSpeed, advanceOpenMeteoTime, setOpenMeteoIsPlaying,
    setOpenMeteoOpacity, setShowPolygon, clearOpenMeteoError, triggerDataFetch,
    removePolygonPoint, editPolygonPoint
} = openMeteoSlice.actions;

// Export async thunk
export { fetchOpenMeteoData };

// Basic selectors with fallback handling
export const selectDrawingMode = (state) => state.openMeteo?.drawingMode || 'view';
export const selectPolygonPoints = (state) => state.openMeteo?.polygonPoints || [];
export const selectOpenMeteoData = (state) => state.openMeteo?.weatherData || null;
export const selectOpenMeteoLoading = (state) => state.openMeteo?.loading || false;
export const selectOpenMeteoError = (state) => state.openMeteo?.error || null;
export const selectOpenMeteoCurrentTimeIndex = (state) => state.openMeteo?.currentTimeIndex || 0;
export const selectOpenMeteoAnimationSpeed = (state) => state.openMeteo?.animationSpeed || 1000;
export const selectOpenMeteoIsPlaying = (state) => state.openMeteo?.isPlaying || false;
export const selectOpenMeteoOpacity = (state) => state.openMeteo?.opacity || 0.7;
export const selectShowPolygon = (state) => state.openMeteo?.showPolygon || true;
export const selectShouldFetchData = (state) => state.openMeteo?.shouldFetchData || false;

// Memoized selectors
export const selectPolygonArea = createSelector(
    [selectPolygonPoints],
    (points) => calculatePolygonArea(points)
);

export const selectPolygonCenter = createSelector(
    [selectPolygonPoints],
    (points) => getPolygonCenter(points)
);

export const selectOpenMeteoTimeIndices = createSelector(
    [selectOpenMeteoData],
    (weatherData) => {
        if (!weatherData?.hourly?.time) return [];
        return weatherData.hourly.time.map((_, index) => index);
    }
);

export const selectOpenMeteoCurrentTimestamp = createSelector(
    [selectOpenMeteoData, selectOpenMeteoCurrentTimeIndex],
    (weatherData, currentTimeIndex) => {
        if (!weatherData?.hourly?.time || currentTimeIndex >= weatherData.hourly.time.length) {
            return null;
        }
        return weatherData.hourly.time[currentTimeIndex];
    }
);

export const selectOpenMeteoCurrentData = createSelector(
    [selectOpenMeteoData, selectOpenMeteoCurrentTimeIndex],
    (weatherData, currentTimeIndex) => {
        if (!weatherData?.hourly || currentTimeIndex >= (weatherData.hourly.time?.length || 0)) {
            return null;
        }

        const hourly = weatherData.hourly;
        const data = {};
        
        // Extract all hourly data for current time index
        Object.keys(hourly).forEach(key => {
            if (key !== 'time' && Array.isArray(hourly[key])) {
                data[key] = hourly[key][currentTimeIndex];
            }
        });

        return {
            time: hourly.time[currentTimeIndex],
            data: data,
            units: weatherData.hourly_units || {}
        };
    }
);

export const selectIsPolygonComplete = createSelector(
    [selectPolygonPoints],
    (points) => points.length >= 3
);

export const selectCanAddMorePoints = createSelector(
    [selectPolygonPoints],
    (points) => points.length < 12
);

export const selectPolygonStats = createSelector(
    [selectPolygonPoints, selectPolygonArea],
    (points, area) => ({
        pointCount: points.length,
        maxPoints: 12,
        area: area,
        isComplete: points.length >= 3,
        canAddMore: points.length < 12
    })
);

// Data validation selectors
export const selectHasValidData = createSelector(
    [selectOpenMeteoData, selectOpenMeteoError],
    (weatherData, error) => {
        return weatherData && !error && weatherData.hourly?.time?.length > 0;
    }
);

export const selectDataFetchStatus = createSelector(
    [selectOpenMeteoLoading, selectOpenMeteoError, selectHasValidData],
    (loading, error, hasValidData) => {
        if (loading) return 'loading';
        if (error) return 'error';
        if (hasValidData) return 'success';
        return 'idle';
    }
);

// Helper selector for map interactions
export const selectMapInteractionMode = createSelector(
    [selectDrawingMode, selectIsPolygonComplete],
    (drawingMode, isComplete) => {
        if (drawingMode === 'draw') return 'drawing';
        if (drawingMode === 'edit') return 'editing';
        if (drawingMode === 'erase') return 'erasing';
        if (isComplete) return 'complete';
        return 'viewing';
    }
);

export default openMeteoSlice.reducer;