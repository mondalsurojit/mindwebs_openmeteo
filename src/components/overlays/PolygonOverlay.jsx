import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Import color interpolation from helper
import { interpolateColor } from '../../hooks/helper';

import {
    setPolygonPoints, addPolygonPoint, setDrawingMode, fetchOpenMeteoData,
    selectDrawingMode, selectPolygonPoints, selectOpenMeteoData, 
    selectOpenMeteoCurrentTimeIndex, selectOpenMeteoOpacity, selectShowPolygon,
    selectShouldFetchData, selectOpenMeteoCurrentData, selectHasValidData,
    selectOpenMeteoIsPlaying, triggerDataFetch, editPolygonPoint
} from '../../redux/slices/openMeteoSlice';

// Generate smooth temperature field for weather map visualization
const generateTemperatureField = (polygonPoints, resolution = 0.01) => {
    if (polygonPoints.length < 3) return [];
    
    // Find bounding box
    const bounds = polygonPoints.reduce((acc, point) => ({
        minLat: Math.min(acc.minLat, point.lat),
        maxLat: Math.max(acc.maxLat, point.lat),
        minLng: Math.min(acc.minLng, point.lng),
        maxLng: Math.max(acc.maxLng, point.lng)
    }), {
        minLat: Infinity,
        maxLat: -Infinity,
        minLng: Infinity,
        maxLng: -Infinity
    });
    
    const temperatureField = [];
    
    // Generate smooth temperature field using Perlin-like noise
    for (let lat = bounds.minLat; lat <= bounds.maxLat; lat += resolution) {
        for (let lng = bounds.minLng; lng <= bounds.maxLng; lng += resolution) {
            // Check if point is inside polygon
            if (pointInPolygon({ lat, lng }, polygonPoints)) {
                // Create smooth temperature variation using multiple sine waves
                const temp1 = Math.sin(lat * 100) * 2;
                const temp2 = Math.cos(lng * 120) * 1.5;
                const temp3 = Math.sin((lat + lng) * 80) * 1;
                
                temperatureField.push({
                    lat,
                    lng,
                    temperature: temp1 + temp2 + temp3 // This will be added to base temperature
                });
            }
        }
    }
    
    console.log(`🌡️ Generated smooth temperature field with ${temperatureField.length} points`);
    return temperatureField;
};

// Point in polygon algorithm
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

