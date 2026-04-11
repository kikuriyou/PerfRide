'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import polyline from '@mapbox/polyline';
import { ExploreSegment, getClimbCategoryLabel } from '@/lib/strava';
import 'leaflet/dist/leaflet.css';

interface SegmentMapProps {
  onSegmentSelect: (segment: ExploreSegment) => void;
}

// Distance filter options
const DISTANCE_OPTIONS = [
  { value: 100, label: '100m+' },
  { value: 500, label: '500m+' },
  { value: 1000, label: '1km+' },
  { value: 2000, label: '2km+' },
  { value: 5000, label: '5km+' },
];

// Category filter options
const CATEGORY_OPTIONS = [
  { value: 0, label: 'すべて' },
  { value: 1, label: 'Cat4+' },
  { value: 2, label: 'Cat3+' },
  { value: 3, label: 'Cat2+' },
  { value: 4, label: 'Cat1+' },
  { value: 5, label: 'HCのみ' },
];

// Component to handle map movement and segment loading
function MapController({
  onBoundsChange,
  onZoomChange,
}: {
  onBoundsChange: (bounds: [number, number, number, number]) => void;
  onZoomChange: (zoom: number) => void;
}) {
  const map = useMapEvents({
    moveend: () => {
      const bounds = map.getBounds();
      onBoundsChange([bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()]);
      onZoomChange(map.getZoom());
    },
    zoomend: () => {
      onZoomChange(map.getZoom());
    },
  });
  return null;
}

// Component to set initial view
function SetViewOnLoad({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 12);
  }, [center, map]);
  return null;
}

// Simplify polyline by reducing number of points
function simplifyPolyline(
  points: [number, number][],
  tolerance: number = 0.0001,
): [number, number][] {
  if (points.length <= 2) return points;

  const result: [number, number][] = [points[0]];
  let lastPoint = points[0];

  for (let i = 1; i < points.length - 1; i++) {
    const point = points[i];
    const dist = Math.sqrt(
      Math.pow(point[0] - lastPoint[0], 2) + Math.pow(point[1] - lastPoint[1], 2),
    );
    if (dist > tolerance) {
      result.push(point);
      lastPoint = point;
    }
  }

  result.push(points[points.length - 1]);
  return result;
}

// Get minimum distance based on zoom level
function getZoomBasedMinDistance(zoom: number, userMinDistance: number): number {
  // At low zoom levels (zoomed out), require longer segments
  if (zoom <= 9) return Math.max(userMinDistance, 5000);
  if (zoom <= 10) return Math.max(userMinDistance, 3000);
  if (zoom <= 11) return Math.max(userMinDistance, 2000);
  if (zoom <= 12) return Math.max(userMinDistance, 1000);
  return userMinDistance;
}

