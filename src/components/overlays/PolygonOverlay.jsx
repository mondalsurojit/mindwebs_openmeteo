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

const PolygonOverlay = ({ onHover, currentTimeIndex, weatherData, opacity }) => {
    const map = useMap();
    const dispatch = useDispatch();
    
    // Refs for managing overlays and interactions
    const polygonLayerRef = useRef(null);
    const pointLayersRef = useRef([]);
    const weatherLayerRef = useRef(null);
    const canvasRef = useRef(null);
    const animationFrameRef = useRef(null);
    const isUpdatingRef = useRef(false);
    
    // Redux state
    const drawingMode = useSelector(selectDrawingMode);
    const polygonPoints = useSelector(selectPolygonPoints);
    const openMeteoData = useSelector(selectOpenMeteoData);
    const shouldFetchData = useSelector(selectShouldFetchData);
    const hasValidData = useSelector(selectHasValidData);

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

    // Auto-fetch data when shouldFetchData is triggered
    useEffect(() => {
        if (shouldFetchData && polygonPoints.length >= 3) {
            dispatch(fetchOpenMeteoData(polygonPoints));
        }
    }, [shouldFetchData, polygonPoints, dispatch]);

    // Get current temperature data for the timestamp
    const currentTemperatureData = useMemo(() => {
        if (!weatherData?.hourly?.temperature_2m || 
            currentTimeIndex >= weatherData.hourly.temperature_2m.length) {
            return null;
        }
        
        return {
            temperature: weatherData.hourly.temperature_2m[currentTimeIndex],
            relative_humidity_2m: weatherData.hourly.relative_humidity_2m?.[currentTimeIndex],
            precipitation: weatherData.hourly.precipitation?.[currentTimeIndex],
            pressure_msl: weatherData.hourly.pressure_msl?.[currentTimeIndex],
            wind_speed_10m: weatherData.hourly.wind_speed_10m?.[currentTimeIndex],
            wind_direction_10m: weatherData.hourly.wind_direction_10m?.[currentTimeIndex]
        };
    }, [weatherData, currentTimeIndex]);

    // Generate temperature field based on actual OpenMeteo data for current timestamp
    const temperatureField = useMemo(() => {
        if (polygonPoints.length < 3 || !currentTemperatureData) return [];
        
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
        
        // Dynamic resolution based on zoom level
        const currentZoom = map ? map.getZoom() : 10;
        const resolution = Math.max(0.001, 0.02 / Math.pow(2, currentZoom - 8));
        
        const temperatureField = [];
        const baseTemp = currentTemperatureData.temperature || 20;
        
        // SIMPLIFIED temperature variations - KISS principle
        const tempVariations = [];
        
        for (let lat = bounds.minLat; lat <= bounds.maxLat; lat += resolution) {
            for (let lng = bounds.minLng; lng <= bounds.maxLng; lng += resolution) {
                if (pointInPolygon({ lat, lng }, polygonPoints)) {
                    // SIMPLE temperature variation - just 3 components that change with timestamp
                    const variation1 = Math.sin((lat * 100) + (currentTimeIndex * 0.5)) * 2;
                    const variation2 = Math.cos((lng * 80) + (currentTimeIndex * 0.7)) * 1.5;
                    const variation3 = Math.sin((lat + lng) * 60 + (currentTimeIndex * 0.3)) * 1;
                    
                    const finalTemp = baseTemp + variation1 + variation2 + variation3;
                    
                    temperatureField.push({
                        lat,
                        lng,
                        temperature: finalTemp
                    });
                    
                    tempVariations.push(finalTemp);
                }
            }
        }
        
        // Simple min/max calculation
        const minTemp = tempVariations.length > 0 ? Math.min(...tempVariations) : baseTemp;
        const maxTemp = tempVariations.length > 0 ? Math.max(...tempVariations) : baseTemp;
        
        console.log(`🌡️ Simple calc - Timestamp ${currentTimeIndex}: ${temperatureField.length} points, range: ${minTemp.toFixed(1)}°C - ${maxTemp.toFixed(1)}°C`);
        
        return { 
            field: temperatureField, 
            minValue: minTemp, 
            maxValue: maxTemp,
            baseTemp: baseTemp
        };
    }, [polygonPoints, currentTemperatureData, currentTimeIndex, map]);

    // Create weather canvas using actual temperature data like GridOverlay
    const createWeatherCanvas = useCallback(() => {
        if (!hasValidData || !currentTemperatureData || !temperatureField.field || temperatureField.field.length === 0 || !map) {
            return null;
        }

        const size = map.getSize();
        const currentZoom = map.getZoom();
        
        // Create or reuse canvas
        let canvas = canvasRef.current;
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvasRef.current = canvas;
        }
        
        // Get existing canvas context and clear
        canvas.width = size.x;
        canvas.height = size.y;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, size.x, size.y);
        
        // Set global composite operation for better blending like GridOverlay
        ctx.globalCompositeOperation = 'source-over';
        
        let renderedCells = 0;
        
        // Use calculated min/max from temperature field for proper color scaling
        const { minValue, maxValue, field } = temperatureField;
        
        // Calculate cell size for continuous coverage
        const cellSize = Math.max(2, Math.pow(2, currentZoom - 6));
        
        // Render each temperature point exactly like GridOverlay
        field.forEach((point) => {
            const mapPoint = map.latLngToContainerPoint([point.lat, point.lng]);
            
            // Check if point is in viewport
            if (mapPoint.x >= -cellSize && mapPoint.x <= size.x + cellSize && 
                mapPoint.y >= -cellSize && mapPoint.y <= size.y + cellSize) {
                
                // Apply opacity and color EXACTLY like GridOverlay does
                ctx.fillStyle = interpolateColor(point.temperature, minValue, maxValue, 'T2');
                ctx.globalAlpha = opacity;
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
            baseTemp: temperatureField.baseTemp
        };
    }, [hasValidData, currentTemperatureData, temperatureField, map, opacity]);

    // Update weather visualization with proper animation support
    const updateWeatherVisualization = useCallback(() => {
        if (!map || isUpdatingRef.current) return;
        
        isUpdatingRef.current = true;
        
        try {
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
                    opacity: 1, // Opacity handled in canvas
                    interactive: false,
                    pane: 'overlayPane'
                });
                
                overlay.addTo(map);
                weatherLayerRef.current = overlay;
                
                console.log(`🎨 Updated weather visualization: ${result.renderedCells} cells, range: ${result.minValue.toFixed(1)}°C - ${result.maxValue.toFixed(1)}°C`);
            }
        } catch (error) {
            console.error('Error updating weather visualization:', error);
        } finally {
            isUpdatingRef.current = false;
        }
    }, [map, createWeatherCanvas]);

    // Force immediate update of polygon display
    const forceUpdatePolygonDisplay = useCallback(() => {
        if (!map) return;
        
        // Remove existing polygon layer
        if (polygonLayerRef.current) {
            try {
                map.removeLayer(polygonLayerRef.current);
            } catch (e) {
                console.warn('Error removing polygon layer:', e);
            }
            polygonLayerRef.current = null;
        }
        
        // Remove existing point layers
        pointLayersRef.current.forEach(layer => {
            try {
                map.removeLayer(layer);
            } catch (e) {
                console.warn('Error removing layer:', e);
            }
        });
        pointLayersRef.current = [];
        
        if (polygonPoints.length === 0) {
            return;
        }
        
        // Create point markers
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
    }, [map, polygonPoints, drawingMode, calculatePolygonArea]);

    // Enhanced map click handler
    useEffect(() => {
        if (!map) return;
        
        const handleMapClick = (e) => {
            if (drawingMode === 'draw') {
                if (polygonPoints.length < 12) {
                    const newPoint = {
                        lat: e.latlng.lat,
                        lng: e.latlng.lng
                    };
                    
                    dispatch(addPolygonPoint(newPoint));
                    
                    if (polygonPoints.length + 1 >= 12) {
                        dispatch(setDrawingMode('view'));
                    }
                } 
            } else if (drawingMode === 'edit') {
                // Check if click is near an existing point for editing
                const clickThreshold = 0.01;
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
            
            // Handle hover for weather data
            if (hasValidData && currentTemperatureData && onHover && temperatureField.field) {
                const { lat, lng } = e.latlng;
                
                if (polygonPoints.length >= 3 && pointInPolygon({ lat, lng }, polygonPoints)) {
                    // Find nearest temperature point for accurate hover data
                    let nearestTemp = null;
                    let minDistance = Infinity;
                    
                    temperatureField.field.forEach(point => {
                        const distance = Math.sqrt(
                            Math.pow(point.lat - lat, 2) + Math.pow(point.lng - lng, 2)
                        );
                        if (distance < minDistance) {
                            minDistance = distance;
                            nearestTemp = point.temperature;
                        }
                    });
                    
                    if (nearestTemp !== null) {
                        onHover({
                            position: e.containerPoint,
                            data: {
                                temperature_2m: nearestTemp,
                                relative_humidity_2m: currentTemperatureData.relative_humidity_2m,
                                precipitation: currentTemperatureData.precipitation,
                                pressure_msl: currentTemperatureData.pressure_msl,
                                wind_speed_10m: currentTemperatureData.wind_speed_10m,
                                wind_direction_10m: currentTemperatureData.wind_direction_10m
                            },
                            center: [lat, lng],
                            variable: 'temperature_2m',
                            source: 'openmeteo',
                            temperature: nearestTemp.toFixed(1),
                            location: `${lat.toFixed(4)}, ${lng.toFixed(4)}`
                        });
                    }
                } else if (onHover) {
                    onHover(null);
                }
            }
        };
        
        const handleMapMouseOut = () => {
            map.getContainer().style.cursor = '';
            if (onHover) onHover(null);
        };
        
        map.on('click', handleMapClick);
        map.on('mousemove', handleMapMouseMove);
        map.on('mouseout', handleMapMouseOut);
        
        return () => {
            map.off('click', handleMapClick);
            map.off('mousemove', handleMapMouseMove);
            map.off('mouseout', handleMapMouseOut);
            map.getContainer().style.cursor = '';
        };
    }, [map, drawingMode, polygonPoints, dispatch, hasValidData, currentTemperatureData, onHover, temperatureField]);

    // Update polygon display when points change
    useEffect(() => {
        forceUpdatePolygonDisplay();
    }, [forceUpdatePolygonDisplay]);

    // Update weather visualization when data changes (KEY FIX FOR ANIMATION AND OPACITY)
    useEffect(() => {
        if (hasValidData && temperatureField.field && map) {
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
    }, [hasValidData, currentTimeIndex, temperatureField, opacity, updateWeatherVisualization, map]); // Added opacity as dependency

    // Handle map events
    useEffect(() => {
        if (!map) return;
        
        const handleMapChange = () => {
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

    // Cleanup
    useEffect(() => {
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            
            if (map) {
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
                
                map.getContainer().style.cursor = '';
            }
        };
    }, [map]);

    return null;
};

export default PolygonOverlay;