const PolygonOverlay = ({ onHover }) => {
    const map = useMap();
    const dispatch = useDispatch();
    
    // Refs for managing overlays and interactions
    const polygonLayerRef = useRef(null);
    const pointLayersRef = useRef([]);
    const weatherLayerRef = useRef(null);
    const canvasRef = useRef(null);
    const animationFrameRef = useRef(null);
    const editingPointRef = useRef(null);
    
    // Redux state
    const drawingMode = useSelector(selectDrawingMode);
    const polygonPoints = useSelector(selectPolygonPoints);
    const openMeteoData = useSelector(selectOpenMeteoData);
    const currentTimeIndex = useSelector(selectOpenMeteoCurrentTimeIndex);
    const opacity = useSelector(selectOpenMeteoOpacity);
    const showPolygon = useSelector(selectShowPolygon);
    const shouldFetchData = useSelector(selectShouldFetchData);
    const currentData = useSelector(selectOpenMeteoCurrentData);
    const hasValidData = useSelector(selectHasValidData);
    const isPlaying = useSelector(selectOpenMeteoIsPlaying);

    // Helper function to calculate polygon area
    const calculatePolygonArea = useCallback((points) => {
        if (points.length < 3) return 0;
        
        let area = 0;
        for (let i = 0; i < points.length; i++) {
            const j = (i + 1) % points.length;
            area += points[i].lat * points[j].lng;
            area -= points[j].lat * points[i].lng;
        }
        area = Math.abs(area) / 2;
        
        // Convert to km² (rough approximation)
        return area * 12321;
    }, []);

    // Clear weather visualization when data is cleared
    useEffect(() => {
        if (!openMeteoData && weatherLayerRef.current && map) {
            console.log('🧹 Clearing weather visualization');
            map.removeLayer(weatherLayerRef.current);
            weatherLayerRef.current = null;
        }
    }, [openMeteoData, map]);

    // Auto-fetch data when shouldFetchData is triggered (only from Done button now)
    useEffect(() => {
        console.log('🔍 Checking fetch conditions:', {
            shouldFetchData,
            polygonPointsLength: polygonPoints.length,
            polygonPoints: polygonPoints
        });
        
        if (shouldFetchData && polygonPoints.length >= 3) {
            console.log('🚀 Dispatching fetchOpenMeteoData for polygon:', polygonPoints);
            dispatch(fetchOpenMeteoData(polygonPoints));
        }
    }, [shouldFetchData, polygonPoints, dispatch]);

    // Generate dense temperature field for continuous coverage up to zoom 14
    const temperatureField = useMemo(() => {
        if (polygonPoints.length < 3) return [];
        
        // Find bounding box
        const bounds = polygonPoints.reduce((acc, point) => ({
            minLat: Math.min(acc.minLat, point.lat),
            maxLat: Math.max(acc.maxLat, point.lat),
            minLng: Math.min(acc.minLng, point.lng),
            maxLng: Math.max(acc.maxLng, point.lng)
        }), {
            minLat: Infinity,
            maxLat: -Infinity,
            minLng: Infinity,
            maxLng: -Infinity
        });
        
        // Dynamic resolution based on zoom level for continuous coverage
        const currentZoom = map ? map.getZoom() : 10;
        const resolution = Math.max(0.001, 0.02 / Math.pow(2, currentZoom - 8)); // Denser at higher zoom
        
        const temperatureField = [];
        
        // Generate DENSE grid to ensure continuous coverage
        for (let lat = bounds.minLat; lat <= bounds.maxLat; lat += resolution) {
            for (let lng = bounds.minLng; lng <= bounds.maxLng; lng += resolution) {
                // Check if point is inside polygon boundary
                if (pointInPolygon({ lat, lng }, polygonPoints)) {
                    // Generate smooth temperature variation
                    const temp1 = Math.sin(lat * 100) * 2;
                    const temp2 = Math.cos(lng * 120) * 1.5;
                    const temp3 = Math.sin((lat + lng) * 80) * 1;
                    
                    temperatureField.push({
                        lat,
                        lng,
                        temperature: temp1 + temp2 + temp3
                    });
                }
            }
        }
        
        console.log(`🌡️ Generated dense temperature field with ${temperatureField.length} points at zoom ${currentZoom}`);
        return temperatureField;
    }, [polygonPoints, map]);

    // Create continuous weather visualization within polygon boundary
    const createWeatherCanvas = useCallback(() => {
        if (!hasValidData || !currentData || temperatureField.length === 0 || !map) return null;

        const size = map.getSize();
        const currentZoom = map.getZoom();
        
        // Create or reuse canvas
        let canvas = canvasRef.current;
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvasRef.current = canvas;
        }
        
        canvas.width = size.x;
        canvas.height = size.y;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, size.x, size.y);
        
        // Calculate ALL temperature values to find proper min/max
        const baseTemp = currentData.data.temperature_2m || 20;
        const temperatures = temperatureField.map(point => baseTemp + point.temperature);
        const minValue = Math.min(...temperatures);
        const maxValue = Math.max(...temperatures);
        
        let renderedCells = 0;
        
        // Calculate cell size for continuous coverage - adaptive based on zoom
        const cellSize = Math.max(2, Math.pow(2, currentZoom - 6)); // Larger at higher zoom
        
        // Render each temperature point with continuous coverage
        temperatureField.forEach((point, index) => {
            const mapPoint = map.latLngToContainerPoint([point.lat, point.lng]);
            
            // Extended viewport check to ensure edge coverage
            if (mapPoint.x >= -cellSize && mapPoint.x <= size.x + cellSize && 
                mapPoint.y >= -cellSize && mapPoint.y <= size.y + cellSize) {
                
                const temp = temperatures[index];
                
                // Use interpolateColor with proper min/max from polygon data
                const color = interpolateColor(temp, minValue, maxValue, 'T2');
                
                // Apply opacity correctly
                ctx.globalAlpha = opacity;
                ctx.fillStyle = color;
                
                // Use rectangles for continuous coverage (better than dots for no gaps)
                ctx.fillRect(
                    mapPoint.x - cellSize / 2,
                    mapPoint.y - cellSize / 2,
                    cellSize,
                    cellSize
                );
                
                renderedCells++;
            }
        });
        
        // Reset alpha
        ctx.globalAlpha = 1;
        
        return {
            canvas,
            imageUrl: canvas.toDataURL(),
            renderedCells,
            minValue,
            maxValue,
            baseTemp: baseTemp
        };
    }, [hasValidData, currentData, temperatureField, map, opacity]);

    // Update weather visualization with proper re-rendering on changes
    const updateWeatherVisualization = useCallback(() => {
        if (!map) return;
        
        // Remove existing weather layer
        if (weatherLayerRef.current) {
            try {
                map.removeLayer(weatherLayerRef.current);
            } catch (e) {
                console.warn('Error removing weather layer:', e);
            }
            weatherLayerRef.current = null;
        }
        
        // Create new weather visualization
        const result = createWeatherCanvas();
        if (result && result.renderedCells > 0) {
            const bounds = map.getBounds();
            const overlay = L.imageOverlay(result.imageUrl, bounds, {
                opacity: 1, // Set to 1 since opacity is handled in canvas
                interactive: false,
                pane: 'overlayPane'
            });
            
            overlay.addTo(map);
            weatherLayerRef.current = overlay;
            
            console.log(`🎨 Rendered ${result.renderedCells} temperature cells, range: ${result.minValue.toFixed(1)}°C - ${result.maxValue.toFixed(1)}°C`);
        }
    }, [map, createWeatherCanvas]);

    // Force immediate update of polygon display - Fixed clearing issue
    const forceUpdatePolygonDisplay = useCallback(() => {
        console.log('🔄 Force updating polygon display:', {
            polygonPointsLength: polygonPoints.length,
            showPolygon,
            drawingMode
        });
        
        if (!map) return;
        
        // Remove existing polygon layer IMMEDIATELY
        if (polygonLayerRef.current) {
            try {
                map.removeLayer(polygonLayerRef.current);
            } catch (e) {
                console.warn('Error removing polygon layer:', e);
            }
            polygonLayerRef.current = null;
        }
        
        // Remove existing point layers IMMEDIATELY
        pointLayersRef.current.forEach(layer => {
            try {
                map.removeLayer(layer);
            } catch (e) {
                console.warn('Error removing layer:', e);
            }
        });
        pointLayersRef.current = [];
        
        // Force map invalidation to ensure immediate visual update
        map.invalidateSize(false);
        
        if (polygonPoints.length === 0) {
            console.log('✅ All polygon elements cleared immediately');
            return;
        }
        
        console.log('📍 Creating point markers for', polygonPoints.length, 'points');
        
        // Create point markers with enhanced visuals
        polygonPoints.forEach((point, index) => {
            const marker = L.circleMarker([point.lat, point.lng], {
                radius: 8,
                fillColor: drawingMode === 'draw' ? '#10b981' : '#3b82f6',
                color: drawingMode === 'draw' ? '#059669' : '#1e40af',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            });
            
            marker.bindTooltip(`Point ${index + 1}`, {
                permanent: false,
                direction: 'top',
                offset: [0, -10]
            });
            
            marker.addTo(map);
            pointLayersRef.current.push(marker);
        });
        
        // Create polygon if we have enough points
        if (polygonPoints.length >= 3) {
            const latlngs = polygonPoints.map(p => [p.lat, p.lng]);
            
            const polygon = L.polygon(latlngs, {
                color: '#3b82f6',
                weight: 3,
                opacity: 0.8,
                fillColor: '#3b82f6',
                fillOpacity: 0.15,
                dashArray: drawingMode === 'draw' ? '5, 5' : null
            });
            
            polygon.addTo(map);
            polygonLayerRef.current = polygon;
            
            // Add area display
            const center = polygon.getBounds().getCenter();
            const area = calculatePolygonArea(polygonPoints);
            
            console.log('📐 Calculated polygon area:', area.toFixed(2), 'km²');
            
            const areaMarker = L.marker(center, {
                icon: L.divIcon({
                    className: 'polygon-area-label',
                    html: `<div style="
                        background: rgba(59, 130, 246, 0.95); 
                        color: white; 
                        padding: 6px 12px; 
                        border-radius: 6px; 
                        font-size: 13px; 
                        font-weight: bold; 
                        text-align: center;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                        border: 2px solid white;
                    ">
                        ${area.toFixed(1)} km²
                    </div>`,
                    iconSize: [90, 35],
                    iconAnchor: [45, 17]
                })
            });
            
            areaMarker.addTo(map);
            pointLayersRef.current.push(areaMarker);
        }
        
        // Show drawing instructions when in draw mode
        if (drawingMode === 'draw' && polygonPoints.length === 0) {
            const bounds = map.getBounds();
            const center = bounds.getCenter();
            
            const instructionMarker = L.marker(center, {
                icon: L.divIcon({
                    className: 'drawing-instruction',
                    html: `<div style="
                        background: rgba(16, 185, 129, 0.95); 
                        color: white; 
                        padding: 8px 12px; 
                        border-radius: 8px; 
                        font-size: 14px; 
                        font-weight: 500; 
                        text-align: center;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                        border: 2px solid white;
                        animation: pulse 2s infinite;
                    ">
                        📍 Click on map to add points<br/>
                        <small>(${polygonPoints.length}/12 points)</small>
                    </div>
                    <style>
                        @keyframes pulse {
                            0%, 100% { transform: scale(1); }
                            50% { transform: scale(1.05); }
                        }
                    </style>`,
                    iconSize: [180, 50],
                    iconAnchor: [90, 25]
                })
            });
            
            instructionMarker.addTo(map);
            pointLayersRef.current.push(instructionMarker);
        }
        
        // Force immediate map refresh
        setTimeout(() => {
            if (map) {
                map.invalidateSize(false);
            }
        }, 0);
        
    }, [map, polygonPoints, showPolygon, drawingMode, calculatePolygonArea]);

    // Enhanced map click handler with edit functionality
    useEffect(() => {
        if (!map) return;
        
        const handleMapClick = (e) => {
            console.log('🖱️ Map clicked:', {
                drawingMode,
                currentPointsCount: polygonPoints.length,
                clickedLat: e.latlng.lat,
                clickedLng: e.latlng.lng
            });
            
            if (drawingMode === 'draw') {
                if (polygonPoints.length < 12) {
                    const newPoint = {
                        lat: e.latlng.lat,
                        lng: e.latlng.lng
                    };
                    
                    console.log('➕ Adding new point:', newPoint);
                    dispatch(addPolygonPoint(newPoint));
                    
                    // Visual feedback - temporary highlight
                    const tempMarker = L.circleMarker([e.latlng.lat, e.latlng.lng], {
                        radius: 12,
                        fillColor: '#10b981',
                        color: '#059669',
                        weight: 3,
                        opacity: 1,
                        fillOpacity: 0.6
                    });
                    
                    tempMarker.addTo(map);
                    
                    setTimeout(() => {
                        try {
                            map.removeLayer(tempMarker);
                        } catch (e) {
                            console.warn('Error removing temp marker:', e);
                        }
                    }, 500);
                    
                    // Stop drawing mode if we reach max points
                    if (polygonPoints.length + 1 >= 12) {
                        console.log('🏁 Max points reached, stopping draw mode');
                        dispatch(setDrawingMode('view'));
                    }
                } else {
                    console.log('⚠️ Maximum points reached');
                }
            } else if (drawingMode === 'edit') {
                // Check if click is near an existing point for editing
                const clickThreshold = 0.01; // degrees
                let nearestPointIndex = -1;
                let minDistance = Infinity;
                
                polygonPoints.forEach((point, index) => {
                    const distance = Math.sqrt(
                        Math.pow(point.lat - e.latlng.lat, 2) + 
                        Math.pow(point.lng - e.latlng.lng, 2)
                    );
                    if (distance < clickThreshold && distance < minDistance) {
                        minDistance = distance;
                        nearestPointIndex = index;
                    }
                });
                
                if (nearestPointIndex >= 0) {
                    console.log('✏️ Editing point', nearestPointIndex);
                    dispatch(editPolygonPoint({
                        index: nearestPointIndex,
                        newPoint: {
                            lat: e.latlng.lat,
                            lng: e.latlng.lng
                        }
                    }));
                }
            }
        };
        
        const handleMapMouseMove = (e) => {
            // Update cursor based on drawing mode
            if (drawingMode === 'draw') {
                map.getContainer().style.cursor = polygonPoints.length < 12 ? 'crosshair' : 'not-allowed';
            } else if (drawingMode === 'edit') {
                // Check if hovering near a point
                const clickThreshold = 0.01;
                let nearPoint = false;
                
                polygonPoints.forEach((point) => {
                    const distance = Math.sqrt(
                        Math.pow(point.lat - e.latlng.lat, 2) + 
                        Math.pow(point.lng - e.latlng.lng, 2)
                    );
                    if (distance < clickThreshold) {
                        nearPoint = true;
                    }
                });
                
                map.getContainer().style.cursor = nearPoint ? 'move' : 'default';
            } else {
                map.getContainer().style.cursor = '';
            }
            
            // Handle hover for weather data with temperature info
            if (hasValidData && currentData && onHover) {
                const { lat, lng } = e.latlng;
                
                // Check if hover point is within polygon
                if (polygonPoints.length >= 3 && pointInPolygon({ lat, lng }, polygonPoints)) {
                    // Simple temperature calculation at hover point
                    const baseTemp = currentData.data.temperature_2m || 20;
                    const temp1 = Math.sin(lat * 100) * 2;
                    const temp2 = Math.cos(lng * 120) * 1.5;
                    const temp3 = Math.sin((lat + lng) * 80) * 1;
                    const hoverTemp = baseTemp + temp1 + temp2 + temp3;
                    
                    onHover({
                        position: e.containerPoint,
                        data: {
                            temperature_2m: hoverTemp,
                            relative_humidity_2m: currentData.data.relative_humidity_2m,
                            precipitation: currentData.data.precipitation,
                            pressure_msl: currentData.data.pressure_msl,
                            wind_speed_10m: currentData.data.wind_speed_10m,
                            wind_direction_10m: currentData.data.wind_direction_10m
                        },
                        center: [lat, lng],
                        variable: 'temperature_2m',
                        source: 'openmeteo',
                        temperature: hoverTemp.toFixed(1),
                        location: `${lat.toFixed(4)}, ${lng.toFixed(4)}`
                    });
                } else if (onHover) {
                    onHover(null);
                }
            }
        };
        
        const handleMapMouseOut = () => {
            map.getContainer().style.cursor = '';
            if (onHover) onHover(null);
        };
        
        // Add event listeners
        map.on('click', handleMapClick);
        map.on('mousemove', handleMapMouseMove);
        map.on('mouseout', handleMapMouseOut);
        
        return () => {
            map.off('click', handleMapClick);
            map.off('mousemove', handleMapMouseMove);
            map.off('mouseout', handleMapMouseOut);
            map.getContainer().style.cursor = '';
        };
    }, [map, drawingMode, polygonPoints, dispatch, hasValidData, currentData, onHover]);

    // Use immediate update for polygon changes (fixes clearing issue)
    useEffect(() => {
        // Use synchronous update instead of requestAnimationFrame for immediate clearing
        forceUpdatePolygonDisplay();
    }, [forceUpdatePolygonDisplay]);

    // Update weather visualization when data, time, opacity, or animation state changes
    useEffect(() => {
        if (hasValidData && map) {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            
            animationFrameRef.current = requestAnimationFrame(() => {
                updateWeatherVisualization();
            });
        }
        
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [hasValidData, currentTimeIndex, isPlaying, opacity, updateWeatherVisualization, map]);

    // Handle map events (zoom, pan)
    useEffect(() => {
        if (!map) return;
        
        const handleMapChange = () => {
            // Debounce updates
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            
            animationFrameRef.current = requestAnimationFrame(() => {
                forceUpdatePolygonDisplay();
                if (hasValidData) {
                    updateWeatherVisualization();
                }
            });
        };
        
        map.on('moveend', handleMapChange);
        map.on('zoomend', handleMapChange);
        
        return () => {
            map.off('moveend', handleMapChange);
            map.off('zoomend', handleMapChange);
        };
    }, [map, forceUpdatePolygonDisplay, updateWeatherVisualization, hasValidData]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            
            if (map) {
                // Remove all layers
                if (polygonLayerRef.current) {
                    try {
                        map.removeLayer(polygonLayerRef.current);
                    } catch (e) {
                        console.warn('Error removing polygon layer:', e);
                    }
                }
                if (weatherLayerRef.current) {
                    try {
                        map.removeLayer(weatherLayerRef.current);
                    } catch (e) {
                        console.warn('Error removing weather layer:', e);
                    }
                }
                pointLayersRef.current.forEach(layer => {
                    try {
                        map.removeLayer(layer);
                    } catch (e) {
                        console.warn('Error removing point layer:', e);
                    }
                });
                
                // Reset cursor
                map.getContainer().style.cursor = '';
            }
        };
    }, [map]);

    return null;
};

export default PolygonOverlay;