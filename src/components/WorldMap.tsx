"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { normalizePoint } from "@/lib/geo";
import type { GeoPoint } from "@/types/historcle";

type WorldMapProps = {
  answer: GeoPoint;
  answerLabel: string;
  selectedGuess: GeoPoint | null;
  revealed: boolean;
  disabled: boolean;
  onSelect: (point: GeoPoint) => void;
};

type LeafletModule = typeof import("leaflet");
type LeafletMap = import("leaflet").Map;
type LeafletMarker = import("leaflet").Marker;
type LeafletPolyline = import("leaflet").Polyline;
type LeafletMouseEvent = import("leaflet").LeafletMouseEvent;

const INITIAL_CENTER: [number, number] = [23, 0];
const INITIAL_ZOOM = 2;
const MIN_ZOOM = 2;
const MAX_ZOOM = 18;
const DEFAULT_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const DEFAULT_LABEL_TILE_URL =
  "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const DEFAULT_TILE_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

const TILE_URL = process.env.NEXT_PUBLIC_HISTORCLE_TILE_URL || DEFAULT_TILE_URL;
const LABEL_TILE_URL = process.env.NEXT_PUBLIC_HISTORCLE_LABEL_TILE_URL || DEFAULT_LABEL_TILE_URL;
const TILE_ATTRIBUTION = process.env.NEXT_PUBLIC_HISTORCLE_TILE_ATTRIBUTION || DEFAULT_TILE_ATTRIBUTION;
const TILE_SUBDOMAINS = process.env.NEXT_PUBLIC_HISTORCLE_TILE_SUBDOMAINS || "";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "'":
        return "&#39;";
      case '"':
        return "&quot;";
      default:
        return character;
    }
  });
}

function toLatLng(point: GeoPoint): [number, number] {
  return [point.latitude, point.longitude];
}

function buildPinIcon(leaflet: LeafletModule, tone: "guess" | "answer", label: string) {
  return leaflet.divIcon({
    className: `historcle-map-pin historcle-map-pin-${tone}`,
    html: `
      <span class="historcle-map-pin-shell" aria-hidden="true">
        <span class="historcle-map-pin-halo"></span>
        <span class="historcle-map-pin-head"></span>
        <span class="historcle-map-pin-tip"></span>
        <span class="historcle-map-pin-label">${escapeHtml(label)}</span>
      </span>
    `,
    iconSize: [34, 48],
    iconAnchor: [17, 44],
  });
}

function CoordinateFallback({
  selectedGuess,
  disabled,
  onSelect,
}: {
  selectedGuess: GeoPoint | null;
  disabled: boolean;
  onSelect: (point: GeoPoint) => void;
}) {
  return (
    <div className="map-fallback">
      <p>Map failed to load. Use the coordinate controls to place a guess.</p>
      <div className="fallback-controls">
        <label>
          Latitude
          <input
            type="range"
            min="-90"
            max="90"
            value={selectedGuess?.latitude ?? 0}
            disabled={disabled}
            onChange={(event) =>
              onSelect({
                latitude: Number(event.target.value),
                longitude: selectedGuess?.longitude ?? 0,
              })
            }
          />
        </label>
        <label>
          Longitude
          <input
            type="range"
            min="-180"
            max="180"
            value={selectedGuess?.longitude ?? 0}
            disabled={disabled}
            onChange={(event) =>
              onSelect({
                latitude: selectedGuess?.latitude ?? 0,
                longitude: Number(event.target.value),
              })
            }
          />
        </label>
      </div>
    </div>
  );
}

