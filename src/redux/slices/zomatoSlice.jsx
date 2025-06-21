import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import staticStationData from '../../data/zws2.json';
const backendUrl = import.meta.env.VITE_BACKEND_URL;

// Create city-to-station mapping and flattened station data
const createStationMappings = (staticData) => {
    const stationToCity = {};
    const flattenedStations = {};

    Object.entries(staticData).forEach(([city, stations]) => {
        stations.forEach(station => {
            stationToCity[station.Id] = city;
            flattenedStations[station.Id] = {
                id: station.Id,
                name: station.locality,
                lat: station.lat,
                lng: station.long,
                city: city,
                deviceType: station.device_type
            };
        });
    });

    return { stationToCity, flattenedStations };
};

const { stationToCity, flattenedStations } = createStationMappings(staticStationData);

const getDefaultWeatherData = () => ({
    temp: null, humidity: null, windSpeed: null,
    windDirection: null, rainIntensity: null, rainfall: null,
    aqiPM10: null, aqiPM25: null, timestamp: null,
});

// Async thunk for fetching weather data for all stations in a city
export const fetchCityWeatherData = createAsyncThunk(
    'zomato/fetchCityWeatherData',
    async (city, { rejectWithValue }) => {
        try {
            const response = await fetch(`${backendUrl}/zws/?city=${encodeURIComponent(city)}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.status === 'success' && data.stations) {
                // Transform the data to match our existing structure
                const transformedData = {};

                data.stations.forEach(stationData => {
                    const { station, locality_weather_data } = stationData;

                    // Use locality_id as the station ID
                    const stationId = station.locality_id;

                    transformedData[stationId] = {
                        temp: locality_weather_data.temperature || null,
                        humidity: locality_weather_data.humidity || null,
                        windSpeed: locality_weather_data.wind_speed || null,
                        windDirection: locality_weather_data.wind_direction || null,
                        rainIntensity: locality_weather_data.rain_intensity || null,
                        rainfall: locality_weather_data.rain_accumulation || null,
                        aqiPM10: locality_weather_data.aqi_pm_10 || null,
                        aqiPM25: locality_weather_data.aqi_pm_2_point_5 || null,
                        timestamp: data.fetched_at || new Date().toISOString(),
                    };
                });

                return {
                    city, weatherData: transformedData, fetchedAt: data.fetched_at
                };
            } else {
                throw new Error(data.message || 'Failed to fetch weather data');
            }
        } catch (error) {
            console.error('Error fetching city weather data:', error);
            return rejectWithValue(error.message);
        }
    }
);

// Async thunk for refreshing weather data for a specific station (if needed)
export const fetchWeatherForStation = createAsyncThunk(
    'zomato/fetchWeatherForStation',
    async ({ stationId, city }, { getState, rejectWithValue }) => {
        try {
            // Since your API returns all stations for a city, we'll fetch city data
            // and extract the specific station data
            const response = await fetch(`${backendUrl}/zws/?city=${encodeURIComponent(city)}`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data.status === 'success' && data.stations) {
                // Find the specific station
                const stationData = data.stations.find(s => s.station.locality_id === stationId);

                if (stationData) {
                    const { locality_weather_data } = stationData;

                    return {
                        stationId,
                        weatherData: {
                            temp: locality_weather_data.temperature || null,
                            humidity: locality_weather_data.humidity || null,
                            windSpeed: locality_weather_data.wind_speed || null,
                            windDirection: locality_weather_data.wind_direction || null,
                            rainIntensity: locality_weather_data.rain_intensity || null,
                            rainfall: locality_weather_data.rain_accumulation || null,
                            aqiPM10: locality_weather_data.aqi_pm_10 || null,
                            aqiPM25: locality_weather_data.aqi_pm_2_point_5 || null,
                            timestamp: data.fetched_at || new Date().toISOString(),
                        }
                    };
                } else {
                    throw new Error(`Station ${stationId} not found in city ${city}`);
                }
            } else {
                throw new Error(data.message || 'Failed to fetch weather data');
            }
        } catch (error) {
            console.error('Error fetching station weather data:', error);
            return rejectWithValue(error.message);
        }
    }
);

const initialState = {
    // Static station data loaded from ZWS2.json
    staticStations: flattenedStations, 
    stationToCity: stationToCity,

    // Weather data for each station (keyed by station ID)
    currentWeather: {},

    // UI state - MOVED FROM COMPONENT TO REDUX
    selectedCities: ['Hyderabad'], 
    hiddenCities: [], 
    showZWS: false, 
    selectedZomatoStationId: null,

    // Loading states
    loading: {}, 
    cityLoading: false, 
    error: null,

    // Last fetch time for each city
    lastFetched: {},

    // ADD: State version to force re-renders when needed
    stateVersion: 0,

    availableCities: [
        'Ahmedabad', 'Bengaluru', 'Chandigarh', 'Chennai', 'Delhi NCR',
        'Guwahati', 'Hyderabad', 'Jaipur', 'Jalandhar', 'Jammu',
        'Kochi', 'Kolkata', 'Lucknow', 'Ludhiana', 'Mumbai', 'Pune', 'Vijayawada'
    ],

    refreshInterval: 900000, // 15 minutes in milliseconds
};

const zomatoSlice = createSlice({
    name: 'zomato',
    initialState,
    reducers: {
        // UI Actions - UPDATED TO HANDLE REDUX STATE
        setSelectedCities: (state, action) => {
            state.selectedCities = action.payload;
            state.stateVersion += 1; // Force re-render
            // Clear previous selection when cities change
            state.selectedZomatoStationId = null;
        },

        addSelectedCity: (state, action) => {
            const city = action.payload;
            
            if (!state.selectedCities.includes(city) && state.selectedCities.length < 5) {
                state.selectedCities.push(city);
                state.stateVersion += 1; // Force re-render
            }
        },

        removeSelectedCity: (state, action) => {
            const city = action.payload;
            state.selectedCities = state.selectedCities.filter(c => c !== city);
            state.stateVersion += 1; // Force re-render
            // Also remove from hidden cities if it was hidden
            state.hiddenCities = state.hiddenCities.filter(c => c !== city);
            // Clear selected station if it belonged to removed city
            if (state.selectedZomatoStationId) {
                const stationCity = state.stationToCity[state.selectedZomatoStationId];
                if (stationCity === city) state.selectedZomatoStationId = null;
            }
        },

        toggleCityVisibility: (state, action) => {
            const city = action.payload;
            if (state.hiddenCities.includes(city)) {
                state.hiddenCities = state.hiddenCities.filter(c => c !== city);
            } else {
                state.hiddenCities.push(city);
            }
            state.stateVersion += 1; // Force re-render
        },

        setHiddenCities: (state, action) => {
            state.hiddenCities = action.payload;
            state.stateVersion += 1; // Force re-render
        },

        setShowZWS: (state, action) => { 
            state.showZWS = action.payload;
            state.stateVersion += 1; // Force re-render
        },

        setSelectedZomatoStationId: (state, action) => { 
            state.selectedZomatoStationId = action.payload;
        },

        // Weather Data Actions
        setCurrentWeather: (state, action) => {
            const { stationId, weatherData } = action.payload;
            state.currentWeather[stationId] = weatherData;
        },

        clearWeatherData: (state) => { 
            state.currentWeather = {};
        },

        clearError: (state) => { 
            state.error = null;
        },

        // Bulk update weather data
        updateBulkWeatherData: (state, action) => {
            state.currentWeather = { ...state.currentWeather, ...action.payload };
        },

        // Remove old weather data (older than refresh interval)
        cleanupOldWeatherData: (state) => {
            const now = new Date().getTime();
            const cutoff = now - state.refreshInterval;

            Object.keys(state.currentWeather).forEach(stationId => {
                const weatherData = state.currentWeather[stationId];
                if (weatherData && weatherData.timestamp) {
                    const dataTime = new Date(weatherData.timestamp).getTime();
                    if (dataTime < cutoff) {
                        delete state.currentWeather[stationId];
                    }
                }
            });
        },

        // Update last fetched time for a city
        setLastFetched: (state, action) => {
            const { city, timestamp } = action.payload;
            state.lastFetched[city] = timestamp;
        },
    },

    extraReducers: (builder) => {
        builder
            // Handle fetchCityWeatherData
            .addCase(fetchCityWeatherData.pending, (state, action) => {
                state.cityLoading = true;
                state.error = null;
            })
            .addCase(fetchCityWeatherData.fulfilled, (state, action) => {
                const { city, weatherData, fetchedAt } = action.payload;
                state.cityLoading = false;

                // Update weather data only (station info comes from static data)
                Object.entries(weatherData).forEach(([stationId, data]) => {
                    state.currentWeather[stationId] = data;
                });

                // Update last fetched time
                state.lastFetched[city] = fetchedAt;
            })
            .addCase(fetchCityWeatherData.rejected, (state, action) => {
                state.cityLoading = false;
                state.error = action.payload;
                console.error('Redux: fetchCityWeatherData.rejected:', action.payload);
            })

            // Handle fetchWeatherForStation
            .addCase(fetchWeatherForStation.pending, (state, action) => {
                const { stationId } = action.meta.arg;
                state.loading[stationId] = true;
                state.error = null;
            })
            .addCase(fetchWeatherForStation.fulfilled, (state, action) => {
                const { stationId, weatherData } = action.payload;
                state.loading[stationId] = false;
                state.currentWeather[stationId] = weatherData;
            })
            .addCase(fetchWeatherForStation.rejected, (state, action) => {
                const { stationId } = action.meta.arg;
                state.loading[stationId] = false;
                state.error = action.payload;
            });
    }
});

// Export actions
export const {
    setSelectedCities, addSelectedCity, removeSelectedCity,
    toggleCityVisibility, setHiddenCities,
    setShowZWS, setSelectedZomatoStationId,
    setCurrentWeather, clearWeatherData, clearError,
    updateBulkWeatherData, cleanupOldWeatherData, setLastFetched,
} = zomatoSlice.actions;

// Export selectors
export const selectCurrentWeather = (state) => state.zomato.currentWeather;
export const selectStaticStations = (state) => state.zomato.staticStations;
export const selectStationToCity = (state) => state.zomato.stationToCity;
export const selectSelectedCities = (state) => state.zomato.selectedCities;
export const selectHiddenCities = (state) => state.zomato.hiddenCities;
export const selectShowZWS = (state) => state.zomato.showZWS;
export const selectSelectedZomatoStationId = (state) => state.zomato.selectedZomatoStationId;
export const selectAvailableCities = (state) => state.zomato.availableCities;
export const selectZomatoLoading = (state) => state.zomato.loading;
export const selectCityLoading = (state) => state.zomato.cityLoading;
export const selectZomatoError = (state) => state.zomato.error;
export const selectLastFetched = (state) => state.zomato.lastFetched;
export const selectStateVersion = (state) => state.zomato.stateVersion; // NEW: For forcing re-renders

// Complex selectors
export const selectStationWeather = (stationId) => (state) =>
    state.zomato.currentWeather[stationId];

export const selectStationById = (stationId) => (state) =>
    state.zomato.staticStations[stationId];

export const selectIsStationLoading = (stationId) => (state) =>
    state.zomato.loading[stationId] || false;

// FIXED: Combined station data selector - merges static data with live weather
export const selectCombinedStationData = (state) => {
    const staticStations = state.zomato.staticStations;
    const currentWeather = state.zomato.currentWeather;

    return Object.keys(staticStations).map(stationId => ({
        id: stationId,
        ...staticStations[stationId],
        weather: currentWeather[stationId] || getDefaultWeatherData()
    }));
};

// FIXED: Get stations for specific cities (visible ones only)
export const selectVisibleCityStations = (state) => {
    const staticStations = state.zomato.staticStations;
    const currentWeather = state.zomato.currentWeather;
    const stationToCity = state.zomato.stationToCity;
    const selectedCities = state.zomato.selectedCities;
    const hiddenCities = state.zomato.hiddenCities;

    // Filter cities that are selected but not hidden
    const visibleCities = selectedCities.filter(city => !hiddenCities.includes(city));

    const stations = Object.keys(staticStations)
        .filter(stationId => {
            const city = stationToCity[stationId];
            return visibleCities.includes(city);
        })
        .map(stationId => ({
            id: stationId,
            ...staticStations[stationId],
            weather: currentWeather[stationId] || getDefaultWeatherData()
        }));

    return stations;
};

// NEW: Get stations for specific city
export const selectStationsByCity = (city) => (state) => {
    const staticStations = state.zomato.staticStations;
    const currentWeather = state.zomato.currentWeather;
    const stationToCity = state.zomato.stationToCity;

    return Object.keys(staticStations)
        .filter(stationId => stationToCity[stationId] === city)
        .map(stationId => ({
            id: stationId,
            ...staticStations[stationId],
            weather: currentWeather[stationId] || getDefaultWeatherData()
        }));
};

// Updated: City stations selector using static data
export const selectCityStations = (state) => {
    const staticStations = state.zomato.staticStations;
    const currentWeather = state.zomato.currentWeather;

    return Object.keys(staticStations).map(stationId => ({
        id: stationId,
        ...staticStations[stationId],
        weather: currentWeather[stationId] || getDefaultWeatherData()
    }));
};

// Utility selector to get city for a station
export const selectCityForStation = (stationId) => (state) =>
    state.zomato.stationToCity[stationId];

// Check if city data needs refresh
export const selectNeedsRefresh = (city) => (state) => {
    const lastFetched = state.zomato.lastFetched[city];
    if (!lastFetched) return true;

    const now = new Date().getTime();
    const fetchTime = new Date(lastFetched).getTime();
    return (now - fetchTime) > state.zomato.refreshInterval;
};

// Export reducer
export default zomatoSlice.reducer;