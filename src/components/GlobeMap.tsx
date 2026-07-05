"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
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

type PointerState = {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
};

type GlobeScene = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  labelRenderer: CSS2DRenderer;
  controls: OrbitControls;
  earthMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  cloudMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshLambertMaterial>;
  markerLayer: THREE.Group;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
  labels: HTMLElement[];
  targetCameraPosition: THREE.Vector3 | null;
  animationId: number | null;
};

const GLOBE_RADIUS = 1;
const BASE_VIEW: GeoPoint = { latitude: 14, longitude: 18 };
const INITIAL_DISTANCE = 2.65;
const MIN_DISTANCE = 1.72;
const MAX_DISTANCE = 3.55;
const ZOOM_DISTANCE_STEP = 0.24;
const POINTER_MOVE_TOLERANCE = 7;
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const EARTH_TEXTURE = "/globe/earth_atmos_2048.jpg";
const CLOUD_TEXTURE = "/globe/earth_clouds_1024.png";

const markerColors = {
  guess: 0xf0b65a,
  answer: 0xff5a5f,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function latLngToVector(point: GeoPoint, radius = GLOBE_RADIUS): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - point.latitude);
  const theta = THREE.MathUtils.degToRad(point.longitude + 180);

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function vectorToLatLng(vector: THREE.Vector3): GeoPoint {
  const normalized = vector.clone().normalize();
  const latitude = THREE.MathUtils.radToDeg(Math.asin(clamp(normalized.y, -1, 1)));
  const longitude = THREE.MathUtils.radToDeg(Math.atan2(normalized.z, -normalized.x)) - 180;

  return normalizePoint({ latitude, longitude });
}

function zoomPercentForDistance(distance: number): number {
  return Math.round((INITIAL_DISTANCE / distance) * 100);
}

function cameraPositionForPoint(point: GeoPoint, distance = INITIAL_DISTANCE): THREE.Vector3 {
  return latLngToVector(point, distance);
}

function revealCameraPosition(answer: GeoPoint, selectedGuess: GeoPoint | null, distance: number): THREE.Vector3 {
  const answerNormal = latLngToVector(answer).normalize();
  const revealDistance = Math.max(distance, 3.15);

  if (!selectedGuess) {
    return answerNormal.multiplyScalar(revealDistance);
  }

  const guessNormal = latLngToVector(selectedGuess).normalize();
  const angle = answerNormal.angleTo(guessNormal);
  const focusNormal =
    angle < THREE.MathUtils.degToRad(125)
      ? answerNormal.clone().multiplyScalar(2.6).add(guessNormal.multiplyScalar(0.25)).normalize()
      : answerNormal;

  return focusNormal.multiplyScalar(revealDistance);
}

function isBaseView(scene: GlobeScene): boolean {
  const basePosition = cameraPositionForPoint(BASE_VIEW, INITIAL_DISTANCE);
  return (
    Math.abs(scene.camera.position.length() - INITIAL_DISTANCE) < 0.015 &&
    scene.camera.position.clone().normalize().angleTo(basePosition.normalize()) < 0.015
  );
}

function materialList(material: THREE.Material | THREE.Material[]): THREE.Material[] {
  return Array.isArray(material) ? material : [material];
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry.dispose();
      materialList(child.material).forEach((material) => material.dispose());
    }

    if (child instanceof CSS2DObject) {
      child.element.remove();
    }
  });
}