export default function SegmentMap({ onSegmentSelect }: SegmentMapProps) {
  const [segments, setSegments] = useState<ExploreSegment[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<ExploreSegment | null>(null);
  const [loading, setLoading] = useState(false);
  const [center, setCenter] = useState<[number, number]>([35.3606, 138.7274]); // Mt. Fuji default
  const [searchQuery, setSearchQuery] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(12);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Filter settings
  const [minDistance, setMinDistance] = useState(1000);
  const [minCategory, setMinCategory] = useState(0);

  // Calculate effective minimum distance based on zoom
  const effectiveMinDistance = useMemo(() => {
    return getZoomBasedMinDistance(zoomLevel, minDistance);
  }, [zoomLevel, minDistance]);

  // Filter segments based on user settings and zoom level
  const filteredSegments = useMemo(() => {
    return segments.filter((seg) => {
      // Distance filter (including zoom-based adjustment)
      if (seg.distance < effectiveMinDistance) return false;
      // Category filter
      if (seg.climb_category < minCategory) return false;
      return true;
    });
  }, [segments, effectiveMinDistance, minCategory]);

  const fetchSegments = async (bounds: [number, number, number, number]) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const [south, west, north, east] = bounds;
        const lat = (south + north) / 2;
        const lng = (west + east) / 2;
        const radius = Math.max(north - south, east - west) / 2;

        const res = await fetch(`/api/segments/explore?lat=${lat}&lng=${lng}&radius=${radius}`);
        const data = await res.json();

        if (data.segments) {
          setSegments(data.segments);
        }
      } catch (e) {
        console.error('Failed to fetch segments:', e);
      } finally {
        setLoading(false);
      }
    }, 750);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();

      if (data.results && data.results.length > 0) {
        const { lat, lng } = data.results[0];
        setCenter([lat, lng]);
      }
    } catch (e) {
      console.error('Geocoding failed:', e);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleSegmentClick = (segment: ExploreSegment) => {
    setSelectedSegment(segment);
  };

  const handleConfirmSelection = () => {
    if (selectedSegment) {
      onSegmentSelect(selectedSegment);
    }
  };

  // Decode and simplify polyline
  const decodePolyline = (encoded: string): [number, number][] => {
    try {
      const decoded = polyline.decode(encoded);
      return simplifyPolyline(decoded, 0.0002);
    } catch {
      return [];
    }
  };

  // Get color based on climb category
  const getSegmentColor = (category: number, isSelected: boolean): string => {
    if (isSelected) return '#FFD700';
    switch (category) {
      case 5:
        return '#8B0000';
      case 4:
        return '#DC143C';
      case 3:
        return '#FF4500';
      case 2:
        return '#FF8C00';
      case 1:
        return '#FFA500';
      default:
        return '#4CAF50';
    }
  };

  const selectStyle = {
    padding: '0.4rem 0.6rem',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--foreground)',
    fontSize: '0.85rem',
    cursor: 'pointer',
  };

  return (
    <div>
      {/* Search Bar */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="場所を検索 (例: 富士山, ヤビツ峠)"
          style={{
            flex: 1,
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--foreground)',
            fontSize: '0.95rem',
          }}
        />
        <button
          onClick={handleSearch}
          className="btn btn-primary"
          style={{ padding: '0.75rem 1.25rem' }}
        >
          🔍 検索
        </button>
      </div>

      {/* Filter Controls */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          marginBottom: '0.75rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.85rem', opacity: 0.8 }}>距離:</label>
          <select
            value={minDistance}
            onChange={(e) => setMinDistance(Number(e.target.value))}
            style={selectStyle}
          >
            {DISTANCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.85rem', opacity: 0.8 }}>カテゴリ:</label>
          <select
            value={minCategory}
            onChange={(e) => setMinCategory(Number(e.target.value))}
            style={selectStyle}
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>
          {effectiveMinDistance > minDistance && (
            <span>※ ズームアウト時は {effectiveMinDistance / 1000}km+ を表示</span>
          )}
        </div>
      </div>

      {/* Map Container */}
      <div
        style={{
          height: '400px',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          position: 'relative',
        }}
      >
        {loading && (
          <div
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              zIndex: 1000,
              background: 'var(--surface)',
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            読み込み中...
          </div>
        )}
        {/* Segment count indicator */}
        <div
          style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            zIndex: 1000,
            background: 'var(--surface)',
            padding: '0.5rem 0.75rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.8rem',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          {filteredSegments.length} / {segments.length} セグメント
        </div>
        <MapContainer
          center={center}
          zoom={12}
          style={{ height: '100%', width: '100%' }}
          whenReady={() => setMapReady(true)}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <SetViewOnLoad center={center} />
          <MapController onBoundsChange={fetchSegments} onZoomChange={setZoomLevel} />

          {filteredSegments.map((segment) => {
            const positions = decodePolyline(segment.points);
            if (positions.length === 0) return null;

            const isSelected = selectedSegment?.id === segment.id;

            return (
              <Polyline
                key={segment.id}
                positions={positions}
                pathOptions={{
                  color: getSegmentColor(segment.climb_category, isSelected),
                  weight: isSelected ? 5 : 3,
                  opacity: isSelected ? 1 : 0.7,
                }}
                eventHandlers={{
                  click: () => handleSegmentClick(segment),
                }}
              />
            );
          })}
        </MapContainer>
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          marginTop: '0.75rem',
          flexWrap: 'wrap',
          fontSize: '0.8rem',
          opacity: 0.8,
        }}
      >
        <span>カテゴリ:</span>
        <span style={{ color: '#8B0000' }}>● HC</span>
        <span style={{ color: '#DC143C' }}>● Cat1</span>
        <span style={{ color: '#FF4500' }}>● Cat2</span>
        <span style={{ color: '#FF8C00' }}>● Cat3</span>
        <span style={{ color: '#FFA500' }}>● Cat4</span>
        <span style={{ color: '#4CAF50' }}>● NC</span>
      </div>

      {/* Selected Segment Info */}
      {selectedSegment && (
        <div
          style={{
            marginTop: '1rem',
            padding: '1rem',
            background: 'var(--surface)',
            borderRadius: 'var(--radius-lg)',
            border: '2px solid var(--primary)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '0.75rem',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{selectedSegment.name}</h3>
              {selectedSegment.climb_category > 0 && (
                <span
                  style={{
                    display: 'inline-block',
                    background: getSegmentColor(selectedSegment.climb_category, false),
                    color: 'white',
                    padding: '0.15rem 0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    marginTop: '0.25rem',
                  }}
                >
                  {getClimbCategoryLabel(selectedSegment.climb_category)}
                </span>
              )}
            </div>
            <button
              onClick={handleConfirmSelection}
              className="btn btn-primary"
              style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
            >
              このセグメントでシミュレート →
            </button>
          </div>
          <div
            style={{
              display: 'flex',
              gap: '1.5rem',
              fontSize: '0.9rem',
            }}
          >
            <span>📏 {(selectedSegment.distance / 1000).toFixed(2)} km</span>
            <span>📈 {selectedSegment.avg_grade.toFixed(1)}%</span>
            <span>⬆️ {Math.round(selectedSegment.elev_difference)}m</span>
          </div>
        </div>
      )}

      {/* Instructions */}
      {!selectedSegment && filteredSegments.length > 0 && (
        <p style={{ marginTop: '1rem', fontSize: '0.85rem', opacity: 0.7, textAlign: 'center' }}>
          地図上のセグメント（色付きの線）をクリックして選択
        </p>
      )}
    </div>
  );
}