export function WorldMap({
  answer,
  answerLabel,
  selectedGuess,
  revealed,
  disabled,
  onSelect,
}: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<LeafletModule | null>(null);
  const guessMarkerRef = useRef<LeafletMarker | null>(null);
  const answerMarkerRef = useRef<LeafletMarker | null>(null);
  const connectionRef = useRef<LeafletPolyline | null>(null);
  const disabledRef = useRef(disabled);
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [zoom, setZoom] = useState(INITIAL_ZOOM);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    import("leaflet")
      .then((leaflet) => {
        if (cancelled) {
          return;
        }

        leafletRef.current = leaflet;

        const map = leaflet.map(container, {
          center: INITIAL_CENTER,
          zoom: INITIAL_ZOOM,
          minZoom: MIN_ZOOM,
          maxZoom: MAX_ZOOM,
          zoomControl: false,
          attributionControl: true,
          preferCanvas: true,
          worldCopyJump: true,
          maxBounds: [
            [-85, -240],
            [85, 240],
          ],
          maxBoundsViscosity: 0.55,
          wheelPxPerZoomLevel: 86,
        });

        leaflet
          .tileLayer(TILE_URL, {
            attribution: TILE_ATTRIBUTION,
            detectRetina: true,
            maxZoom: MAX_ZOOM,
            minZoom: MIN_ZOOM,
            subdomains: TILE_SUBDOMAINS,
          })
          .addTo(map);

        if (LABEL_TILE_URL && LABEL_TILE_URL.toLowerCase() !== "false") {
          map.createPane("historcle-labels");
          const labelPane = map.getPane("historcle-labels");
          if (labelPane) {
            labelPane.style.zIndex = "450";
            labelPane.style.pointerEvents = "none";
          }

          leaflet
            .tileLayer(LABEL_TILE_URL, {
              attribution: "",
              detectRetina: true,
              maxZoom: MAX_ZOOM,
              minZoom: MIN_ZOOM,
              pane: "historcle-labels",
              subdomains: TILE_SUBDOMAINS,
            })
            .addTo(map);
        }

        const handleMapClick = (event: LeafletMouseEvent) => {
          if (disabledRef.current) {
            return;
          }

          onSelectRef.current(
            normalizePoint({
              latitude: event.latlng.lat,
              longitude: event.latlng.lng,
            }),
          );
        };

        const handleZoom = () => setZoom(map.getZoom());

        map.on("click", handleMapClick);
        map.on("zoomend", handleZoom);
        map.on("moveend", handleZoom);

        mapRef.current = map;
        setZoom(map.getZoom());
        setReady(true);

        resizeObserver = new ResizeObserver(() => map.invalidateSize({ debounceMoveend: true }));
        resizeObserver.observe(container);

        window.setTimeout(() => map.invalidateSize(), 0);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadFailed(true);
        }
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
      guessMarkerRef.current = null;
      answerMarkerRef.current = null;
      connectionRef.current = null;
    };
  }, []);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    if (!leaflet || !map || !ready) {
      return;
    }

    if (!selectedGuess) {
      guessMarkerRef.current?.remove();
      guessMarkerRef.current = null;
      return;
    }

    const position = toLatLng(selectedGuess);
    if (!guessMarkerRef.current) {
      guessMarkerRef.current = leaflet
        .marker(position, {
          icon: buildPinIcon(leaflet, "guess", "Guess"),
          keyboard: false,
          riseOnHover: true,
          zIndexOffset: 500,
        })
        .addTo(map);
      return;
    }

    guessMarkerRef.current.setLatLng(position);
  }, [ready, selectedGuess?.latitude, selectedGuess?.longitude]);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    if (!leaflet || !map || !ready) {
      return;
    }

    if (!revealed) {
      answerMarkerRef.current?.remove();
      answerMarkerRef.current = null;
      connectionRef.current?.remove();
      connectionRef.current = null;
      return;
    }

    const answerPosition = toLatLng(answer);
    const answerIcon = buildPinIcon(leaflet, "answer", answerLabel);

    if (!answerMarkerRef.current) {
      answerMarkerRef.current = leaflet
        .marker(answerPosition, {
          icon: answerIcon,
          keyboard: false,
          riseOnHover: true,
          zIndexOffset: 650,
        })
        .addTo(map);
    } else {
      answerMarkerRef.current.setLatLng(answerPosition);
      answerMarkerRef.current.setIcon(answerIcon);
    }

    connectionRef.current?.remove();
    connectionRef.current = null;

    if (selectedGuess) {
      connectionRef.current = leaflet
        .polyline([toLatLng(selectedGuess), answerPosition], {
          color: "#f6bd60",
          dashArray: "9 10",
          lineCap: "round",
          opacity: 0.95,
          weight: 3,
        })
        .addTo(map);
    }
  }, [answer.latitude, answer.longitude, answerLabel, ready, revealed, selectedGuess?.latitude, selectedGuess?.longitude]);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapRef.current;
    if (!leaflet || !map || !ready || !revealed) {
      return;
    }

    const answerPosition = toLatLng(answer);
    if (!selectedGuess) {
      map.flyTo(answerPosition, Math.max(map.getZoom(), 6), { duration: 0.7 });
      return;
    }

    const bounds = leaflet.latLngBounds([toLatLng(selectedGuess), answerPosition]);
    map.flyToBounds(bounds, {
      animate: true,
      duration: 0.85,
      maxZoom: 7,
      padding: [80, 80],
    });
  }, [answer.latitude, answer.longitude, ready, revealed, selectedGuess?.latitude, selectedGuess?.longitude]);

  const zoomIn = useCallback(() => {
    mapRef.current?.zoomIn();
  }, []);

  const zoomOut = useCallback(() => {
    mapRef.current?.zoomOut();
  }, []);

  const resetView = useCallback(() => {
    mapRef.current?.flyTo(INITIAL_CENTER, INITIAL_ZOOM, { duration: 0.55 });
  }, []);

  if (loadFailed) {
    return <CoordinateFallback selectedGuess={selectedGuess} disabled={disabled} onSelect={onSelect} />;
  }

  return (
    <div className={["map-frame", ready ? "is-ready" : ""].join(" ")}>
      {!ready ? (
        <div className="map-loading" aria-hidden="true">
          Loading map
        </div>
      ) : null}
      <div
        ref={containerRef}
        className="world-map"
        role="application"
        aria-label="Interactive flat world map. Scroll or pinch to zoom the map, drag to pan, and click to place a location guess."
      />
      <div className="map-glow" aria-hidden="true" />
      <div className="map-hint" aria-hidden="true">
        Scroll or pinch to zoom • drag to pan • click to pin
      </div>
      <div className="map-zoom-controls" aria-label="Map zoom controls">
        <button
          type="button"
          className="map-zoom-button"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={!ready || zoom <= MIN_ZOOM}
          onClick={zoomOut}
        >
          <Minus aria-hidden="true" size={18} />
        </button>
        <output className="map-zoom-value" aria-live="polite">
          z{zoom.toFixed(0)}
        </output>
        <button
          type="button"
          className="map-zoom-button"
          aria-label="Zoom in"
          title="Zoom in"
          disabled={!ready || zoom >= MAX_ZOOM}
          onClick={zoomIn}
        >
          <Plus aria-hidden="true" size={18} />
        </button>
        <button
          type="button"
          className="map-zoom-button"
          aria-label="Reset map view"
          title="Reset view"
          disabled={!ready || zoom === INITIAL_ZOOM}
          onClick={resetView}
        >
          <RotateCcw aria-hidden="true" size={17} />
        </button>
      </div>
    </div>
  );
}