function createMarker(point: GeoPoint, label: string, tone: "guess" | "answer"): THREE.Group {
  const color = markerColors[tone];
  const colorObject = new THREE.Color(color);
  const normal = latLngToVector(point).normalize();
  const marker = new THREE.Group();
  marker.position.copy(normal.clone().multiplyScalar(GLOBE_RADIUS + 0.014));
  marker.quaternion.setFromUnitVectors(Z_AXIS, normal);
  marker.userData.normal = normal;

  const glowMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: tone === "guess" ? 0.16 : 0.18,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const glow = new THREE.Mesh(new THREE.RingGeometry(0.018, 0.032, 40), glowMaterial);
  glow.name = "pulse";
  marker.add(glow);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.012, 0.019, 40),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    }),
  );
  ring.position.z = 0.002;
  marker.add(ring);

  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(tone === "answer" ? 0.017 : 0.015, 20, 12),
    new THREE.MeshStandardMaterial({
      color,
      emissive: colorObject,
      emissiveIntensity: tone === "answer" ? 0.72 : 0.58,
      roughness: 0.28,
      metalness: 0.08,
    }),
  );
  dot.position.z = 0.018;
  marker.add(dot);

  const labelElement = document.createElement("div");
  labelElement.className = `globe-marker-label globe-marker-label-${tone}`;
  labelElement.textContent = label;
  const labelObject = new CSS2DObject(labelElement);
  labelObject.position.z = 0.066;
  labelObject.center.set(0.5, 1.12);
  marker.add(labelObject);

  return marker;
}

function greatCirclePoint(start: THREE.Vector3, end: THREE.Vector3, amount: number): THREE.Vector3 {
  const omega = Math.acos(clamp(start.dot(end), -1, 1));

  if (omega < 0.0001) {
    return start.clone().lerp(end, amount).normalize();
  }

  const sinOmega = Math.sin(omega);
  const startWeight = Math.sin((1 - amount) * omega) / sinOmega;
  const endWeight = Math.sin(amount * omega) / sinOmega;

  return start
    .clone()
    .multiplyScalar(startWeight)
    .add(end.clone().multiplyScalar(endWeight))
    .normalize();
}

function createArc(from: GeoPoint, to: GeoPoint): THREE.Mesh | null {
  const start = latLngToVector(from).normalize();
  const end = latLngToVector(to).normalize();
  const angle = start.angleTo(end);

  if (angle < 0.002) {
    return null;
  }

  const lift = clamp(angle / Math.PI, 0.16, 0.46);
  const points = Array.from({ length: 72 }, (_, index) => {
    const amount = index / 71;
    const altitude = GLOBE_RADIUS + 0.035 + Math.sin(Math.PI * amount) * lift;
    return greatCirclePoint(start, end, amount).multiplyScalar(altitude);
  });

  const curve = new THREE.CatmullRomCurve3(points);
  const arc = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 96, 0.0038, 8, false),
    new THREE.MeshBasicMaterial({
      color: markerColors.guess,
      transparent: true,
      opacity: 0.76,
      depthWrite: false,
    }),
  );
  arc.renderOrder = 4;
  return arc;
}

function clearMarkers(scene: GlobeScene) {
  scene.labels.forEach((label) => label.remove());
  scene.labels = [];

  for (const child of [...scene.markerLayer.children]) {
    scene.markerLayer.remove(child);
    disposeObject(child);
  }
}

function addMarker(scene: GlobeScene, marker: THREE.Group) {
  marker.traverse((child) => {
    if (child instanceof CSS2DObject) {
      scene.labels.push(child.element);
    }
  });
  scene.markerLayer.add(marker);
}

function updateMarkerVisibility(scene: GlobeScene) {
  const cameraPosition = scene.camera.position.clone();

  scene.markerLayer.children.forEach((marker) => {
    const normal = marker.userData.normal as THREE.Vector3 | undefined;
    if (!normal) {
      return;
    }

    const toCamera = cameraPosition.clone().sub(marker.position).normalize();
    const visible = normal.dot(toCamera) > -0.015;

    marker.traverse((child) => {
      if (child instanceof CSS2DObject) {
        child.element.classList.toggle("is-hidden", !visible);
      }
    });
  });
}

function resizeScene(host: HTMLDivElement, scene: GlobeScene) {
  const { width, height } = host.getBoundingClientRect();
  const nextWidth = Math.max(320, Math.round(width));
  const nextHeight = Math.max(320, Math.round(height));
  const mobile = window.matchMedia("(max-width: 760px)").matches;
  const maxPixelRatio = mobile ? 1.35 : 1.75;

  scene.camera.aspect = nextWidth / nextHeight;
  scene.camera.updateProjectionMatrix();
  scene.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
  scene.renderer.setSize(nextWidth, nextHeight, false);
  scene.labelRenderer.setSize(nextWidth, nextHeight);
}

