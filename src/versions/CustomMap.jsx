import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { MapContainer, TileLayer, ZoomControl, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import HoverTooltip from '../components/HoverTooltip';
import GridOverlay from '../components/overlays/GridOverlay';
import StationsOverlay from '../components/overlays/StationsOverlay';
import WindOverlay from '../components/overlays/WindOverlay';
import ZWSOverlay from '../components/overlays/ZWSOverlay';
import PolygonOverlay from '../components/overlays/PolygonOverlay';
import Legend from '../components/Legend';

import {
    advanceTime, selectWeatherData, selectSelectedVariable, selectWeatherVariables,
    selectTimeSteps, selectBatchInfo, selectFetchingBatches
} from '../redux/slices/weatherSlice';

import {
    setIsPlaying, setHoverData, clearHoverData, selectIsPlaying,
    selectHoverData, selectMapCenter, selectMapZoom, selectShowGrid,
    setMapZoom, selectSelectedDataSource
} from '../redux/slices/uiSlice';

import {
    selectDrawingMode, selectPolygonPoints, selectOpenMeteoData,
    selectHasValidData as selectOpenMeteoHasValidData, selectOpenMeteoIsPlaying,
    selectOpenMeteoCurrentTimeIndex, selectOpenMeteoOpacity
} from '../redux/slices/openMeteoSlice';

// Fix for default markers in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Map view options
const MAP_VIEWS = [
    {
        id: 'street',
        name: 'Street Map',
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '&copy; OpenStreetMap',
        icon: '🗺️'
    },
    {
        id: 'satellite',
        name: 'Satellite',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: '&copy; Esri',
        icon: '🛰️'
    },
    {
        id: 'terrain',
        name: 'Terrain',
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        attribution: '&copy; OpenTopoMap',
        icon: '🏔️'
    },
    {
        id: 'dark',
        name: 'Dark Mode',
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attribution: '&copy; CartoDB',
        icon: '🌙'
    },
    {
        id: 'light',
        name: 'Light Mode',
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        attribution: '&copy; CartoDB',
        icon: '☀️'
    }
];

// View Selector Component
const ViewSelector = ({ currentView, onViewChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const toggleDropdown = () => setIsOpen(!isOpen);

    const handleViewSelect = (view) => {
        onViewChange(view);
        setIsOpen(false);
    };

    const currentViewData = MAP_VIEWS.find(view => view.id === currentView) || MAP_VIEWS[0];

    return (
        <div className="absolute top-20 right-2.5 z-30">
            <button
                onClick={toggleDropdown}
                className="bg-white hover:bg-gray-50 border-2 border-gray-300 rounded-md shadow-sm w-8 h-10 text-md font-medium text-gray-700 flex items-center justify-center cursor-pointer transition-colors duration-200"
                title="Change map view">
                {currentViewData.icon}
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-[-1]" onClick={() => setIsOpen(false)} />
                    <div className="absolute top-full mt-1 right-0 bg-white border border-gray-300 rounded-md shadow-lg py-1 min-w-[160px] z-[1001]">
                        {MAP_VIEWS.map((view) => (
                            <button
                                key={view.id}
                                onClick={() => handleViewSelect(view)}
                                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center gap-3 cursor-pointer transition-colors duration-150 ${currentView === view.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}>
                                <span className="text-base">{view.icon}</span>
                                <span>{view.name}</span>
                                {currentView === view.id && (
                                    <span className="ml-auto text-blue-600">✓</span>
                                )}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

// Component to track zoom level and manage hover tooltip visibility
const ZoomTracker = ({ onZoomChange }) => {
    useMapEvents({
        zoomend: (e) => {
            const zoom = e.target.getZoom();
            onZoomChange(zoom);
        }
    });
    return null;
};

const CustomMap = () => { // Remove selectedDataSource prop - get from Redux
    const dispatch = useDispatch();
    const [currentMapView, setCurrentMapView] = useState('street');

    // Animation refs for smooth timing
    const animationFrameRef = useRef(null);
    const lastFrameTimeRef = useRef(0);
    const frameIntervalRef = useRef(1000); // 1 second default

    // Weather state from Redux
    const weatherData = useSelector(selectWeatherData);
    const timeSteps = useSelector(selectTimeSteps);
    const fetchingBatches = useSelector(selectFetchingBatches);

    // UI state from Redux
    const isPlaying = useSelector(selectIsPlaying);
    const hoverData = useSelector(selectHoverData);
    const mapCenter = useSelector(selectMapCenter);
    const mapZoom = useSelector(selectMapZoom);
    const showGrids = useSelector(selectShowGrid);
    const selectedDataSource = useSelector(selectSelectedDataSource); // Get from Redux

    // OpenMeteo state from Redux
    const drawingMode = useSelector(selectDrawingMode);
    const polygonPoints = useSelector(selectPolygonPoints);
    const openMeteoData = useSelector(selectOpenMeteoData);
    const openMeteoHasValidData = useSelector(selectOpenMeteoHasValidData);
    const openMeteoIsPlaying = useSelector(selectOpenMeteoIsPlaying);
    const openMeteoCurrentTimeIndex = useSelector(selectOpenMeteoCurrentTimeIndex);
    const openMeteoOpacity = useSelector(selectOpenMeteoOpacity);

    const handleZoomChange = useCallback((zoom) => {
        dispatch(setMapZoom(zoom));
        // Clear hover data when zoomed out beyond level 10
        if (zoom < 10 && hoverData) dispatch(clearHoverData());
    }, [dispatch, hoverData]);

    const handleViewChange = useCallback((view) => {
        setCurrentMapView(view.id);
    }, []);

    // Animation loop for WRF data only
    const animationLoop = useCallback((currentTime) => {
        if (!isPlaying || selectedDataSource !== 'wrf' || (!weatherData || timeSteps.length === 0)) {
            animationFrameRef.current = null;
            return;
        }

        // Check if enough time has passed for next frame
        if (currentTime - lastFrameTimeRef.current >= frameIntervalRef.current) {
            // Advance to next time step
            dispatch(advanceTime());
            lastFrameTimeRef.current = currentTime;
        }

        // Continue animation loop
        animationFrameRef.current = requestAnimationFrame(animationLoop);
    }, [isPlaying, weatherData, timeSteps.length, dispatch, selectedDataSource]);

    // Start/stop animation with requestAnimationFrame for WRF
    useEffect(() => {
        if (isPlaying && selectedDataSource === 'wrf' && weatherData && timeSteps.length > 0) {
            // Reset timing
            lastFrameTimeRef.current = performance.now();

            // Start animation loop
            if (!animationFrameRef.current) {
                animationFrameRef.current = requestAnimationFrame(animationLoop);
            }
        } else {
            // Stop animation
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        }

        // Cleanup on unmount or when dependencies change
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        };
    }, [isPlaying, weatherData, timeSteps.length, animationLoop, selectedDataSource]);

    // Stop animation when data is not available for WRF
    useEffect(() => {
        if (isPlaying && selectedDataSource === 'wrf' && (!weatherData || timeSteps.length === 0)) {
            dispatch(setIsPlaying(false));
        }
    }, [weatherData, timeSteps.length, isPlaying, dispatch, selectedDataSource]);

    // Dynamic frame rate based on data availability and performance
    useEffect(() => {
        // Adjust frame interval based on conditions
        if (fetchingBatches.length > 0) {
            // Slower when loading data
            frameIntervalRef.current = 1500;
        } else if (timeSteps.length > 50) {
            // Faster for longer sequences
            frameIntervalRef.current = 800;
        } else {
            // Default speed
            frameIntervalRef.current = 1000;
        }
    }, [fetchingBatches.length, timeSteps.length]);

    // Handle hover events - Modified to respect zoom level and map boundaries
    const handleHover = useCallback((hoverInfo) => {
        // Only set hover data if zoom level is 10 or higher
        if (mapZoom >= 10) {
            if (hoverInfo) dispatch(setHoverData(hoverInfo));
            else dispatch(clearHoverData());
        } else {
            // Clear hover data if zoomed out
            dispatch(clearHoverData());
        }
    }, [dispatch, mapZoom]);

    const handleMapMouseLeave = useCallback(() => {
        dispatch(clearHoverData());
    }, [dispatch]);

    // Get current view configuration
    const currentViewConfig = MAP_VIEWS.find(view => view.id === currentMapView) || MAP_VIEWS[0];

    // Determine which overlays to show based on data source
    const shouldShowGridOverlay = selectedDataSource === 'wrf' && weatherData && showGrids;
    const shouldShowPolygonOverlay = polygonPoints.length > 0; // Show if polygon exists, regardless of data source
    const shouldShowStandardOverlays = selectedDataSource === 'wrf';

    return (
        <div className="relative h-screen w-full">
            <div className="relative h-full w-full" onMouseLeave={handleMapMouseLeave}>
                <MapContainer
                    center={mapCenter}
                    zoom={mapZoom}
                    minZoom={4}
                    maxZoom={14}
                    zoomControl={false}
                    className="z-0 h-full w-full"
                    preferCanvas={true}
                    renderer={L.canvas()}
                    worldCopyJump={true}
                    maxBounds={[[-90, -Infinity], [90, Infinity]]}
                    maxBoundsViscosity={1.0}>

                    <ZoomControl position="topright" />
                    <TileLayer
                        key={currentMapView} // Force re-render when view changes
                        url={currentViewConfig.url}
                        attribution={currentViewConfig.attribution} />

                    <ZoomTracker onZoomChange={handleZoomChange} />

                    {/* Standard WRF Overlays */}
                    {shouldShowGridOverlay && (
                        <GridOverlay onHover={handleHover} className='z-20' />
                    )}

                    {shouldShowStandardOverlays && (
                        <>
                            <WindOverlay />
                            <StationsOverlay />
                        </>
                    )}

                    {/* Polygon Overlay - Only render when in OpenMeteo mode */}
                    {selectedDataSource === 'openmeteo' && (
                        <PolygonOverlay 
                            onHover={handleHover} 
                            selectedDataSource={selectedDataSource}
                            currentTimeIndex={openMeteoCurrentTimeIndex}
                            weatherData={openMeteoData}
                            opacity={openMeteoOpacity}
                        />
                    )}

                    {/* Always show ZWS overlay */}
                    <ZWSOverlay />
                </MapContainer>

                {/* View Selector positioned below zoom controls */}
                <ViewSelector
                    currentView={currentMapView}
                    onViewChange={handleViewChange}
                />

                {/* Show hover tooltip based on conditions */}
                {((mapZoom >= 10 && selectedDataSource === 'wrf') ||
                    (selectedDataSource === 'openmeteo' && openMeteoHasValidData)) && (
                        <HoverTooltip />
                    )}
            </div>

            <Legend />
        </div>
    );
};

export default CustomMap;