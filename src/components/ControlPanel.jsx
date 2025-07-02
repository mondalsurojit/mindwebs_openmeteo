import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Play, Pause, RotateCcw, SkipBack, SkipForward, Eye, EyeOff, ChevronLeft, RadioTower, Grid3x3, MapPin, Zap, Activity, Map, Table2, Wind } from 'lucide-react';
import ZWSControls from './ZWSControls';

import {
    setSelectedVariable, setCurrentTimeIndex, setAnimationSpeed, advanceTime, selectSelectedVariable,
    selectCurrentTimeIndex, selectCurrentTimestamp, selectAnimationSpeed, selectWeatherVariables,
    selectCurrentStats, selectTimeIndices, selectTimeRangeInfo, selectBatchInfo,
    selectFetchingBatches, clearWeatherData, loadCachedBatch, addFetchingBatch, removeFetchingBatch
} from '../redux/slices/weatherSlice';

import {
    setIsPlaying, setOpacity, setShowWindAnimation, selectIsPlaying, selectOpacity,
    selectShowWindAnimation, setShowStations, setShowGrid, setControlPanelExpanded, selectIsControlPanelExpanded,
    setShowDataTable, selectShowDataTable, selectShowGrid, selectShowStations
} from '../redux/slices/uiSlice';

import {
    setSelectedCities, setShowZWS, selectSelectedCities, selectShowZWS, selectAvailableCities,
    clearWeatherData as clearZomatoWeatherData
} from '../redux/slices/zomatoSlice';