function setCameraDistance(scene: GlobeScene, distance: number) {
  const nextDistance = clamp(distance, MIN_DISTANCE, MAX_DISTANCE);
  scene.camera.position.setLength(nextDistance);
  scene.camera.updateProjectionMatrix();
  scene.controls.update();
}

function buildScene(host: HTMLDivElement): GlobeScene {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x050808, 4.6, 7.8);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 24);
  camera.position.copy(cameraPositionForPoint(BASE_VIEW));

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: !window.matchMedia("(max-width: 760px)").matches,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = "globe-canvas";

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = "globe-label-renderer";

  host.appendChild(renderer.domElement);
  host.appendChild(labelRenderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.045;
  controls.enablePan = false;
  controls.enableZoom = true;
  controls.minDistance = MIN_DISTANCE;
  controls.maxDistance = MAX_DISTANCE;
  controls.rotateSpeed = 0.26;
  controls.zoomSpeed = 0.52;
  controls.target.set(0, 0, 0);
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
  controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;

  const textureLoader = new THREE.TextureLoader();
  const earthTexture = textureLoader.load(EARTH_TEXTURE);
  earthTexture.colorSpace = THREE.SRGBColorSpace;
  earthTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);

  const cloudTexture = textureLoader.load(CLOUD_TEXTURE);
  cloudTexture.colorSpace = THREE.SRGBColorSpace;
  cloudTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);

  const mobile = window.matchMedia("(max-width: 760px)").matches;
  const segments = mobile ? 72 : 96;
  const earthMesh = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS, segments, segments / 2),
    new THREE.MeshStandardMaterial({
      map: earthTexture,
      color: 0xbfeee6,
      emissive: 0x06201e,
      emissiveIntensity: 0.1,
      metalness: 0.02,
      roughness: 0.82,
    }),
  );
  earthMesh.name = "earth";
  scene.add(earthMesh);

  const cloudMesh = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS + 0.007, Math.max(48, segments - 16), Math.max(24, segments / 2 - 8)),
    new THREE.MeshLambertMaterial({
      map: cloudTexture,
      color: 0xdff6f0,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    }),
  );
  cloudMesh.name = "clouds";
  scene.add(cloudMesh);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS + 0.055, 72, 36),
    new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;

        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;

        void main() {
          float intensity = pow(0.64 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.25);
          gl_FragColor = vec4(0.22, 0.86, 0.75, clamp(intensity, 0.0, 0.46));
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    }),
  );
  atmosphere.name = "atmosphere";
  scene.add(atmosphere);

  const markerLayer = new THREE.Group();
  scene.add(markerLayer);

  scene.add(new THREE.AmbientLight(0x7fead8, 0.42));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
  keyLight.position.set(3.2, 2.4, 4.6);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x39d7bb, 1.35);
  rimLight.position.set(-4.2, 0.9, -2.4);
  scene.add(rimLight);

  const sceneHandle: GlobeScene = {
    scene,
    camera,
    renderer,
    labelRenderer,
    controls,
    earthMesh,
    cloudMesh,
    markerLayer,
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2(),
    labels: [],
    targetCameraPosition: null,
    animationId: null,
  };

  resizeScene(host, sceneHandle);
  return sceneHandle;
}

