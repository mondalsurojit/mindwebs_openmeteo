import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { useMap } from 'react-leaflet';
import { useSelector } from 'react-redux';
import L from 'leaflet';
import 'leaflet-velocity';

import { selectWeatherData, selectCurrentTime, selectCurrentTimeData } from '../../redux/slices/weatherSlice';
import { selectShowWindAnimation, selectOpacity } from '../../redux/slices/uiSlice';

const WindOverlay = ({
  maxVelocity = 30, velocityScale = 0.01,
  particleMultiplier = 0.006, particleAge = 64,
  frameRate = 30, lineWidth = 2 }) => {
  const map = useMap();
  const velocityLayerRef = useRef(null);

  // Get current weather data from Redux
  const weatherData = useSelector(selectWeatherData);
  const currentTime = useSelector(selectCurrentTime);
  const currentTimeData = useSelector(selectCurrentTimeData);
  const showWindAnimation = useSelector(selectShowWindAnimation);
  const opacity = useSelector(selectOpacity);

  // Convert U10/V10 to velocity format
  const convertToVelocityFormat = useCallback((u10Array, v10Array, gridInfo, scale) => {
    if (!u10Array || !v10Array || !gridInfo) return null;

    const { corner, size, steps } = gridInfo;
    const [rows, cols] = size;
    const [latStep, lonStep] = steps;
    const [startLat, startLon] = corner;

    const totalPoints = u10Array.length;
    const uData = new Array(totalPoints);
    const vData = new Array(totalPoints);

    // Direct conversion from scaled U10/V10 components
    for (let i = 0; i < totalPoints; i++) {
      uData[i] = (u10Array[i] || 0) / scale;
      vData[i] = (v10Array[i] || 0) / scale;
    }

    // Return velocity data structure
    return [
      {
        header: {
          parameterCategory: 2, parameterNumber: 2,
          dx: lonStep, dy: latStep,
          la1: startLat + (rows - 1) * latStep, la2: startLat,
          lo1: startLon, lo2: startLon + (cols - 1) * lonStep,
          nx: cols, ny: rows
        },
        data: uData
      },
      {
        header: {
          parameterCategory: 2, parameterNumber: 3,
          dx: lonStep, dy: latStep,
          la1: startLat + (rows - 1) * latStep, la2: startLat,
          lo1: startLon, lo2: startLon + (cols - 1) * lonStep,
          nx: cols, ny: rows
        },
        data: vData
      }
    ];
  }, []);

  // Memoize velocity data
  const velocityData = useMemo(() => {
    if (!weatherData?.grid_info || !currentTimeData?.variables?.U10 || !currentTimeData?.variables?.V10) return null;

    const u10Data = currentTimeData.variables.U10;
    const v10Data = currentTimeData.variables.V10;

    return convertToVelocityFormat(
      u10Data, v10Data,
      weatherData.grid_info,
      weatherData.metadata?.variable_scales?.U10 || 100
    );
  }, [weatherData?.grid_info, weatherData?.metadata?.variable_scales?.U10, currentTimeData?.variables?.U10, currentTimeData?.variables?.V10, convertToVelocityFormat]);

  // Update layer when data changes
  useEffect(() => {
    if (!map) return;

    // Remove existing layer
    if (velocityLayerRef.current) {
      map.removeLayer(velocityLayerRef.current);
      velocityLayerRef.current = null;
    }

    // Add new layer if conditions are met
    if (showWindAnimation && velocityData) {
      try {
        const velocityOptions = {
          displayValues: true,
          displayOptions: {
            velocityType: 'Wind',
            position: 'bottomleft',
            emptyString: 'No wind data',
            angleConvention: 'bearingCCW',
            displayPosition: 'bottomleft',
            displayEmptyString: 'No wind data',
            speedUnit: 'm/s'
          },
          data: velocityData,
          maxVelocity, velocityScale,
          particleMultiplier, particleAge,
          frameRate, lineWidth,
          colorScale: [
            `rgba(50, 136, 189, ${opacity})`,
            `rgba(102, 194, 165, ${opacity})`,
            `rgba(171, 221, 164, ${opacity})`,
            `rgba(230, 245, 152, ${opacity})`,
            `rgba(254, 224, 139, ${opacity})`,
            `rgba(253, 174, 97, ${opacity})`,
            `rgba(244, 109, 67, ${opacity})`,
            `rgba(213, 62, 79, ${opacity})`
          ],
          opacity: opacity
        };

        const velocityLayer = L.velocityLayer(velocityOptions);
        velocityLayer.addTo(map);
        velocityLayerRef.current = velocityLayer;

        requestAnimationFrame(() => {
          const canvas = map.getContainer().querySelector('canvas.leaflet-layer');
          if (canvas) canvas.style.pointerEvents = 'none';
        });
      } catch (error) {
        console.error('Error creating velocity layer:', error);
      }
    }

    // Cleanup function
    return () => {
      if (velocityLayerRef.current && map) {
        try {
          map.removeLayer(velocityLayerRef.current);
        } catch (error) {
          console.error('Error removing velocity layer:', error);
        }
        velocityLayerRef.current = null;
      }
    };
  }, [map, velocityData, showWindAnimation, opacity, maxVelocity, velocityScale, particleMultiplier, particleAge, frameRate, lineWidth]);

  return null;
};

export default WindOverlay;