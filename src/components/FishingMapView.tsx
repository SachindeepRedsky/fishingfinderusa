import React, { useEffect, useRef, useState, useCallback } from 'react';
import { FishingSpot } from '@/data/fishingSpots';
import { spotCoordinates, calculateDistance, formatDistance } from '@/data/spotCoordinates';
import { MapPin, Navigation, Loader2, AlertCircle, Minus, Plus, Locate } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Declare global Leaflet types
declare const L: any;

interface FishingMapViewProps {
  spots: FishingSpot[];
  onSelectSpot: (spot: FishingSpot) => void;
  favorites: number[];
}

// Color mapping for water types
const typeColors: Record<string, string> = {
  lake: '#3b82f6',      // blue
  river: '#22c55e',     // green
  ocean: '#06b6d4',     // cyan
  dam: '#475569',       // slate
  private: '#a855f7',   // purple
  'pay-lake': '#f59e0b', // amber
};

const typeLabels: Record<string, string> = {
  lake: 'Lake',
  river: 'River',
  ocean: 'Ocean/Bay',
  dam: 'Dam',
  private: 'Private',
  'pay-lake': 'Pay Lake',
};

// Create a custom colored marker icon
function createMarkerIcon(type: string, isFavorite: boolean): any {
  const color = typeColors[type] || '#6b7280';
  const borderColor = isFavorite ? '#ef4444' : '#ffffff';
  const size = isFavorite ? 14 : 12;
  const outerSize = size + 8;

  return L.divIcon({
    className: 'custom-fishing-marker',
    html: `
      <div style="
        width: ${outerSize}px;
        height: ${outerSize}px;
        border-radius: 50%;
        background: ${color};
        border: 3px solid ${borderColor};
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        cursor: pointer;
        transition: transform 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
      " onmouseover="this.style.transform='scale(1.3)'" onmouseout="this.style.transform='scale(1)'">
        ${isFavorite ? '<svg width="8" height="8" viewBox="0 0 24 24" fill="#ef4444" stroke="white" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' : ''}
      </div>
    `,
    iconSize: [outerSize, outerSize],
    iconAnchor: [outerSize / 2, outerSize / 2],
    popupAnchor: [0, -(outerSize / 2 + 4)],
  });
}