export function GlobeMap({
  answer,
  answerLabel,
  selectedGuess,
  revealed,
  disabled,
  onSelect,
}: GlobeMapProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<GlobeScene | null>(null);
  const pointerRef = useRef<PointerState | null>(null);
  const onSelectRef = useRef(onSelect);
  const disabledRef = useRef(disabled);
  const [webglFailed, setWebglFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(() => zoomPercentForDistance(INITIAL_DISTANCE));
  const [viewIsBase, setViewIsBase] = useState(true);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    let globeScene: GlobeScene;
    let resizeObserver: ResizeObserver | null = null;
    let disposed = false;

    try {
      globeScene = buildScene(host);
    } catch {
      setWebglFailed(true);
      return;
    }

    sceneRef.current = globeScene;
    setReady(true);

    let lastZoom = zoomPercentForDistance(globeScene.camera.position.length());
    let lastViewIsBase = isBaseView(globeScene);
    let pendingControlsUiFrame: number | null = null;

    const updateControlsUi = () => {
      if (pendingControlsUiFrame !== null) {
        return;
      }

      pendingControlsUiFrame = window.requestAnimationFrame(() => {
        pendingControlsUiFrame = null;
        const nextZoom = zoomPercentForDistance(globeScene.camera.position.length());
        const nextViewIsBase = isBaseView(globeScene);

        if (nextZoom !== lastZoom) {
          lastZoom = nextZoom;
          setZoomPercent(nextZoom);
        }

        if (nextViewIsBase !== lastViewIsBase) {
          lastViewIsBase = nextViewIsBase;
          setViewIsBase(nextViewIsBase);
        }
      });
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      pointerRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };

      try {
        globeScene.renderer.domElement.setPointerCapture(event.pointerId);
      } catch {
        // Safari can reject capture if OrbitControls has already released the pointer.
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      const pointer = pointerRef.current;
      if (!pointer || pointer.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - pointer.startX;
      const deltaY = event.clientY - pointer.startY;
      if (Math.hypot(deltaX, deltaY) > POINTER_MOVE_TOLERANCE) {
        pointer.moved = true;
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      const pointer = pointerRef.current;
      pointerRef.current = null;

      if (!pointer || pointer.pointerId !== event.pointerId) {
        return;
      }

      try {
        globeScene.renderer.domElement.releasePointerCapture(event.pointerId);
      } catch {
        // The pointer may have been cancelled by the browser gesture recognizer.
      }

      if (pointer.moved || disabledRef.current) {
        return;
      }

      const rect = globeScene.renderer.domElement.getBoundingClientRect();
      globeScene.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      globeScene.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      globeScene.raycaster.setFromCamera(globeScene.pointer, globeScene.camera);

      const [hit] = globeScene.raycaster.intersectObject(globeScene.earthMesh, false);
      if (!hit) {
        return;
      }

      const localPoint = globeScene.earthMesh.worldToLocal(hit.point.clone()).normalize();
      onSelectRef.current(vectorToLatLng(localPoint));
    };

    const handlePointerCancel = () => {
      pointerRef.current = null;
    };

    const canvas = globeScene.renderer.domElement;
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerCancel);
    globeScene.controls.addEventListener("change", updateControlsUi);

    resizeObserver = new ResizeObserver(() => resizeScene(host, globeScene));
    resizeObserver.observe(host);

    const clock = new THREE.Clock();
    const render = () => {
      if (disposed) {
        return;
      }

      const elapsed = clock.getElapsedTime();
      globeScene.cloudMesh.rotation.y = elapsed * 0.012;

      globeScene.markerLayer.traverse((child) => {
        if (child.name === "pulse") {
          const scale = 1 + Math.sin(elapsed * 2.1) * 0.055;
          child.scale.setScalar(scale);
        }
      });

      if (globeScene.targetCameraPosition) {
        globeScene.camera.position.lerp(globeScene.targetCameraPosition, 0.075);
        if (globeScene.camera.position.distanceTo(globeScene.targetCameraPosition) < 0.012) {
          globeScene.camera.position.copy(globeScene.targetCameraPosition);
          globeScene.targetCameraPosition = null;
        }
      }

      globeScene.controls.update();
      updateMarkerVisibility(globeScene);
      globeScene.renderer.render(globeScene.scene, globeScene.camera);
      globeScene.labelRenderer.render(globeScene.scene, globeScene.camera);
      globeScene.animationId = window.requestAnimationFrame(render);
    };

    render();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerCancel);
      globeScene.controls.removeEventListener("change", updateControlsUi);
      globeScene.controls.dispose();

      if (pendingControlsUiFrame !== null) {
        window.cancelAnimationFrame(pendingControlsUiFrame);
      }

      if (globeScene.animationId !== null) {
        window.cancelAnimationFrame(globeScene.animationId);
      }

      clearMarkers(globeScene);
      globeScene.scene.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
          child.geometry.dispose();
          materialList(child.material).forEach((material) => material.dispose());
        }
      });
      globeScene.earthMesh.material.map?.dispose();
      globeScene.cloudMesh.material.map?.dispose();
      globeScene.renderer.dispose();
      globeScene.renderer.domElement.remove();
      globeScene.labelRenderer.domElement.remove();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const globeScene = sceneRef.current;
    if (!globeScene) {
      return;
    }

    clearMarkers(globeScene);

    if (selectedGuess) {
      addMarker(globeScene, createMarker(selectedGuess, "Guess", "guess"));
    }

    if (revealed) {
      addMarker(globeScene, createMarker(answer, answerLabel, "answer"));

      if (selectedGuess) {
        const arc = createArc(selectedGuess, answer);
        if (arc) {
          globeScene.markerLayer.add(arc);
        }
      }
    }
  }, [
    answer.latitude,
    answer.longitude,
    answerLabel,
    revealed,
    selectedGuess?.latitude,
    selectedGuess?.longitude,
  ]);

  useEffect(() => {
    const globeScene = sceneRef.current;
    if (globeScene && revealed) {
      const targetPosition = revealCameraPosition(answer, selectedGuess, globeScene.camera.position.length());
      globeScene.targetCameraPosition = targetPosition;
      setZoomPercent(zoomPercentForDistance(targetPosition.length()));
      setViewIsBase(false);
    }
  }, [answer.latitude, answer.longitude, revealed, selectedGuess?.latitude, selectedGuess?.longitude]);

  function changeZoom(direction: "in" | "out") {
    const globeScene = sceneRef.current;
    if (!globeScene) {
      return;
    }

    const distanceDelta = direction === "in" ? -ZOOM_DISTANCE_STEP : ZOOM_DISTANCE_STEP;
    setCameraDistance(globeScene, globeScene.camera.position.length() + distanceDelta);
    setZoomPercent(zoomPercentForDistance(globeScene.camera.position.length()));
    setViewIsBase(isBaseView(globeScene));
  }

  function resetView() {
    const globeScene = sceneRef.current;
    if (!globeScene) {
      return;
    }

    globeScene.targetCameraPosition = null;
    globeScene.camera.position.copy(cameraPositionForPoint(BASE_VIEW, INITIAL_DISTANCE));
    globeScene.controls.target.set(0, 0, 0);
    globeScene.controls.update();
    setZoomPercent(zoomPercentForDistance(INITIAL_DISTANCE));
    setViewIsBase(true);
  }

  if (webglFailed) {
    return (
      <div className="globe-fallback">
        <p>3D globe failed to load. Use the coordinate controls to place a guess.</p>
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

  const canZoomIn = zoomPercent < zoomPercentForDistance(MIN_DISTANCE);
  const canZoomOut = zoomPercent > zoomPercentForDistance(MAX_DISTANCE);
  const atResetView = viewIsBase;

  return (
    <div className={["globe-frame", ready ? "is-ready" : ""].join(" ")}>
      {!ready ? (
        <div className="globe-loading" aria-hidden="true">
          Loading globe
        </div>
      ) : null}
      <div
        className="globe-canvas-host"
        ref={hostRef}
        role="img"
        aria-label="Interactive 3D Earth globe. Drag to rotate, scroll or use the buttons to zoom, and click to place a location guess."
      />
      <div className="globe-depth-cue" aria-hidden="true" />
      <div className="globe-zoom-controls" aria-label="Globe zoom controls">
        <button
          type="button"
          className="globe-zoom-button"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={!canZoomOut}
          onClick={() => changeZoom("out")}
        >
          <Minus aria-hidden="true" size={17} />
        </button>
        <output className="globe-zoom-value" aria-live="polite">
          {zoomPercent}%
        </output>
        <button
          type="button"
          className="globe-zoom-button"
          aria-label="Zoom in"
          title="Zoom in"
          disabled={!canZoomIn}
          onClick={() => changeZoom("in")}
        >
          <Plus aria-hidden="true" size={17} />
        </button>
        <button
          type="button"
          className="globe-zoom-button"
          aria-label="Reset globe view"
          title="Reset view"
          disabled={atResetView}
          onClick={resetView}
        >
          <RotateCcw aria-hidden="true" size={16} />
        </button>
      </div>
    </div>
  );
}