const ControlPanel = ({ viewMode, handleViewModeChange }) => {
    const dispatch = useDispatch();

    // Weather state from Redux
    const selectedVariable = useSelector(selectSelectedVariable);
    const currentTimeIndex = useSelector(selectCurrentTimeIndex);
    const currentTimestamp = useSelector(selectCurrentTimestamp);
    const animationSpeed = useSelector(selectAnimationSpeed);
    const weatherVariables = useSelector(selectWeatherVariables);
    // const currentStats = useSelector(selectCurrentStats);
    const timeIndices = useSelector(selectTimeIndices);
    const timeRangeInfo = useSelector(selectTimeRangeInfo);
    const batchInfo = useSelector(selectBatchInfo);
    // const fetchingBatches = useSelector(selectFetchingBatches);

    // UI state from Redux
    const isPlaying = useSelector(selectIsPlaying);
    const opacity = useSelector(selectOpacity);
    const showWindAnimation = useSelector(selectShowWindAnimation);
    const isControlPanelExpanded = useSelector(selectIsControlPanelExpanded);
    // const showDataTable = useSelector(selectShowDataTable);
    const showGrid = useSelector(selectShowGrid);
    const showStations = useSelector(selectShowStations);

    // const selectedCity = useSelector(selectSelectedCities);
    // const showZWS = useSelector(selectShowZWS);
    // const availableCities = useSelector(selectAvailableCities);

    // Mode state - default to IIT-H Forecast
    const [selectedMode, setSelectedMode] = React.useState('iith');
    const [previousIITHSettings, setPreviousIITHSettings] = React.useState({
        showGrid: false,
        showWindAnimation: false,
        showStations: false
    });

    // Get min and max available time indices
    const [minTimeIndex, maxTimeIndex] = timeIndices.length > 0
        ? [Math.min(...timeIndices), Math.max(...timeIndices)]: [0, 0];

    // Get total possible time indices from metadata
    const totalTimeIndices = timeRangeInfo ? timeRangeInfo.totalTimestamps - 1 : maxTimeIndex;

    // Calculate loaded percentage for slider
    const loadedPercentage = timeRangeInfo && batchInfo
        ? (batchInfo.loadedBatches.length / batchInfo.totalBatches) * 100
        : 0;

    // Simple max available calculation - just use what's currently loaded
    const maxAvailableTimeIndex = timeIndices.length > 0 ? Math.max(...timeIndices) : 0;

    // Convert animation speed (interval) to speed multiplier for display and control
    const speedMultiplier = 1000 / animationSpeed; // Convert interval to multiplier

    // Consolidated animation timer with proper cleanup
    const animationTimer = React.useRef(null);

    const startAnimation = React.useCallback(() => {
        // Always clear existing timer first
        if (animationTimer.current) {
            clearInterval(animationTimer.current);
            animationTimer.current = null;
        }

        // Start new timer with current speed
        animationTimer.current = setInterval(() => {
            dispatch(advanceTime());
        }, animationSpeed);
    }, [animationSpeed, dispatch]);

    const stopAnimation = React.useCallback(() => {
        if (animationTimer.current) {
            clearInterval(animationTimer.current);
            animationTimer.current = null;
        }
    }, []);

    // Single useEffect to control animation - handles both play state and speed changes
    React.useEffect(() => {
        if (isPlaying && selectedMode === 'iith') {
            startAnimation();
        } else {
            stopAnimation();
        }

        // Cleanup on unmount or when dependencies change
        return stopAnimation;
    }, [isPlaying, selectedMode, animationSpeed, startAnimation, stopAnimation]);

    const handleCityChange = (city) => {
        dispatch(setSelectedCities(city));
        dispatch(clearZomatoWeatherData());
    };

    const handlePlayPause = () => dispatch(setIsPlaying(!isPlaying));

    const handleReset = () => {
        dispatch(setIsPlaying(false));
        dispatch(setCurrentTimeIndex(0)); // Reset to first time index
    };

    const handleVariableChange = (value) => dispatch(setSelectedVariable(value));

    // FIXED: Simple time index change - no complex validation
    const handleTimeIndexChange = (value) => {
        const newTimeIndex = parseInt(value);
        dispatch(setCurrentTimeIndex(newTimeIndex));
    };

    const handleOpacityChange = (value) => {
        // Bulletproof opacity handling
        let newOpacity = parseFloat(value);

        // Validate and sanitize the opacity value
        if (isNaN(newOpacity) || newOpacity < 0) {
            newOpacity = 0.1; // Minimum useful opacity
        } else if (newOpacity > 1) {
            newOpacity = 1; // Maximum opacity
        } else if (newOpacity < 0.05 && newOpacity > 0) {
            newOpacity = 0.05; // Prevent near-invisible values
        }

        // Round to avoid floating point precision issues
        newOpacity = Math.round(newOpacity * 100) / 100;

        dispatch(setOpacity(newOpacity));
    };

    // FIXED: Handle speed multiplier change and convert to interval
    const handleSpeedMultiplierChange = (value) => {
        const newSpeedMultiplier = parseFloat(value);
        const newAnimationSpeed = Math.round(1000 / newSpeedMultiplier); // Convert multiplier to interval
        dispatch(setAnimationSpeed(newAnimationSpeed));
    };

    const handleWindAnimationToggle = (checked) => dispatch(setShowWindAnimation(checked));

    const handleModeChange = (mode) => {
        setSelectedMode(mode);

        // Handle mode-specific logic
        if (mode === 'iith') {
            dispatch(setShowZWS(false));
            dispatch(setShowGrid(previousIITHSettings.showGrid));
            dispatch(setShowWindAnimation(previousIITHSettings.showWindAnimation));
            dispatch(setShowStations(previousIITHSettings.showStations));
        } else if (mode === 'realtime') {
            // Only save IITH settings if currently in IITH mode
            if (selectedMode === 'iith') {
                setPreviousIITHSettings({
                    showGrid: showGrid,
                    showWindAnimation: showWindAnimation,
                    showStations: showStations
                });
            }
            dispatch(setShowZWS(true));
            handleViewModeChange('map');
            dispatch(setShowGrid(false));
            dispatch(setShowWindAnimation(false));
            dispatch(setShowStations(false));
            // Don't clear weather data - preserve for when switching back to IITH
        } else if (mode === 'other') {
            // Only save IITH settings if currently in IITH mode
            if (selectedMode === 'iith') {
                setPreviousIITHSettings({
                    showGrid: showGrid,
                    showWindAnimation: showWindAnimation,
                    showStations: showStations
                });
            }
            dispatch(setShowZWS(false));
            handleViewModeChange('map');
            dispatch(setShowGrid(false));
            dispatch(setShowWindAnimation(false));
            dispatch(setShowStations(false));
            // Don't clear weather data - preserve for when switching back to IITH
        }
    };

    // Format timestamp for display
    const formatTimestampDisplay = (timestamp) => {
        if (!timestamp) return '';
        return timestamp.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    };

    // Calculate current progress percentage
    const currentProgress = totalTimeIndices > 0 ? (currentTimeIndex / totalTimeIndices) * 100 : 0;

    return (
        <div className={`absolute top-0 left-0 bg-white shadow-lg p-3 sm:p-4 z-40 
            w-full sm:min-w-96 sm:w-1/3 lg:w-1/4 xl:w-1/5 h-full 
            transition-all duration-300 flex flex-col ease-in-out 
            ${isControlPanelExpanded ? '' : '-translate-x-full'}`}>

            {/* Desktop Toggle Button - positioned outside panel */}
            <button aria-label="Toggle Control Panel"
                onClick={() => dispatch(setControlPanelExpanded(!isControlPanelExpanded))}
                className="hidden sm:block absolute h-10 w-8 grid place-items-center top-1/2 right-0 translate-x-full -translate-y-1/2 z-40 bg-white shadow-md rounded-r-3xl outline-0 hover:bg-gray-100 transition-all cursor-pointer">
                <ChevronLeft
                    className={`w-5 h-5 mr-2 text-gray-600 transition-transform duration-200 ${isControlPanelExpanded ? '' : 'rotate-180'}`} />
            </button>

            {/* Mobile Toggle Button - positioned inside panel when expanded */}
            <button
                aria-label="Toggle Control Panel"
                onClick={() => dispatch(setControlPanelExpanded(!isControlPanelExpanded))}
                className={`sm:hidden absolute h-8 w-8 grid place-items-center z-40 bg-white shadow-md outline-0 hover:bg-gray-100 transition-all cursor-pointer
                    ${isControlPanelExpanded
                        ? 'top-1/2 right-0 -translate-y-1/2 rounded-l-3xl'
                        : 'top-1/2 right-0 translate-x-full -translate-y-1/2 rounded-r-3xl w-6'
                    }`}>
                <ChevronLeft
                    className={`w-4 h-4 text-gray-600 transition-transform duration-200 ${isControlPanelExpanded ? '' : 'rotate-180'}`} />
            </button>

            {/* Mode Selection */}
            <div className="mb-3 sm:mb-4 mt-8 sm:mt-0">
                <div className="space-y-2">
                    <button
                        onClick={() => handleModeChange('iith')}
                        className={`w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-lg border-2 cursor-pointer transition-all ${selectedMode === 'iith'
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 hover:border-gray-300 text-gray-700'
                            }`}>
                        <MapPin className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                        <div className="text-left">
                            <div className="font-medium text-sm sm:text-base">IIT-H Forecast</div>
                            <div className="text-xs opacity-75">High-resolution weather data</div>
                        </div>
                    </button>

                    <div className="flex gap-2">
                        <button onClick={() => handleModeChange('other')}
                            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border-2 cursor-pointer transition-all ${selectedMode === 'other'
                                ? 'border-green-500 bg-green-50 text-green-700'
                                : 'border-gray-200 hover:border-gray-300 text-gray-700'
                                }`}>
                            <Activity className="w-4 h-5 flex-shrink-0" />
                            <div className="text-left">
                                <div className="font-medium text-xs sm:text-sm">Other Forecasts</div>
                                <div className="text-xs opacity-75 hidden sm:block">Pangu, GraphCast, etc.</div>
                            </div>
                        </button>

                        <button onClick={() => handleModeChange('realtime')}
                            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border-2 cursor-pointer transition-all ${selectedMode === 'realtime'
                                ? 'border-orange-500 bg-orange-50 text-orange-700'
                                : 'border-gray-200 hover:border-gray-300 text-gray-700'
                                }`}>
                            <Zap className="w-4 h-5 flex-shrink-0" />
                            <div className="text-left">
                                <div className="font-medium text-xs sm:text-sm">Real-Time</div>
                                <div className="text-xs opacity-75 hidden sm:block">Zomato Weather</div>
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
                {/* IIT-H Forecast Controls */}
                {selectedMode === 'iith' && (
                    <>
                        {/* View Mode Toggle */}
                        <div className="mb-3 sm:mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">View Mode</label>
                            <div className="p-1 bg-gray-100 rounded-lg">
                                <div className="relative inline-flex bg-gray-100 rounded-lg w-full">
                                    <div className={`absolute top-0 bottom-0 w-1/2 bg-white rounded-md shadow-sm transition-transform duration-200 ease-in-out ${viewMode === 'table' ? 'translate-x-full' : 'translate-x-0'}`} />

                                    <button
                                        onClick={() => handleViewModeChange('map')}
                                        className={`relative flex items-center justify-center gap-2 w-1/2 px-2 py-2 sm:py-2.5 rounded-md cursor-pointer transition-colors duration-200 z-10 ${viewMode === 'map'
                                            ? 'text-blue-600 font-medium'
                                            : 'text-gray-600 hover:text-gray-800'
                                            }`}>
                                        <Map className="w-3 h-3 sm:w-4 sm:h-4" />
                                        <span className="text-xs sm:text-sm">Map</span>
                                    </button>

                                    <button
                                        onClick={() => handleViewModeChange('table')}
                                        className={`relative flex items-center justify-center gap-2 w-1/2 px-2 py-2 sm:py-2.5 rounded-md cursor-pointer transition-colors duration-200 z-10 ${viewMode === 'table'
                                            ? 'text-blue-600 font-medium'
                                            : 'text-gray-600 hover:text-gray-800'
                                            }`}>
                                        <Table2 className="w-3 h-3 sm:w-4 sm:h-4" />
                                        <span className="text-xs sm:text-sm">Table</span>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Variable Selection */}
                        <div className="mb-3 sm:mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Weather Variable</label>
                            <select
                                value={selectedVariable}
                                onChange={(e) => handleVariableChange(e.target.value)}
                                className="w-full py-2 sm:py-2.5 px-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer text-sm">
                                {Object.entries(weatherVariables).map(([key, info]) => (
                                    <option key={key} value={key}>
                                        {info.name} ({info.unit})
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Layout Controls - Responsive Grid */}
                        <div className="mb-3 sm:mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Layout</label>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full">
                                <button
                                    onClick={() => dispatch(setShowGrid(!showGrid))}
                                    className={`flex items-center gap-2 px-3 py-2 sm:py-2.5 border rounded-md cursor-pointer 
                                    ${showGrid ? 'bg-white border-gray-300' : 'bg-gray-100 border-gray-200'}
                                    hover:border-blue-500 focus:outline-none focus:ring-0`}>
                                    {showGrid ? (
                                        <Eye className="w-3 h-3 sm:w-4 sm:h-4 text-green-600" />
                                    ) : (
                                        <EyeOff className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
                                    )}
                                    <Grid3x3 className="w-3 h-3 sm:w-4 sm:h-4 text-blue-500" />
                                    <span className="text-xs sm:text-sm font-medium text-gray-700">Grid</span>
                                </button>

                                <button
                                    onClick={() => dispatch(setShowStations(!showStations))}
                                    className={`flex items-center gap-2 px-3 py-2 sm:py-2.5 border rounded-md cursor-pointer 
                                    ${showStations ? 'bg-white border-gray-300' : 'bg-gray-100 border-gray-200'}
                                    hover:border-blue-500 focus:outline-none focus:ring-0`}>
                                    {showStations ? (
                                        <Eye className="w-3 h-3 sm:w-4 sm:h-4 text-green-600" />
                                    ) : (
                                        <EyeOff className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
                                    )}
                                    <RadioTower className="w-3 h-3 sm:w-4 sm:h-4 text-blue-500" />
                                    <span className="text-xs sm:text-sm font-medium text-gray-700">AWS</span>
                                </button>

                                <button
                                    onClick={() => handleWindAnimationToggle(!showWindAnimation)}
                                    className={`flex items-center gap-2 px-3 py-2 sm:py-2.5 border rounded-md cursor-pointer 
                                    ${showWindAnimation ? 'bg-white border-gray-300' : 'bg-gray-100 border-gray-200'}
                                    hover:border-blue-500 focus:outline-none focus:ring-0`}>
                                    {showWindAnimation ? (
                                        <Eye className="w-3 h-3 sm:w-4 sm:h-4 text-green-600" />
                                    ) : (
                                        <EyeOff className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400" />
                                    )}
                                    <Wind className="w-3 h-3 sm:w-4 sm:h-4 text-blue-500" />
                                    <span className="text-xs sm:text-sm font-medium text-gray-700">Wind</span>
                                </button>
                            </div>
                        </div>

                        {/* Control Sliders */}
                        <div className="mb-3 sm:mb-4 space-y-3 sm:space-y-4">
                            {/* Opacity Slider - Bulletproof */}
                            <div className="flex items-center gap-3">
                                <span className="text-xs sm:text-sm font-medium text-gray-700 whitespace-nowrap min-w-16 sm:min-w-20">
                                    Opacity: {Math.round(opacity * 100)}%
                                </span>
                                <input
                                    type="range"
                                    min="0.05" max="1"
                                    step="0.05" value={Math.max(0.05, Math.min(1, opacity))}
                                    onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
                                    className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gray-200 accent-blue-500" />
                            </div>

                            {/* FIXED: Animation Speed Slider - now uses speed multiplier */}
                            <div className="flex items-center gap-3">
                                <span className="text-xs sm:text-sm font-medium text-gray-700 whitespace-nowrap min-w-16 sm:min-w-20">
                                    Speed: {speedMultiplier.toFixed(1)}x
                                </span>
                                <input
                                    type="range"
                                    min="0.5" max="5"
                                    step="0.1" value={speedMultiplier}
                                    onChange={(e) => handleSpeedMultiplierChange(parseFloat(e.target.value))}
                                    className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gray-200 accent-blue-500" />
                            </div>
                        </div>

                        {/* Time Controls with integrated timestamp info */}
                        {batchInfo && (
                            <div className="pt-3 sm:pt-4">

                                <div className="flex flex-row items-start sm:items-center gap-3 mb-3 sm:mb-4">
                                    {/* Control Buttons */}
                                    <div className="flex items-center gap-2">
                                        {/* Back Button */}
                                        <button
                                            onClick={() => handleTimeIndexChange(Math.max(0, currentTimeIndex - 1))}
                                            disabled={currentTimeIndex === 0}
                                            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer shadow-sm">
                                            <SkipBack className="w-3 h-3 sm:w-4 sm:h-4" />
                                        </button>

                                        {/* Play/Pause Button */}
                                        <button
                                            onClick={handlePlayPause}
                                            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer shadow-sm">
                                            {isPlaying ? <Pause className="w-3 h-3 sm:w-4 sm:h-4" /> : <Play className="w-3 h-3 sm:w-4 sm:h-4" />}
                                        </button>

                                        {/* Forward Button */}
                                        <button
                                            onClick={() => handleTimeIndexChange(currentTimeIndex + 1)}
                                            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer shadow-sm">
                                            <SkipForward className="w-3 h-3 sm:w-4 sm:h-4" />
                                        </button>

                                        {/* Reset Button */}
                                        <button
                                            onClick={handleReset}
                                            disabled={currentTimeIndex === 0}
                                            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer shadow-sm">
                                            <RotateCcw className="w-3 h-3 sm:w-4 sm:h-4" />
                                        </button>
                                    </div>

                                    {/* Timestamp Display */}
                                    <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                                        <div className="text-sm font-semibold text-blue-700">
                                            {currentTimestamp ? formatTimestampDisplay(currentTimestamp) : 'Loading...'}
                                        </div>
                                        <div className="text-xs text-blue-500">
                                            {currentTimeIndex + 1} / {timeRangeInfo?.totalTimestamps || 0}
                                        </div>
                                    </div>
                                </div>


                                {/* FIXED: Simple slider - works during loading */}
                                <div className="w-full mb-4 sm:mb-6">
                                    <style jsx>{`
                                        .smart-slider::-webkit-slider-thumb {
                                            appearance: none;
                                            width: 18px;
                                            height: 18px;
                                            border-radius: 50%;
                                            background: #3b82f6;
                                            cursor: pointer;
                                        }
                                        @media (min-width: 640px) {
                                            .smart-slider::-webkit-slider-thumb {
                                                width: 20px;
                                                height: 20px;
                                            }
                                        }
                                        .smart-slider::-moz-range-thumb {
                                            width: 18px;
                                            height: 18px;
                                            border-radius: 50%;
                                            background: #3b82f6;
                                            cursor: pointer;
                                            border: none;
                                        }
                                        @media (min-width: 640px) {
                                            .smart-slider::-moz-range-thumb {
                                                width: 20px;
                                                height: 20px;
                                            }
                                        }
                                    `}</style>
                                    <div className="relative">
                                        <input
                                            type="range"
                                            min={0}
                                            max={totalTimeIndices}
                                            value={currentTimeIndex}
                                            onChange={(e) => {
                                                const newValue = parseInt(e.target.value);
                                                if (newValue <= maxAvailableTimeIndex) handleTimeIndexChange(newValue);
                                            }}
                                            onMouseMove={(e) => {
                                                const rect = e.target.getBoundingClientRect();
                                                const percentage = (e.clientX - rect.left) / rect.width * 100;
                                                e.target.style.cursor = percentage > loadedPercentage ? 'not-allowed' : 'pointer';
                                            }}
                                            className="smart-slider w-full h-2 rounded-lg appearance-none cursor-pointer"
                                            style={{
                                                background: `linear-gradient(to right, 
                                                    #dee2e6 0%, 
                                                    #dee2e6 ${loadedPercentage}%, 
                                                    #ffffff ${loadedPercentage}%, 
                                                    #ffffff 100%)`,
                                                border: '1px solid #d1d5db'
                                            }}
                                        />
                                    </div>

                                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                                        <span className="hidden sm:inline">
                                            {timeRangeInfo ? formatTimestampDisplay(timeRangeInfo.startDate) : 'Start'}
                                        </span>
                                        <span className="sm:hidden text-xs">
                                            Start
                                        </span>
                                        <span className="text-blue-600 font-medium text-xs">
                                            {timeIndices.length}/{timeRangeInfo?.totalTimestamps || 0} loaded
                                        </span>
                                        <span className="hidden sm:inline">
                                            {timeRangeInfo ? formatTimestampDisplay(timeRangeInfo.endDate) : 'End'}
                                        </span>
                                        <span className="sm:hidden text-xs">
                                            End
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* Other Forecasts Placeholder */}
                {selectedMode === 'other' && (
                    <div className="mb-3 sm:mb-4 p-3 sm:p-4 bg-gray-50 rounded-lg">
                        <h3 className="font-medium text-gray-700 mb-2 text-sm sm:text-base">Other Forecast Models</h3>
                        <div className="space-y-2 text-xs sm:text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                                <span>Pangu-Weather (Coming Soon)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                                <span>GraphCast (Coming Soon)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-purple-500 rounded-full flex-shrink-0"></div>
                                <span>Other Models (Coming Soon)</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Real-Time Weather Controls */}
                {selectedMode === 'realtime' && <ZWSControls />}
            </div>
        </div>
    );
};

export default ControlPanel;