const FishingMapView: React.FC<FishingMapViewProps> = ({ spots, onSelectSpot, favorites }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Request user location
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }

    setLocationLoading(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserLocation(loc);
        setLocationLoading(false);

        // Add/update user marker on map
        if (mapRef.current) {
          if (userMarkerRef.current) {
            userMarkerRef.current.setLatLng([loc.lat, loc.lng]);
          } else {
            const userIcon = L.divIcon({
              className: 'user-location-marker',
              html: '<div class="user-location-pulse"></div>',
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            });
            userMarkerRef.current = L.marker([loc.lat, loc.lng], { icon: userIcon, zIndexOffset: 1000 })
              .addTo(mapRef.current)
              .bindPopup('<div style="color: #1e293b; font-weight: 600; text-align: center;">Your Location</div>');
          }
          mapRef.current.setView([loc.lat, loc.lng], 7, { animate: true });
        }
      },
      (error) => {
        setLocationLoading(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError('Location permission denied');
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError('Location unavailable');
            break;
          case error.TIMEOUT:
            setLocationError('Location request timed out');
            break;
          default:
            setLocationError('Unable to get location');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Check if Leaflet is loaded
    if (typeof L === 'undefined') {
      console.error('Leaflet not loaded');
      return;
    }

    const map = L.map(mapContainerRef.current, {
      center: [39.8283, -98.5795], // Center of US
      zoom: 4,
      minZoom: 3,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: true,
    });

    // Dark-themed tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map);

    // Custom zoom control position
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    mapRef.current = map;
    setMapReady(true);

    // Request location on mount
    requestLocation();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        setMapReady(false);
      }
    };
  }, []);

  // Update markers when spots or favorites change
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    // Remove existing markers
    if (markersRef.current) {
      mapRef.current.removeLayer(markersRef.current);
    }

    // Create marker cluster group
    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: (cluster: any) => {
        const count = cluster.getChildCount();
        let size = 'small';
        if (count > 20) size = 'large';
        else if (count > 10) size = 'medium';

        return L.divIcon({
          html: `<div><span>${count}</span></div>`,
          className: `marker-cluster marker-cluster-${size}`,
          iconSize: L.point(40, 40),
        });
      },
    });

    spots.forEach((spot) => {
      const coords = spot.latitude && spot.longitude ? { lat: spot.latitude, lng: spot.longitude } : null;
      if (!coords) return;

      const isFavorite = favorites.includes(spot.id);
      const icon = createMarkerIcon(spot.type, isFavorite);

      const distanceText = userLocation
        ? formatDistance(calculateDistance(userLocation.lat, userLocation.lng, coords.lat, coords.lng))
        : null;

      const seasonColor = spot.bestSeason.toLowerCase().includes('spring')
        ? '#4ade80'
        : spot.bestSeason.toLowerCase().includes('summer')
        ? '#facc15'
        : spot.bestSeason.toLowerCase().includes('fall')
        ? '#fb923c'
        : spot.bestSeason.toLowerCase().includes('winter')
        ? '#93c5fd'
        : '#93c5fd';

      const typeColor = typeColors[spot.type] || '#6b7280';

      const popupContent = `
        <div style="min-width: 220px; max-width: 280px;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
            <span style="
              display: inline-flex;
              align-items: center;
              gap: 4px;
              background: ${typeColor};
              color: white;
              font-size: 11px;
              font-weight: 600;
              padding: 2px 8px;
              border-radius: 9999px;
            ">${typeLabels[spot.type] || spot.type}</span>
            ${isFavorite ? '<span style="color: #ef4444; font-size: 12px;">&#9829; Saved</span>' : ''}
          </div>
          <h3 style="font-size: 16px; font-weight: 700; color: white; margin: 0 0 4px 0; line-height: 1.3;">${spot.name}</h3>
          <p style="font-size: 12px; color: #94a3b8; margin: 0 0 8px 0; display: flex; align-items: center; gap: 4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            ${spot.state}
            ${distanceText ? `<span style="color: #60a5fa; font-weight: 500; margin-left: 4px;">(${distanceText})</span>` : ''}
          </p>
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
            <span style="font-size: 11px; color: #94a3b8;">Best Season:</span>
            <span style="font-size: 12px; font-weight: 600; color: ${seasonColor};">${spot.bestSeason}</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px;">
            ${spot.fish
              .slice(0, 4)
              .map(
                (f) =>
                  `<span style="font-size: 10px; color: #93c5fd; border: 1px solid rgba(96,165,250,0.3); padding: 1px 6px; border-radius: 9999px;">${f}</span>`
              )
              .join('')}
            ${spot.fish.length > 4 ? `<span style="font-size: 10px; color: #93c5fd; border: 1px solid rgba(96,165,250,0.3); padding: 1px 6px; border-radius: 9999px;">+${spot.fish.length - 4}</span>` : ''}
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);">
            <span style="font-size: 12px; color: #4ade80; font-weight: 500;">${spot.cost}</span>
            <button
              onclick="window.__openSpotDetail(${spot.id})"
              style="
                background: #3b82f6;
                color: white;
                border: none;
                padding: 6px 14px;
                border-radius: 8px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.2s;
              "
              onmouseover="this.style.background='#2563eb'"
              onmouseout="this.style.background='#3b82f6'"
            >View Details</button>
          </div>
        </div>
      `;

      const marker = L.marker([coords.lat, coords.lng], { icon })
        .bindPopup(popupContent, {
          className: 'fishing-map-popup',
          maxWidth: 300,
          closeButton: true,
        });

      clusterGroup.addLayer(marker);
    });

    mapRef.current.addLayer(clusterGroup);
    markersRef.current = clusterGroup;

  }, [spots, favorites, userLocation, mapReady]);

  // Set up global callback for popup "View Details" button
  useEffect(() => {
    (window as any).__openSpotDetail = (spotId: number) => {
      const spot = spots.find((s) => s.id === spotId);
      if (spot) {
        onSelectSpot(spot);
      }
    };

    return () => {
      delete (window as any).__openSpotDetail;
    };
  }, [spots, onSelectSpot]);

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();
  const handleCenterUS = () => mapRef.current?.setView([39.8283, -98.5795], 4, { animate: true });

  return (
    <div className="relative w-full" style={{ height: 'calc(100vh - 200px)', minHeight: '500px' }}>
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full rounded-xl overflow-hidden border border-white/10" />

      {/* Map Controls Overlay */}
      <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2">
        {/* Location Button */}
        <Button
          onClick={requestLocation}
          disabled={locationLoading}
          size="sm"
          className="bg-slate-800/90 backdrop-blur-sm border border-white/20 hover:bg-slate-700/90 text-white shadow-lg gap-2 w-10 md:w-full"
        >
          {locationLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Navigation className="w-4 h-4" />
          )}
          <span className="hidden md:inline">{userLocation ? 'Update Location' : 'My Location'}</span>
        </Button>

        {/* Center US Button */}
        <Button
          onClick={handleCenterUS}
          size="sm"
          className="bg-slate-800/90 backdrop-blur-sm border border-white/20 hover:bg-slate-700/90 text-white shadow-lg gap-2 w-10 md:w-full"
        >
          <Locate className="w-4 h-4" />
          <span className="hidden md:inline">Center US</span>
        </Button>

        {/* Location Status */}
        {locationError && (
          <div className="bg-red-900/80 backdrop-blur-sm border border-red-500/30 rounded-lg px-3 py-2 flex items-center gap-2 max-w-[200px]">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
            <span className="text-red-200 text-xs">{locationError}</span>
          </div>
        )}

        {userLocation && (
          <div className="bg-blue-900/80 backdrop-blur-sm border border-blue-500/30 rounded-lg px-3 py-2">
            <span className="text-blue-200 text-xs flex items-center gap-1.5">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              Location active
            </span>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-slate-800/90 backdrop-blur-sm border border-white/20 rounded-xl p-3 shadow-lg">
        <p className="text-white text-xs font-semibold mb-2">Water Types</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {Object.entries(typeColors).map(([type, color]) => (
            <div key={type} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full border-2 border-white/80"
                style={{ backgroundColor: color }}
              />
              <span className="text-gray-300 text-xs">{typeLabels[type] || type}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 pt-2 border-t border-white/10 flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border-2 border-red-400 bg-blue-500 flex items-center justify-center">
            <svg width="6" height="6" viewBox="0 0 24 24" fill="#ef4444" stroke="white" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </div>
          <span className="text-gray-300 text-xs">Favorite</span>
        </div>
      </div>

      {/* Spot Count */}
      <div className="absolute top-4 right-4 z-[1000] bg-slate-800/90 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2 shadow-lg">
        <p className="text-white text-sm font-semibold">
          <span className="text-blue-400">{spots.length}</span> spots on map
        </p>
        {userLocation && (
          <p className="text-gray-400 text-xs mt-0.5">
            Distances shown from your location
          </p>
        )}
      </div>
    </div>
  );
};

export default FishingMapView;
