"use client";

import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { feature } from "topojson-client";
import worldAtlas from "world-atlas/countries-110m.json";
import { normalizePoint } from "@/lib/geo";
import type { GeoPoint } from "@/types/historcle";

type GlobeMapProps = {
  answer: GeoPoint;
  answerLabel: string;
  selectedGuess: GeoPoint | null;
  revealed: boolean;
  disabled: boolean;
  onSelect: (point: GeoPoint) => void;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  rotation: [number, number];
};

const BASE_ROTATION: [number, number] = [-18, -14];
const MIN_ZOOM = 1;
const MAX_ZOOM = 2.35;
const ZOOM_STEP = 0.25;

const land = feature(
  worldAtlas as never,
  (worldAtlas as { objects: { countries: unknown } }).objects.countries as never,
) as unknown as FeatureCollection<Geometry>;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pointIsVisible(point: GeoPoint, rotation: [number, number]): boolean {
  const center: [number, number] = [-rotation[0], -rotation[1]];
  return geoDistance([point.longitude, point.latitude], center) <= Math.PI / 2 + 0.015;
}

export function GlobeMap({
  answer,
  answerLabel,
  selectedGuess,
  revealed,
  disabled,
  onSelect,
}: GlobeMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [size, setSize] = useState({ width: 640, height: 640 });
  const [rotation, setRotation] = useState<[number, number]>(BASE_ROTATION);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const observer = new ResizeObserver(([entry]) => {
      const rect = entry.contentRect;
      setSize({
        width: Math.max(320, Math.round(rect.width)),
        height: Math.max(320, Math.round(rect.height)),
      });
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (revealed) {
      setRotation([-answer.longitude, -answer.latitude]);
    }
  }, [answer.latitude, answer.longitude, revealed]);

  const globeRadius = useMemo(() => Math.min(size.width, size.height) * 0.455 * zoom, [size, zoom]);

  const projection = useMemo(() => {
    return geoOrthographic()
      .translate([size.width / 2, size.height / 2])
      .scale(globeRadius)
      .rotate(rotation)
      .clipAngle(90)
      .precision(0.4);
  }, [globeRadius, rotation, size.height, size.width]);

  const paths = useMemo(() => {
    try {
      const path = geoPath(projection);
      const spherePath = path({ type: "Sphere" });
      const gridPath = path(geoGraticule10());
      const countryPaths = land.features
        .map((country) => path(country))
        .filter((entry): entry is string => Boolean(entry));
      const revealPath =
        revealed && selectedGuess
          ? path({
              type: "LineString",
              coordinates: [
                [selectedGuess.longitude, selectedGuess.latitude],
                [answer.longitude, answer.latitude],
              ],
            })
          : null;

      return {
        spherePath,
        gridPath,
        countryPaths,
        revealPath,
      };
    } catch {
      return null;
    }
  }, [answer.latitude, answer.longitude, projection, revealed, selectedGuess]);

  function projectPoint(point: GeoPoint | null) {
    if (!point || !pointIsVisible(point, rotation)) {
      return null;
    }

    const projected = projection([point.longitude, point.latitude]);
    return projected ? { x: projected[0], y: projected[1] } : null;
  }

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      rotation,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;

    if (Math.abs(deltaX) + Math.abs(deltaY) < 3) {
      return;
    }

    drag.moved = true;
    setRotation([
      drag.rotation[0] + (deltaX * 0.35) / zoom,
      clamp(drag.rotation[1] - (deltaY * 0.35) / zoom, -78, 78),
    ]);
  }

  function handlePointerUp(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    dragRef.current = null;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);

    if (drag.moved || disabled) {
      return;
    }

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const centerX = size.width / 2;
    const centerY = size.height / 2;
    const insideSphere = (x - centerX) ** 2 + (y - centerY) ** 2 <= globeRadius ** 2;

    if (!insideSphere) {
      return;
    }

    const inverted = projection.invert?.([x, y]);
    if (!inverted) {
      return;
    }

    onSelect(
      normalizePoint({
        longitude: inverted[0],
        latitude: inverted[1],
      }),
    );
  }

  function changeZoom(delta: number) {
    setZoom((currentZoom) => clamp(Number((currentZoom + delta).toFixed(2)), MIN_ZOOM, MAX_ZOOM));
  }

  function resetView() {
    setZoom(1);
    setRotation(BASE_ROTATION);
  }

  function handleWheel(event: React.WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    changeZoom(event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP);
  }

  const guessPoint = projectPoint(selectedGuess);
  const answerPoint = projectPoint(answer);

  if (!paths) {
    return (
      <div className="globe-fallback">
        <p>Map failed to load. Use the coordinate controls to place a guess.</p>
        <div className="fallback-controls">
          <label>
            Latitude
            <input
              type="range"
              min="-90"
              max="90"
              value={selectedGuess?.latitude ?? 0}
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

  return (
    <div className="globe-frame" ref={containerRef}>
      <div className="globe-loading" aria-hidden="true">
        Loading globe
      </div>
      <svg
        ref={svgRef}
        className="globe-svg"
        role="img"
        aria-label="Interactive world globe"
        viewBox={`0 0 ${size.width} ${size.height}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
      >
        <defs>
          <radialGradient id="historcleOcean" cx="36%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#193b36" />
            <stop offset="58%" stopColor="#102421" />
            <stop offset="100%" stopColor="#071112" />
          </radialGradient>
          <filter id="markerGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {paths.spherePath ? <path className="globe-ocean" d={paths.spherePath} /> : null}
        {paths.gridPath ? <path className="globe-grid" d={paths.gridPath} /> : null}
        <g className="globe-land">
          {paths.countryPaths.map((pathData, index) => (
            <path key={`${index}-${pathData.slice(0, 10)}`} d={pathData} />
          ))}
        </g>
        {paths.revealPath ? <path className="globe-reveal-line" d={paths.revealPath} /> : null}

        {guessPoint ? (
          <g className="globe-marker globe-marker-guess" transform={`translate(${guessPoint.x} ${guessPoint.y})`}>
            <circle r="12" />
            <circle r="4" />
            <text y="-18">Guess</text>
          </g>
        ) : null}

        {revealed && answerPoint ? (
          <g
            className="globe-marker globe-marker-answer"
            transform={`translate(${answerPoint.x} ${answerPoint.y})`}
          >
            <circle r="14" />
            <circle r="5" />
            <text y="28">{answerLabel}</text>
          </g>
        ) : null}
      </svg>
      <div className="globe-zoom-controls" aria-label="Globe zoom controls">
        <button
          type="button"
          className="globe-zoom-button"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={zoom <= MIN_ZOOM}
          onClick={() => changeZoom(-ZOOM_STEP)}
        >
          <Minus aria-hidden="true" size={17} />
        </button>
        <output className="globe-zoom-value" aria-live="polite">
          {Math.round(zoom * 100)}%
        </output>
        <button
          type="button"
          className="globe-zoom-button"
          aria-label="Zoom in"
          title="Zoom in"
          disabled={zoom >= MAX_ZOOM}
          onClick={() => changeZoom(ZOOM_STEP)}
        >
          <Plus aria-hidden="true" size={17} />
        </button>
        <button
          type="button"
          className="globe-zoom-button"
          aria-label="Reset globe view"
          title="Reset view"
          disabled={zoom === 1 && rotation[0] === BASE_ROTATION[0] && rotation[1] === BASE_ROTATION[1]}
          onClick={resetView}
        >
          <RotateCcw aria-hidden="true" size={16} />
        </button>
      </div>
    </div>
  );
}
