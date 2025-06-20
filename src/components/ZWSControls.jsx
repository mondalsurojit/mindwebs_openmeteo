import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Eye, EyeOff, RadioTower, X, Info, Search, ChevronUp, ChevronDown, Plus } from 'lucide-react';

import {
    setSelectedCities, addSelectedCity, removeSelectedCity, toggleCityVisibility, setHiddenCities,
    setShowZWS, selectSelectedCities, selectHiddenCities, selectShowZWS,
    selectAvailableCities, fetchCityWeatherData, selectCityLoading, selectZomatoError,
    clearWeatherData, selectLastFetched, selectNeedsRefresh
} from '../redux/slices/zomatoSlice';

const ZWSControls = () => {
    const dispatch = useDispatch();

    // Redux selectors
    const selectedCities = useSelector(selectSelectedCities);
    const hiddenCities = useSelector(selectHiddenCities);
    const showZWS = useSelector(selectShowZWS);
    const availableCities = useSelector(selectAvailableCities);
    const cityLoading = useSelector(selectCityLoading);
    const error = useSelector(selectZomatoError);
    const lastFetched = useSelector(selectLastFetched);

    // Local state for UI only
    const [loadingCities, setLoadingCities] = useState(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [showInfo, setShowInfo] = useState(false);
    const dropdownRef = useRef(null);
    const searchInputRef = useRef(null);
    const refreshIntervalRef = useRef(null);

    // Debug logging to track state changes
    console.log('ZWSControls Render State:', {
        selectedCities,
        hiddenCities,
        loadingCities: Array.from(loadingCities),
        showZWS,
        availableCities: availableCities.length,
        timestamp: new Date().toLocaleTimeString()
    });

    // Filter cities based on search term
    const filteredCities = availableCities.filter(city =>
        city.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !selectedCities.includes(city)
    );

    // AUTO-REFRESH LOGIC - 15 MINUTES INTERVAL
    useEffect(() => {
        if (showZWS && selectedCities.length > 0) {
            // Clear existing interval
            if (refreshIntervalRef.current) {
                clearInterval(refreshIntervalRef.current);
            }

            // Set up auto-refresh for all selected cities
            refreshIntervalRef.current = setInterval(async () => {
                console.log('Auto-refreshing weather data for cities:', selectedCities);
                
                for (const city of selectedCities) {
                    try {
                        await dispatch(fetchCityWeatherData(city)).unwrap();
                        console.log(`Auto-refreshed data for ${city}`);
                    } catch (error) {
                        console.error(`Error auto-refreshing ${city}:`, error);
                    }
                }
            }, 15 * 60 * 1000); // 15 minutes

            // Cleanup function
            return () => {
                if (refreshIntervalRef.current) {
                    clearInterval(refreshIntervalRef.current);
                    refreshIntervalRef.current = null;
                }
            };
        }
    }, [showZWS, selectedCities, dispatch]);

    // INITIAL HYDERABAD FETCH ONLY WHEN ZWS IS ENABLED
    useEffect(() => {
        if (showZWS && selectedCities.includes('Hyderabad')) {
            // Only fetch if we don't have recent data
            const needsRefresh = selectNeedsRefresh('Hyderabad')({ zomato: { lastFetched } });
            if (needsRefresh) {
                console.log('Fetching initial data for Hyderabad');
                dispatch(fetchCityWeatherData('Hyderabad'));
            }
        }
    }, [showZWS, dispatch, lastFetched]);

    // SIMPLIFIED: Handle city selection
    const handleCitySelect = useCallback(async (city) => {
        console.log(`ATTEMPTING TO ADD CITY: ${city}`);
        console.log('Current selectedCities before add:', selectedCities);
        
        // Close dropdown immediately
        setIsDropdownOpen(false);
        setSearchTerm('');
        searchInputRef.current?.blur();

        // Add city to Redux state
        dispatch(addSelectedCity(city));
        
        // Add to loading state
        setLoadingCities(prev => new Set([...prev, city]));

        try {
            // Fetch weather data for the city
            await dispatch(fetchCityWeatherData(city)).unwrap();
            console.log(`Successfully fetched data for ${city}`);
        } catch (error) {
            console.error(`Error fetching data for ${city}:`, error);
        } finally {
            // Remove from loading state
            setLoadingCities(prev => {
                const newSet = new Set(prev);
                newSet.delete(city);
                return newSet;
            });
        }
    }, [selectedCities, dispatch]);

    // Remove city
    const removeCity = useCallback((cityToRemove) => {
        if (cityToRemove === 'Hyderabad') {
            console.log('Cannot remove Hyderabad - it is the default city');
            return;
        }

        console.log(`Removing city: ${cityToRemove}`);
        setLoadingCities(prev => {
            const newSet = new Set(prev);
            newSet.delete(cityToRemove);
            return newSet;
        });

        dispatch(removeSelectedCity(cityToRemove));
    }, [dispatch]);

    // Toggle city visibility
    const toggleCityVisibilityHandler = useCallback((city) => {
        console.log(`Toggling visibility for city: ${city}`);
        dispatch(toggleCityVisibility(city));
    }, [dispatch]);

    // SIMPLIFIED: Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
                setSearchTerm('');
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Focus search input when dropdown opens
    useEffect(() => {
        if (isDropdownOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isDropdownOpen]);

    // Handle search input key press
    const handleKeyPress = useCallback((e) => {
        if (e.key === 'Enter' && filteredCities.length > 0) {
            handleCitySelect(filteredCities[0]);
        }
        if (e.key === 'Escape') {
            setIsDropdownOpen(false);
            setSearchTerm('');
        }
    }, [filteredCities, handleCitySelect]);

    // Get city status for display
    const getCityStatus = useCallback((city) => {
        if (loadingCities.has(city)) return 'loading';
        if (hiddenCities.includes(city)) return 'hidden';
        return 'visible';
    }, [loadingCities, hiddenCities]);

    // Handle ZWS toggle
    const handleZWSToggle = useCallback(() => {
        const newShowState = !showZWS;
        console.log(`Toggling ZWS: ${showZWS} -> ${newShowState}`);
        
        dispatch(setShowZWS(newShowState));
        
        if (!newShowState) {
            dispatch(setHiddenCities([...selectedCities]));
        } else {
            dispatch(setHiddenCities([]));
        }
    }, [showZWS, selectedCities, dispatch]);

    // Cleanup interval on unmount
    useEffect(() => {
        return () => {
            if (refreshIntervalRef.current) {
                clearInterval(refreshIntervalRef.current);
            }
        };
    }, []);

    return (
        <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">Updated Every 15 Mins</label>
                <button onClick={() => setShowInfo(!showInfo)}
                    className="text-gray-400 cursor-pointer outline-none hover:text-gray-600 transition-colors"
                    title="About Weather Union">
                    <Info className="w-4 h-4" />
                </button>
            </div>

            {/* Weather Union Info */}
            {showInfo && (
                <div className="mb-4 p-3 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-lg">
                    <div className="flex items-start gap-2">
                        <div className="bg-orange-500 p-1.5 rounded-full flex-shrink-0 mt-0.5">
                            <RadioTower className="w-3 h-3 text-white" />
                        </div>
                        <div className="text-xs text-gray-700 leading-relaxed">
                            <p className="font-medium text-orange-800 mb-1">Zomato Weather Union</p>
                            <p className="mb-1">
                                India's first crowd-supported weather infrastructure with 650+ on-ground weather stations across 45 cities,
                                providing hyperlocal real-time weather data including temperature, humidity, wind speed, and rainfall.</p>
                            <p className="text-orange-700 font-medium">
                                Hyderabad: 45+ weather stations | India: 650+ stations
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className="space-y-3">
                <div className="flex gap-2 items-center">
                    <button onClick={handleZWSToggle}
                        className={`flex items-center gap-2 px-3 py-2.5 border rounded-md cursor-pointer transition-all duration-300 ${showZWS
                            ? 'bg-orange-50 border-orange-300 shadow-sm  text-orange-800'
                            : 'bg-gray-100 border-gray-200  text-gray-500'
                            } hover:border-orange-500 outline-none`}>

                        <div className="relative">
                            {showZWS && (
                                <span className="absolute inset-0 flex items-center justify-center">
                                    <span className="animate-ping absolute inline-flex h-4 w-4 rounded-full bg-orange-400 opacity-60 delay-800 duration-2000"></span>
                                </span>
                            )}
                            <div className={`p-1 rounded-full transition-all duration-300 ${showZWS ? 'bg-orange-500' : 'bg-gray-400'}`}>
                                <RadioTower className="w-3 h-3 text-white" />
                            </div>
                        </div>

                        <span className="text-sm font-medium">ZWS</span>

                        {showZWS ? (
                            <Eye className="w-4 h-4" />) : (<EyeOff className="w-4 h-4" />
                        )}
                    </button>

                    {/* FIXED: City Search Input with simplified event handling */}
                    <div className="relative flex-1" ref={dropdownRef}>
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onFocus={() => setIsDropdownOpen(true)}
                                onKeyDown={handleKeyPress}
                                placeholder="Add cities..."
                                disabled={selectedCities.length >= 5}
                                className="w-full pl-8 pr-3 py-2 text-sm border-2 border-gray-200 rounded focus:border-orange-500 outline-none disabled:bg-gray-100 disabled:cursor-not-allowed" />
                        </div>

                        {/* FIXED: Simplified dropdown with mouseDown instead of onClick */}
                        {isDropdownOpen && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-10 max-h-36 overflow-hidden">
                                <div className="max-h-40 overflow-y-auto">
                                    {filteredCities.length > 0 ? (
                                        filteredCities.map((city) => (
                                            <button 
                                                key={city}
                                                onMouseDown={(e) => {
                                                    e.preventDefault(); // Prevent input blur
                                                    handleCitySelect(city);
                                                }}
                                                className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 cursor-pointer focus:bg-orange-50 focus:outline-none transition-colors flex items-center gap-2">
                                                <Plus className="w-3 h-3 text-gray-400" />
                                                {city}
                                            </button>
                                        ))
                                    ) : (
                                        <div className="px-3 py-2 text-sm text-gray-500">
                                            {searchTerm ? 'No cities found' : selectedCities.length >= 5 ? 'Maximum cities selected' : 'All cities selected'}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Selected Cities Tags */}
                {selectedCities.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {selectedCities.map((city) => {
                            const status = getCityStatus(city);
                            const isDefault = city === 'Hyderabad';

                            return (
                                <div key={`city-tag-${city}`}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border transition-all duration-200 ${status === 'hidden'
                                        ? 'bg-gray-100 border-gray-300 text-gray-500'
                                        : status === 'loading'
                                            ? 'bg-blue-50 border-blue-300 text-blue-800'
                                            : 'bg-orange-50 border-orange-300 text-orange-800'
                                        }`}>

                                    {/* City name with loading indicator */}
                                    <div className="flex items-center gap-1">
                                        <span className="font-medium">{city}</span>
                                        {status === 'loading' && (
                                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={() => toggleCityVisibilityHandler(city)}
                                            className="hover:bg-white rounded p-0.5 cursor-pointer transition-colors"
                                            title={status === 'hidden' ? 'Show stations' : 'Hide stations'}>
                                            {status === 'hidden' ? (
                                                <EyeOff className="w-3 h-3" />) : (<Eye className="w-3 h-3" />
                                            )}
                                        </button>
                                        {!isDefault && (
                                            <button
                                                onClick={() => removeCity(city)}
                                                className="hover:bg-white rounded p-0.5 cursor-pointer transition-colors"
                                                title="Remove city">
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Status Messages */}
                <div className="space-y-1">
                    {selectedCities.length >= 5 && (
                        <div className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-md border border-gray-200">
                            Maximum 5 cities can be selected
                        </div>
                    )}

                    {error && (
                        <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-md border border-red-200">
                            Error: {error}
                        </div>
                    )}

                    {/* {showZWS && selectedCities.length > 0 && (
                        <div className="text-xs text-green-600 bg-green-50 px-3 py-2 rounded-md border border-green-200">
                            Auto-refresh enabled (every 15 minutes)
                        </div>
                    )} */}
                </div>
            </div>
        </div>
    );
};

export default ZWSControls;