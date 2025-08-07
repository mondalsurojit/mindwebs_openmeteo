import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Play, Pause, RotateCcw, SkipBack, SkipForward, Eye, EyeOff, ChevronLeft, ChevronRight, RadioTower, Grid3x3, MapPin, Zap, Activity, Map, Table2, Wind, Edit3, Eraser, Download, Edit, X, Check } from 'lucide-react';
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
    setShowDataTable, selectShowDataTable, selectShowGrid, selectShowStations, setSelectedDataSource, selectSelectedDataSource
} from '../redux/slices/uiSlice';

import {
    setSelectedCities, setShowZWS, selectSelectedCities, selectShowZWS, selectAvailableCities,
    clearWeatherData as clearZomatoWeatherData
} from '../redux/slices/zomatoSlice';

import {
    setDrawingMode, setPolygonPoints, clearPolygonData, selectDrawingMode, 
    selectPolygonPoints, selectPolygonArea, selectOpenMeteoData, selectOpenMeteoLoading,
    selectOpenMeteoCurrentTimeIndex, setOpenMeteoCurrentTimeIndex, selectOpenMeteoTimeIndices,
    advanceOpenMeteoTime, setOpenMeteoAnimationSpeed, selectOpenMeteoAnimationSpeed,
    triggerDataFetch, removePolygonPoint, editPolygonPoint, setOpenMeteoIsPlaying, 
    selectOpenMeteoIsPlaying, selectHasValidData as selectOpenMeteoHasValidData,
    setOpenMeteoOpacity, selectOpenMeteoOpacity
} from '../redux/slices/openMeteoSlice';

const ControlPanel = ({ viewMode, handleViewModeChange }) => {
    const dispatch = useDispatch();

    // Weather state from Redux
    const selectedVariable = useSelector(selectSelectedVariable);
    const currentTimeIndex = useSelector(selectCurrentTimeIndex);
    const currentTimestamp = useSelector(selectCurrentTimestamp);
    const animationSpeed = useSelector(selectAnimationSpeed);
    const weatherVariables = useSelector(selectWeatherVariables);
    const timeIndices = useSelector(selectTimeIndices);
    const timeRangeInfo = useSelector(selectTimeRangeInfo);
    const batchInfo = useSelector(selectBatchInfo);

    // UI state from Redux
    const isPlaying = useSelector(selectIsPlaying);
    const opacity = useSelector(selectOpacity);
    const showWindAnimation = useSelector(selectShowWindAnimation);
    const isControlPanelExpanded = useSelector(selectIsControlPanelExpanded);
    const showGrid = useSelector(selectShowGrid);
    const showStations = useSelector(selectShowStations);
    const selectedDataSource = useSelector(selectSelectedDataSource); // Get from Redux instead of local state

    // OpenMeteo state from Redux
    const drawingMode = useSelector(selectDrawingMode);
    const polygonPoints = useSelector(selectPolygonPoints);
    const polygonArea = useSelector(selectPolygonArea);
    const openMeteoData = useSelector(selectOpenMeteoData);
    const openMeteoLoading = useSelector(selectOpenMeteoLoading);
    const openMeteoCurrentTimeIndex = useSelector(selectOpenMeteoCurrentTimeIndex);
    const openMeteoTimeIndices = useSelector(selectOpenMeteoTimeIndices);
    const openMeteoAnimationSpeed = useSelector(selectOpenMeteoAnimationSpeed);
    const openMeteoIsPlaying = useSelector(selectOpenMeteoIsPlaying);
    const openMeteoHasValidData = useSelector(selectOpenMeteoHasValidData);
    const openMeteoOpacity = useSelector(selectOpenMeteoOpacity);

    // Mode state - default to IIT-H Forecast
    const [selectedMode, setSelectedMode] = React.useState('iith');
    // Remove local selectedDataSource state - now using Redux
    
    // Store previous WRF settings to restore when switching back
    const [previousWRFSettings, setPreviousWRFSettings] = React.useState({
        showGrid: false,
        showWindAnimation: false,
        showStations: false
    });

    // Data sources for IIT-H Forecast
    const dataSources = [
        { id: 'wrf', name: 'WRF Model', icon: '🌡️' },
        { id: 'openmeteo', name: 'OpenMeteo', icon: '🌐' }
    ];

    // Get current data source info
    const currentDataSource = dataSources.find(ds => ds.id === selectedDataSource) || dataSources[0];

    // Check if polygon is complete (3+ points)
    const isPolygonComplete = polygonPoints.length >= 3;
    const hasPolygonPoints = polygonPoints.length > 0;

    // Get appropriate time indices and current time based on data source
    const getCurrentTimeIndices = () => {
        if (selectedDataSource === 'openmeteo') {
            return openMeteoTimeIndices;
        }
        return timeIndices;
    };

    const getCurrentTimeIndex = () => {
        if (selectedDataSource === 'openmeteo') {
            return openMeteoCurrentTimeIndex;
        }
        return currentTimeIndex;
    };

    const getCurrentAnimationSpeed = () => {
        if (selectedDataSource === 'openmeteo') {
            return openMeteoAnimationSpeed;
        }
        return animationSpeed;
    };

    const getCurrentIsPlaying = () => {
        if (selectedDataSource === 'openmeteo') {
            return openMeteoIsPlaying;
        }
        return isPlaying;
    };

    // Get min and max available time indices
    const currentTimeIndices = getCurrentTimeIndices();
    const [minTimeIndex, maxTimeIndex] = currentTimeIndices.length > 0
        ? [Math.min(...currentTimeIndices), Math.max(...currentTimeIndices)] : [0, 0];

    // Get total possible time indices from metadata
    const totalTimeIndices = selectedDataSource === 'openmeteo' 
        ? (openMeteoData?.hourly?.time?.length || 0) - 1
        : (timeRangeInfo ? timeRangeInfo.totalTimestamps - 1 : maxTimeIndices);

    // Calculate loaded percentage for slider
    const loadedPercentage = selectedDataSource === 'openmeteo'
        ? 100 // OpenMeteo data is loaded all at once
        : (timeRangeInfo && batchInfo ? (batchInfo.loadedBatches.length / batchInfo.totalBatches) * 100 : 0);

    // Simple max available calculation
    const maxAvailableTimeIndex = currentTimeIndices.length > 0 ? Math.max(...currentTimeIndices) : 0;

    // Get current opacity based on data source
    const getCurrentOpacity = () => {
        if (selectedDataSource === 'openmeteo') {
            return openMeteoOpacity;
        }
        return opacity;
    };

    // Convert animation speed (interval) to speed multiplier for display and control
    const speedMultiplier = 1000 / getCurrentAnimationSpeed();

    // Animation timer with proper cleanup
    const animationTimer = React.useRef(null);

    const startAnimation = React.useCallback(() => {
        if (animationTimer.current) {
            clearInterval(animationTimer.current);
            animationTimer.current = null;
        }

        animationTimer.current = setInterval(() => {
            if (selectedDataSource === 'openmeteo') {
                dispatch(advanceOpenMeteoTime());
            } else {
                dispatch(advanceTime());
            }
        }, getCurrentAnimationSpeed());
    }, [getCurrentAnimationSpeed, dispatch, selectedDataSource]);

    const stopAnimation = React.useCallback(() => {
        if (animationTimer.current) {
            clearInterval(animationTimer.current);
            animationTimer.current = null;
        }
    }, []);

    // Animation control effect - Fixed to use proper playing state
    React.useEffect(() => {
        const currentIsPlaying = getCurrentIsPlaying();
        const hasValidData = selectedDataSource === 'openmeteo' 
            ? openMeteoHasValidData 
            : (timeIndices.length > 0);

        if (currentIsPlaying && selectedMode === 'iith' && hasValidData) {
            startAnimation();
        } else {
            stopAnimation();
        }

        return stopAnimation;
    }, [getCurrentIsPlaying, selectedMode, selectedDataSource, openMeteoHasValidData, timeIndices.length, startAnimation, stopAnimation, getCurrentOpacity]); // Added getCurrentOpacity to trigger re-render

    // Handle data source cycling with proper settings preservation
    const handleDataSourceChange = () => {
        const currentIndex = dataSources.findIndex(ds => ds.id === selectedDataSource);
        const nextIndex = (currentIndex + 1) % dataSources.length;
        const nextDataSource = dataSources[nextIndex];
        
        if (selectedDataSource === 'wrf' && nextDataSource.id === 'openmeteo') {
            // Store current WRF settings before switching to OpenMeteo
            setPreviousWRFSettings({
                showGrid: showGrid,
                showWindAnimation: showWindAnimation,
                showStations: showStations
            });
            
            // Set OpenMeteo-appropriate settings
            dispatch(setShowGrid(false));
            dispatch(setShowWindAnimation(false));
            dispatch(setShowStations(false));
        } else if (selectedDataSource === 'openmeteo' && nextDataSource.id === 'wrf') {
            // Restore previous WRF settings when switching back
            dispatch(setShowGrid(previousWRFSettings.showGrid));
            dispatch(setShowWindAnimation(previousWRFSettings.showWindAnimation));
            dispatch(setShowStations(previousWRFSettings.showStations));
        }
        
        // Update data source in Redux
        dispatch(setSelectedDataSource(nextDataSource.id));
        
        // Stop any playing animation when switching
        dispatch(setIsPlaying(false));
        dispatch(setOpenMeteoIsPlaying(false));
    };

    const handleCityChange = (city) => {
        dispatch(setSelectedCities(city));
        dispatch(clearZomatoWeatherData());
    };

    const handlePlayPause = () => {
        if (selectedDataSource === 'openmeteo') {
            dispatch(setOpenMeteoIsPlaying(!openMeteoIsPlaying));
        } else {
            dispatch(setIsPlaying(!isPlaying));
        }
    };

    const handleReset = () => {
        if (selectedDataSource === 'openmeteo') {
            dispatch(setOpenMeteoIsPlaying(false));
            dispatch(setOpenMeteoCurrentTimeIndex(0));
        } else {
            dispatch(setIsPlaying(false));
            dispatch(setCurrentTimeIndex(0));
        }
    };

    const handleVariableChange = (value) => dispatch(setSelectedVariable(value));

    // Handle time index change based on data source
    const handleTimeIndexChange = (value) => {
        const newTimeIndex = parseInt(value);
        if (selectedDataSource === 'openmeteo') {
            dispatch(setOpenMeteoCurrentTimeIndex(newTimeIndex));
        } else {
            dispatch(setCurrentTimeIndex(newTimeIndex));
        }
    };

    const handleOpacityChange = (value) => {
        let newOpacity = parseFloat(value);

        if (isNaN(newOpacity) || newOpacity < 0) {
            newOpacity = 0;
        } else if (newOpacity > 1) {
            newOpacity = 1;
        }

        newOpacity = Math.round(newOpacity * 100) / 100;
        
        // Apply opacity to the appropriate slice based on data source
        if (selectedDataSource === 'openmeteo') {
            dispatch(setOpenMeteoOpacity(newOpacity));
        } else {
            dispatch(setOpacity(newOpacity));
        }
    };

    // Handle speed multiplier change based on data source
    const handleSpeedMultiplierChange = (value) => {
        const newSpeedMultiplier = parseFloat(value);
        const newAnimationSpeed = Math.round(1000 / newSpeedMultiplier);
        
        if (selectedDataSource === 'openmeteo') {
            dispatch(setOpenMeteoAnimationSpeed(newAnimationSpeed));
        } else {
            dispatch(setAnimationSpeed(newAnimationSpeed));
        }
    };

    const handleWindAnimationToggle = (checked) => dispatch(setShowWindAnimation(checked));

    // OpenMeteo specific handlers
    const handleDrawingModeToggle = () => {
        dispatch(setDrawingMode(drawingMode === 'draw' ? 'view' : 'draw'));
    };

    const handleEraserMode = () => {
        dispatch(setDrawingMode('view'));
        dispatch(clearPolygonData());
        // Stop animation when clearing data
        dispatch(setOpenMeteoIsPlaying(false));
    };

    // Handle Done button click - triggers data fetch
    const handleDoneClick = () => {
        if (isPolygonComplete) {
            dispatch(triggerDataFetch());
        }
    };

    // Handle point removal - if all points removed, stop animation
    const handleRemovePolygonPoint = (index) => {
        dispatch(removePolygonPoint(index));
        // Check if this was the last point that would make polygon incomplete
        if (polygonPoints.length <= 3) {
            dispatch(setOpenMeteoIsPlaying(false));
        }
    };

    const handleModeChange = (mode) => {
        setSelectedMode(mode);

        if (mode === 'iith') {
            dispatch(setShowZWS(false));
        } else if (mode === 'realtime') {
            if (selectedMode === 'iith') {
                // Store current settings when leaving IITH mode
                if (selectedDataSource === 'wrf') {
                    setPreviousWRFSettings({
                        showGrid: showGrid,
                        showWindAnimation: showWindAnimation,
                        showStations: showStations
                    });
                }
            }
            dispatch(setShowZWS(true));
            handleViewModeChange('map');
            dispatch(setShowGrid(false));
            dispatch(setShowWindAnimation(false));
            dispatch(setShowStations(false));
        } else if (mode === 'other') {
            if (selectedMode === 'iith') {
                // Store current settings when leaving IITH mode
                if (selectedDataSource === 'wrf') {
                    setPreviousWRFSettings({
                        showGrid: showGrid,
                        showWindAnimation: showWindAnimation,
                        showStations: showStations
                    });
                }
            }
            dispatch(setShowZWS(false));
            handleViewModeChange('map');
            dispatch(setShowGrid(false));
            dispatch(setShowWindAnimation(false));
            dispatch(setShowStations(false));
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

    // Get current timestamp based on data source
    const getCurrentTimestamp = () => {
        if (selectedDataSource === 'openmeteo' && openMeteoData?.hourly?.time) {
            const timeString = openMeteoData.hourly.time[openMeteoCurrentTimeIndex];
            return timeString ? new Date(timeString) : null;
        }
        return currentTimestamp;
    };

    // Calculate current progress percentage
    const currentProgress = totalTimeIndices > 0 ? (getCurrentTimeIndex() / totalTimeIndices) * 100 : 0;

    // Determine if animation controls should be shown
    const shouldShowAnimationControls = selectedDataSource === 'openmeteo' 
        ? openMeteoHasValidData 
        : (batchInfo !== null);

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
                    {/* Enhanced IIT-H Forecast Button with Data Source Selector */}
                    <div className={`relative w-full flex items-center rounded-lg border-2 transition-all ${selectedMode === 'iith'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}>
                        <button
                            onClick={() => handleModeChange('iith')}
                            className={`flex-1 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 cursor-pointer transition-all ${selectedMode === 'iith'
                                ? 'text-blue-700'
                                : 'text-gray-700'
                            }`}>
                            <MapPin className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                            <div className="text-left flex-1">
                                <div className="font-medium text-sm sm:text-base">Forecast</div>
                                <div className="text-xs opacity-75">{currentDataSource.name}</div>
                            </div>
                        </button>
                        
                        {/* Data Source Cycling Button */}
                        <button
                            onClick={handleDataSourceChange}
                            className={`p-2 sm:p-3 border-l transition-all hover:bg-gray-100 ${selectedMode === 'iith'
                                ? 'border-blue-300 text-blue-600 hover:bg-blue-100'
                                : 'border-gray-200 text-gray-500'
                            }`}
                            title={`Switch to ${dataSources[(dataSources.findIndex(ds => ds.id === selectedDataSource) + 1) % dataSources.length].name}`}>
                            <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4" />
                        </button>
                    </div>

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
                        {/* View Mode Toggle - Only show for non-OpenMeteo */}
                        {selectedDataSource !== 'openmeteo' && (
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
                        )}

                        {/* Variable Selection */}
                        <div className="mb-3 sm:mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Weather Variable</label>
                            <select
                                value={selectedVariable}
                                onChange={(e) => handleVariableChange(e.target.value)}
                                className="w-full py-2 sm:py-2.5 px-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer text-sm">
                                {selectedDataSource === 'openmeteo' ? (
                                    <option value="temperature_2m">Temperature (°C)</option>
                                ) : (
                                    Object.entries(weatherVariables).map(([key, info]) => (
                                        <option key={key} value={key}>
                                            {info.name} ({info.unit})
                                        </option>
                                    ))
                                )}
                            </select>
                        </div>

                        {/* Layout Controls - Different for OpenMeteo */}
                        <div className="mb-3 sm:mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                {selectedDataSource === 'openmeteo' ? 'Draw Polygon' : 'Layout'}
                            </label>
                            
                            {selectedDataSource === 'openmeteo' ? (
                                /* OpenMeteo Polygon Controls */
                                <div className="space-y-3">
                                    <div className="grid grid-cols-4 gap-2 w-full">
                                        <button
                                            onClick={handleDrawingModeToggle}
                                            className={`flex items-center gap-2 px-3 py-2 sm:py-2.5 border rounded-md cursor-pointer 
                                            ${drawingMode === 'draw' ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-gray-100 border-gray-200 text-gray-700'}
                                            hover:border-blue-500 focus:outline-none focus:ring-0`}>
                                            <Edit3 className="w-3 h-3 sm:w-4 sm:h-4" />
                                            <span className="text-xs sm:text-sm font-medium">
                                                {drawingMode === 'draw' ? 'Drawing' : 'Draw'}
                                            </span>
                                        </button>

                                        <button
                                            onClick={() => dispatch(setDrawingMode('edit'))}
                                            disabled={!hasPolygonPoints}
                                            className={`flex items-center gap-2 px-3 py-2 sm:py-2.5 border rounded-md cursor-pointer 
                                            ${drawingMode === 'edit' ? 'bg-yellow-50 border-yellow-300 text-yellow-700' : 'bg-gray-100 border-gray-200 text-gray-700'}
                                            ${!hasPolygonPoints ? 'opacity-50 cursor-not-allowed' : 'hover:border-yellow-500'} 
                                            focus:outline-none focus:ring-0`}>
                                            <Edit className="w-3 h-3 sm:w-4 sm:h-4" />
                                            <span className="text-xs sm:text-sm font-medium">Edit</span>
                                        </button>

                                        <button
                                            onClick={handleEraserMode}
                                            disabled={!hasPolygonPoints}
                                            className={`flex items-center gap-2 px-3 py-2 sm:py-2.5 border rounded-md cursor-pointer 
                                            bg-gray-100 border-gray-200 text-gray-700 
                                            ${!hasPolygonPoints ? 'opacity-50 cursor-not-allowed' : 'hover:border-red-500 hover:text-red-600'} 
                                            focus:outline-none focus:ring-0`}>
                                            <Eraser className="w-3 h-3 sm:w-4 sm:h-4" />
                                            <span className="text-xs sm:text-sm font-medium">Clear</span>
                                        </button>

                                        <button
                                            onClick={handleDoneClick}
                                            disabled={!isPolygonComplete || openMeteoLoading}
                                            className={`flex items-center gap-2 px-3 py-2 sm:py-2.5 border rounded-md cursor-pointer 
                                            ${isPolygonComplete && !openMeteoLoading 
                                                ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100 hover:border-green-400' 
                                                : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed opacity-50'
                                            } focus:outline-none focus:ring-0`}>
                                            {openMeteoLoading ? (
                                                <RotateCcw className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
                                            ) : (
                                                <Check className="w-3 h-3 sm:w-4 sm:h-4" />
                                            )}
                                            <span className="text-xs sm:text-sm font-medium">
                                                {openMeteoLoading ? 'Loading' : 'Done'}
                                            </span>
                                        </button>
                                    </div>
                                    
                                    {/* Point Management - Shows in edit mode */}
                                    {drawingMode === 'edit' && polygonPoints.length > 0 && (
                                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                                            <div className="text-sm font-medium text-yellow-800 mb-2">Edit Points</div>
                                            <div className="space-y-1 max-h-32 overflow-y-auto">
                                                {polygonPoints.map((point, index) => (
                                                    <div key={index} className="flex items-center justify-between bg-white rounded px-2 py-1 text-xs">
                                                        <span className="text-gray-600">
                                                            Point {index + 1}: {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
                                                        </span>
                                                        <button
                                                            onClick={() => handleRemovePolygonPoint(index)}
                                                            className="text-red-500 hover:text-red-700 ml-2">
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="text-xs text-yellow-600 mt-2">
                                                Click points on map to move them, or use × to remove individual points
                                            </div>
                                        </div>
                                    )}
                                    
                                    {/* Polygon Stats */}
                                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                                        <div className="bg-gray-50 p-2 rounded">
                                            <div className="font-medium">Points</div>
                                            <div className="text-lg font-bold text-blue-600">
                                                {polygonPoints.length}
                                                <span className="text-xs text-gray-500">/12</span>
                                            </div>
                                        </div>
                                        <div className="bg-gray-50 p-2 rounded">
                                            <div className="font-medium">Area</div>
                                            <div className="text-lg font-bold text-green-600">
                                                {polygonArea > 0 ? `${polygonArea.toFixed(1)}` : '0'}
                                                <span className="text-xs text-gray-500">km²</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Status Messages */}
                                    {polygonPoints.length > 0 && polygonPoints.length < 3 && (
                                        <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                                            Draw at least 3 points to create polygon
                                        </div>
                                    )}
                                    
                                    {isPolygonComplete && !openMeteoData && (
                                        <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                                            ✓ Polygon complete! Click "Done" to fetch weather data.
                                        </div>
                                    )}
                                    
                                    {openMeteoData && (
                                        <div className="text-xs text-green-600 bg-green-50 p-2 rounded">
                                            ✅ Weather data loaded! Use time controls below to animate.
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* Standard Layout Controls */
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
                            )}
                        </div>

                        {/* Control Sliders */}
                        <div className="mb-3 sm:mb-4 space-y-3 sm:space-y-4">
                            {/* Opacity Slider */}
                            <div className="flex items-center gap-3">
                                <span className="text-xs sm:text-sm font-medium text-gray-700 whitespace-nowrap min-w-16 sm:min-w-20">
                                    Opacity: {Math.round(getCurrentOpacity() * 100)}%
                                </span>
                                <input
                                    type="range"
                                    min="0" max="1"
                                    step="0.05" value={getCurrentOpacity()}
                                    onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
                                    className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-gray-200 accent-blue-500" />
                            </div>

                            {/* Animation Speed Slider - Only show when animation controls are available */}
                            {shouldShowAnimationControls && (
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
                            )}
                        </div>

                        {/* Time Controls with integrated timestamp info - Only show when appropriate */}
                        {shouldShowAnimationControls && (
                            <div className="pt-3 sm:pt-4">
                                <div className="flex flex-row items-start sm:items-center gap-3 mb-3 sm:mb-4">
                                    {/* Control Buttons */}
                                    <div className="flex items-center gap-2">
                                        {/* Back Button */}
                                        <button
                                            onClick={() => handleTimeIndexChange(Math.max(0, getCurrentTimeIndex() - 1))}
                                            disabled={getCurrentTimeIndex() === 0}
                                            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer shadow-sm">
                                            <SkipBack className="w-3 h-3 sm:w-4 sm:h-4" />
                                        </button>

                                        {/* Play/Pause Button */}
                                        <button
                                            onClick={handlePlayPause}
                                            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer shadow-sm">
                                            {getCurrentIsPlaying() ? <Pause className="w-3 h-3 sm:w-4 sm:h-4" /> : <Play className="w-3 h-3 sm:w-4 sm:h-4" />}
                                        </button>

                                        {/* Forward Button */}
                                        <button
                                            onClick={() => handleTimeIndexChange(getCurrentTimeIndex() + 1)}
                                            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer shadow-sm">
                                            <SkipForward className="w-3 h-3 sm:w-4 sm:h-4" />
                                        </button>

                                        {/* Reset Button */}
                                        <button
                                            onClick={handleReset}
                                            disabled={getCurrentTimeIndex() === 0}
                                            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer shadow-sm">
                                            <RotateCcw className="w-3 h-3 sm:w-4 sm:h-4" />
                                        </button>
                                    </div>

                                    {/* Timestamp Display */}
                                    <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                                        <div className="text-sm font-semibold text-blue-700">
                                            {getCurrentTimestamp() ? formatTimestampDisplay(getCurrentTimestamp()) : 'Loading...'}
                                        </div>
                                        <div className="text-xs text-blue-500">
                                            {getCurrentTimeIndex() + 1} / {totalTimeIndices + 1}
                                        </div>
                                    </div>
                                </div>

                                {/* Time Slider */}
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
                                            value={getCurrentTimeIndex()}
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
                                            {selectedDataSource === 'openmeteo' 
                                                ? (openMeteoData?.hourly?.time?.[0] ? formatTimestampDisplay(new Date(openMeteoData.hourly.time[0])) : 'Start')
                                                : (timeRangeInfo ? formatTimestampDisplay(timeRangeInfo.startDate) : 'Start')
                                            }
                                        </span>
                                        <span className="sm:hidden text-xs">Start</span>
                                        <span className="text-blue-600 font-medium text-xs">
                                            {selectedDataSource === 'openmeteo' 
                                                ? `${openMeteoData?.hourly?.time?.length || 0}/${openMeteoData?.hourly?.time?.length || 0} loaded`
                                                : `${currentTimeIndices.length}/${timeRangeInfo?.totalTimestamps || 0} loaded`
                                            }
                                        </span>
                                        <span className="hidden sm:inline">
                                            {selectedDataSource === 'openmeteo' 
                                                ? (openMeteoData?.hourly?.time ? formatTimestampDisplay(new Date(openMeteoData.hourly.time[openMeteoData.hourly.time.length - 1])) : 'End')
                                                : (timeRangeInfo ? formatTimestampDisplay(timeRangeInfo.endDate) : 'End')
                                            }
                                        </span>
                                        <span className="sm:hidden text-xs">End</span>
                                    </div>
                                </div>

                                {/* OpenMeteo Instructions - Only show when no valid data */}
                                {selectedDataSource === 'openmeteo' && !openMeteoHasValidData && polygonPoints.length === 0 && !openMeteoLoading && (
                                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                        <div className="text-sm text-amber-800">
                                            <div className="font-medium mb-1">Draw a polygon to get started:</div>
                                            <div className="text-xs">
                                                1. Click "Draw" button above<br/>
                                                2. Click on map to add points (3-12 points)<br/>
                                                3. Click "Done" to fetch weather data
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* OpenMeteo Instructions when no animation controls */}
                        {selectedDataSource === 'openmeteo' && !shouldShowAnimationControls && polygonPoints.length === 0 && !openMeteoLoading && (
                            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                <div className="text-sm text-amber-800">
                                    <div className="font-medium mb-1">Draw a polygon to get started:</div>
                                    <div className="text-xs">
                                        1. Click "Draw" button above<br/>
                                        2. Click on map to add points (3-12 points)<br/>
                                        3. Click "Done" to fetch weather data
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