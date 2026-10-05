"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Flashlight, FlashlightOff, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { vibrateTick } from "@/lib/haptics";
import { DocumentDetector, type Point, type Quad } from "@/lib/scanner/detect";
import { extractDocument } from "@/lib/scanner/warp";

/**
 * Escáner de documentos: visor de cámara con detección de bordes en vivo,
 * captura automática cuando el pulso se estabiliza, ajuste manual de las cuatro
 * esquinas y recorte enderezado. El equivalente en web del escáner nativo de
 * Android/iOS, que una PWA no puede invocar.
 *
 * Por qué NO va en `ResponsiveModal`: no es un diálogo, es una vista a pantalla
 * completa. El visor necesita todo el viewport (en un bottom sheet el encuadre
 * quedaría inservible) y el paso de ajuste de esquinas es una segunda vista
 * dentro del mismo componente, que es justo lo que evita encadenar modales.
 *
 * El contenedor lleva la clase `dark` a propósito: un visor de cámara es una
 * superficie oscura por naturaleza, y así los tokens semánticos resuelven a sus
 * valores oscuros y los controles salen legibles sobre el vídeo en ambos temas,
 * sin colores a mano.
 */

/** Lado mayor del fotograma reducido que se analiza: coste constante por pasada. */
const ANALYSIS_LONG_SIDE = 560;
/** ~8 análisis por segundo; el dibujado sigue yendo a la tasa de refresco. */
const DETECT_INTERVAL_MS = 120;
/** Pasadas consecutivas estables antes de disparar solo (~0,75 s). */
const STABLE_PASSES = 6;
/** Movimiento máximo de una esquina, en coordenadas normalizadas, para «estable». */
const STABLE_TOLERANCE = 0.012;

/** Recorte por defecto cuando se dispara a mano sin detección. */
const DEFAULT_QUAD: Quad = [
  { x: 0.1, y: 0.08 },
  { x: 0.9, y: 0.08 },
  { x: 0.9, y: 0.92 },
  { x: 0.1, y: 0.92 },
];

const CORNER_LABELS = [
  "Esquina superior izquierda",
  "Esquina superior derecha",
  "Esquina inferior derecha",
  "Esquina inferior izquierda",
] as const;

type Stage = "starting" | "scanning" | "adjusting" | "processing";

/** Caja del vídeo dentro del contenedor, en píxeles CSS (hay bandas negras). */
type ContentBox = { x: number; y: number; width: number; height: number };

/** `torch` (la linterna) todavía no está en los tipos del DOM. */
type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };
type TorchConstraint = MediaTrackConstraintSet & { torch?: boolean };

type DocumentScannerProps = {
  /** Recibe el recorte ya enderezado, listo para subir. */
  onCapture: (file: File) => void;
  onCancel: () => void;
  /** La cámara no está disponible: el motivo va en `reason`, ya redactado. */
  onUnavailable: (reason: string) => void;
  onError: (message: string) => void;
};

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Caja del vídeo con `object-contain` dentro de un contenedor. */
function containBox(
  containerWidth: number,
  containerHeight: number,
  videoWidth: number,
  videoHeight: number,
): ContentBox {
  const scale = Math.min(
    containerWidth / videoWidth,
    containerHeight / videoHeight,
  );
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return {
    x: (containerWidth - width) / 2,
    y: (containerHeight - height) / 2,
    width,
    height,
  };
}

function normalizeQuad(quad: Quad, width: number, height: number): Quad {
  const scale = (p: Point): Point => ({ x: p.x / width, y: p.y / height });
  return [scale(quad[0]), scale(quad[1]), scale(quad[2]), scale(quad[3])];
}

function replaceCorner(quad: Quad, index: number, point: Point): Quad {
  return [
    index === 0 ? point : quad[0],
    index === 1 ? point : quad[1],
    index === 2 ? point : quad[2],
    index === 3 ? point : quad[3],
  ];
}

/** Desplazamiento máximo de una esquina entre dos detecciones. */
function maxCornerShift(a: Quad, b: Quad): number {
  let worst = 0;
  for (let i = 0; i < 4; i++) {
    const shift = Math.hypot(b[i].x - a[i].x, b[i].y - a[i].y);
    if (shift > worst) worst = shift;
  }
  return worst;
}

function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "No hay permiso para usar la cámara. Puedes hacer una foto normal del ticket.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No se ha encontrado ninguna cámara en este dispositivo. Puedes subir una foto del ticket.";
    case "NotReadableError":
      return "La cámara está ocupada por otra aplicación. Ciérrala y vuelve a probar, o haz una foto normal del ticket.";
    default:
      return "No se pudo abrir la cámara. Puedes hacer una foto normal del ticket.";
  }
}

export function DocumentScanner({
  onCapture,
  onCancel,
  onUnavailable,
  onError,
}: DocumentScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const analysisRef = useRef<HTMLCanvasElement | null>(null);
  const detectorRef = useRef<DocumentDetector | null>(null);
  const frozenRef = useRef<ImageBitmap | null>(null);

  const liveQuadRef = useRef<Quad | null>(null);
  const previousQuadRef = useRef<Quad | null>(null);
  const stableRef = useRef(0);
  const detectedRef = useRef(false);
  const capturingRef = useRef(false);
  const draggingRef = useRef<number | null>(null);
  /** El escáner ya se cerró: un recorte en vuelo no debe subir nada. */
  const closedRef = useRef(false);
  /** Espejo de `torch` para apagarla al congelar sin rehacer `capture`. */
  const torchOnRef = useRef(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const [stage, setStage] = useState<Stage>("starting");
  const [detected, setDetected] = useState(false);
  const [quad, setQuad] = useState<Quad>(DEFAULT_QUAD);
  const [box, setBox] = useState<ContentBox | null>(null);
  /** `null` = el dispositivo no expone linterna. */
  const [torch, setTorch] = useState<boolean | null>(null);
  const [colors, setColors] = useState({ edge: "#ffffff", locked: "#ffffff" });
  /**
   * `detected` con retardo, solo para el lector de pantalla. La detección se
   * evalúa ~8 veces por segundo y, con el pulso regular, oscila entre «encuadra»
   * y «detectado»: con la pista en `role="status"` cada vaivén era un anuncio.
   * Lo que se ve sigue siendo inmediato; lo que se anuncia espera a que el
   * estado aguante un momento.
   */
  const [steadyDetected, setSteadyDetected] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSteadyDetected(detected), 700);
    return () => window.clearTimeout(id);
  }, [detected]);
  useEffect(() => {
    torchOnRef.current = torch === true;
  }, [torch]);

  // Callbacks en refs: el efecto que abre la cámara debe correr UNA vez, y no
  // volver a pedir permiso porque el padre haya recreado una función.
  const callbacksRef = useRef({ onCapture, onCancel, onUnavailable, onError });
  useEffect(() => {
    callbacksRef.current = { onCapture, onCancel, onUnavailable, onError };
  });

  // Colores del trazado leídos de los tokens: el canvas no entiende clases. Si
  // no se pudieran leer, el blanco sigue siendo visible sobre el vídeo.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const styles = getComputedStyle(container);
    const read = (name: string) => styles.getPropertyValue(name).trim();
    setColors({
      edge: read("--primary") || "#ffffff",
      locked: read("--success") || "#ffffff",
    });
  }, []);

  // Bloquea el scroll del documento mientras el visor ocupa la pantalla, y lleva
  // el foco dentro: sin eso, con teclado o lector de pantalla se seguía en el
  // botón de detrás, tapado por el visor. Devolverlo al cerrar es cosa del padre,
  // que es quien sabe a qué botón (`scan-form.tsx`).
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // En desarrollo StrictMode monta, desmonta y vuelve a montar: sin esto el
    // desmontaje de ensayo dejaba el escáner «cerrado» y no capturaba nunca.
    closedRef.current = false;
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      closedRef.current = true;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      callbacksRef.current.onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Apertura de la cámara. Se ejecuta una sola vez; la limpieza corta las
  // pistas para que no quede el indicador de cámara encendido.
  useEffect(() => {
    let cancelled = false;

    const stop = (stream: MediaStream) => {
      for (const track of stream.getTracks()) track.stop();
    };

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        callbacksRef.current.onUnavailable(
          "Este navegador no permite abrir la cámara. Puedes hacer una foto normal del ticket.",
        );
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        const video = videoRef.current;
        if (cancelled || !video) {
          stop(stream);
          return;
        }
        streamRef.current = stream;
        video.srcObject = stream;
        await video.play();

        const [track] = stream.getVideoTracks();
        const capabilities = track?.getCapabilities?.() as
          | TorchCapabilities
          | undefined;
        if (capabilities?.torch) setTorch(false);

        setStage("scanning");
      } catch (error) {
        if (cancelled) return;
        callbacksRef.current.onUnavailable(cameraErrorMessage(error));
      }
    }

    void start();

    return () => {
      cancelled = true;
      const stream = streamRef.current;
      streamRef.current = null;
      if (stream) stop(stream);
      frozenRef.current?.close();
      frozenRef.current = null;
    };
  }, []);

  // Caja del vídeo: la necesitan el dibujado y la posición de los tiradores.
  useEffect(() => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container) return;

    const update = () => {
      const bounds = container.getBoundingClientRect();
      const current = videoRef.current;
      if (!current?.videoWidth || !current.videoHeight) {
        setBox(null);
        return;
      }
      setBox(
        containBox(
          bounds.width,
          bounds.height,
          current.videoWidth,
          current.videoHeight,
        ),
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    video?.addEventListener("loadedmetadata", update);
    return () => {
      observer.disconnect();
      video?.removeEventListener("loadedmetadata", update);
    };
  }, [stage]);

  const drawOverlay = useCallback(
    (target: Quad | null, locked: boolean) => {
      const canvas = overlayRef.current;
      const container = containerRef.current;
      const video = videoRef.current;
      if (!canvas || !container || !video) return;

      const bounds = container.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.max(1, Math.round(bounds.width * ratio));
      const pixelHeight = Math.max(1, Math.round(bounds.height * ratio));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }

      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, bounds.width, bounds.height);

      if (!target || !video.videoWidth || !video.videoHeight) return;
      const content = containBox(
        bounds.width,
        bounds.height,
        video.videoWidth,
        video.videoHeight,
      );
      const points = [0, 1, 2, 3].map((i) => ({
        x: content.x + target[i].x * content.width,
        y: content.y + target[i].y * content.height,
      }));

      const trace = () => {
        context.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < 4; i++) context.lineTo(points[i].x, points[i].y);
        context.closePath();
      };

      // Velo sobre lo que queda fuera del recorte. Negro con alfa y no un
      // token: aquí el fondo es el vídeo de la cámara, no una superficie de la
      // app, así que no depende del tema.
      context.fillStyle = "rgb(0 0 0 / 0.5)";
      context.beginPath();
      context.rect(content.x, content.y, content.width, content.height);
      trace();
      context.fill("evenodd");

      // «Bloqueado» (a punto de disparar solo) se distingue por el GROSOR, no
      // solo por el color: en oscuro --primary y --success son casi el mismo
      // verde (L 0,72 y 0,70), y el cambio de tono solo no se veía.
      context.strokeStyle = locked ? colors.locked : colors.edge;
      context.lineWidth = locked ? 6 : 3;
      context.lineJoin = "round";
      context.beginPath();
      trace();
      context.stroke();
    },
    [colors],
  );

  const capture = useCallback(async (initial: Quad | null) => {
    if (capturingRef.current) return;
    capturingRef.current = true;

    const video = videoRef.current;
    if (!video) {
      capturingRef.current = false;
      return;
    }

    // Pausar antes de congelar garantiza que el fotograma que se ve es el que
    // se recorta.
    video.pause();
    vibrateTick();
    // Con el fotograma congelado la linterna ya no ilumina nada (y en esa vista
    // no hay botón para apagarla): se apaga aquí. «Repetir» no la vuelve a
    // encender; es un toque.
    if (torchOnRef.current) {
      const [track] = streamRef.current?.getVideoTracks() ?? [];
      track
        ?.applyConstraints({ advanced: [{ torch: false } as TorchConstraint] })
        .then(() => setTorch(false))
        .catch(() => {});
    }

    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(video);
    } catch {
      bitmap = null;
    }
    if (!bitmap) {
      capturingRef.current = false;
      void video.play();
      callbacksRef.current.onError(
        "No se pudo congelar el fotograma. Prueba a disparar otra vez.",
      );
      return;
    }

    frozenRef.current?.close();
    frozenRef.current = bitmap;
    setQuad(initial ?? DEFAULT_QUAD);
    setStage("adjusting");
  }, []);

  const runDetection = useCallback(
    (video: HTMLVideoElement) => {
      const scale =
        ANALYSIS_LONG_SIDE / Math.max(video.videoWidth, video.videoHeight);
      const width = Math.max(1, Math.round(video.videoWidth * scale));
      const height = Math.max(1, Math.round(video.videoHeight * scale));

      let canvas = analysisRef.current;
      if (!canvas) {
        canvas = document.createElement("canvas");
        analysisRef.current = canvas;
      }
      // El tamaño cambia si el móvil rota: hay que rehacer el detector.
      if (
        canvas.width !== width ||
        canvas.height !== height ||
        !detectorRef.current
      ) {
        canvas.width = width;
        canvas.height = height;
        detectorRef.current = new DocumentDetector(width, height);
      }

      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(video, 0, 0, width, height);
      const found = detectorRef.current.detect(
        context.getImageData(0, 0, width, height),
      );

      if (!found) {
        liveQuadRef.current = null;
        previousQuadRef.current = null;
        stableRef.current = 0;
        if (detectedRef.current) {
          detectedRef.current = false;
          setDetected(false);
        }
        return;
      }

      const normalized = normalizeQuad(found, width, height);
      liveQuadRef.current = normalized;
      if (!detectedRef.current) {
        detectedRef.current = true;
        setDetected(true);
      }

      const previous = previousQuadRef.current;
      stableRef.current =
        previous && maxCornerShift(previous, normalized) < STABLE_TOLERANCE
          ? stableRef.current + 1
          : 1;
      previousQuadRef.current = normalized;

      if (stableRef.current >= STABLE_PASSES) void capture(normalized);
    },
    [capture],
  );

  // Bucle del visor: analiza a ritmo acotado y redibuja en cada fotograma.
  useEffect(() => {
    if (stage !== "scanning") return;
    let frameId = 0;
    let lastDetect = 0;

    const step = (now: number) => {
      frameId = requestAnimationFrame(step);
      if (capturingRef.current) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth) return;

      if (now - lastDetect >= DETECT_INTERVAL_MS) {
        lastDetect = now;
        runDetection(video);
      }
      drawOverlay(liveQuadRef.current, stableRef.current >= 2);
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [stage, runDetection, drawOverlay]);

  // Con el fotograma congelado no hay bucle: se redibuja al cambiar el recorte.
  useEffect(() => {
    if (stage !== "adjusting" && stage !== "processing") return;
    drawOverlay(quad, true);
  }, [stage, quad, box, drawOverlay]);

  const toggleTorch = useCallback(async () => {
    const [track] = streamRef.current?.getVideoTracks() ?? [];
    if (!track || torch === null) return;
    const next = !torch;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as TorchConstraint],
      });
      setTorch(next);
    } catch {
      callbacksRef.current.onError("No se pudo cambiar la linterna.");
    }
  }, [torch]);

  const retry = useCallback(() => {
    frozenRef.current?.close();
    frozenRef.current = null;
    liveQuadRef.current = null;
    previousQuadRef.current = null;
    stableRef.current = 0;
    detectedRef.current = false;
    capturingRef.current = false;
    setDetected(false);
    void videoRef.current?.play();
    setStage("scanning");
  }, []);

  const confirm = useCallback(async () => {
    const bitmap = frozenRef.current;
    if (!bitmap) return;
    setStage("processing");
    try {
      const toPixels = (p: Point): Point => ({
        x: p.x * bitmap.width,
        y: p.y * bitmap.height,
      });
      const blob = await extractDocument(bitmap, [
        toPixels(quad[0]),
        toPixels(quad[1]),
        toPixels(quad[2]),
        toPixels(quad[3]),
      ]);
      // Escape (o la X) durante el recorte cierra el escáner, pero esta promesa
      // sigue: sin la guarda, el ticket se subía después de haber cancelado.
      if (closedRef.current) return;
      callbacksRef.current.onCapture(
        new File([blob], "ticket.jpg", { type: "image/jpeg" }),
      );
    } catch {
      if (closedRef.current) return;
      setStage("adjusting");
      callbacksRef.current.onError(
        "No se pudo recortar el ticket. Ajusta las esquinas y prueba otra vez.",
      );
    }
  }, [quad]);

  const moveCorner = useCallback((index: number, point: Point) => {
    setQuad((previous) => replaceCorner(previous, index, point));
  }, []);

  const handlePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    index: number,
  ) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = index;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const index = draggingRef.current;
    const container = containerRef.current;
    if (index === null || !box || !container) return;
    const bounds = container.getBoundingClientRect();
    moveCorner(index, {
      x: clamp01((event.clientX - bounds.left - box.x) / box.width),
      y: clamp01((event.clientY - bounds.top - box.y) / box.height),
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    draggingRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const step = event.shiftKey ? 0.05 : 0.01;
    let dx = 0;
    let dy = 0;
    switch (event.key) {
      case "ArrowLeft":
        dx = -step;
        break;
      case "ArrowRight":
        dx = step;
        break;
      case "ArrowUp":
        dy = -step;
        break;
      case "ArrowDown":
        dy = step;
        break;
      default:
        return;
    }
    event.preventDefault();
    moveCorner(index, {
      x: clamp01(quad[index].x + dx),
      y: clamp01(quad[index].y + dy),
    });
  };

  const hintFor = (isDetected: boolean) =>
    stage === "starting"
      ? "Abriendo la cámara…"
      : stage === "scanning"
        ? isDetected
          ? "Ticket detectado. Mantén el pulso para capturar."
          : "Encuadra el ticket completo sobre una superficie lisa."
        : stage === "adjusting"
          ? "Arrastra las esquinas si el recorte no es exacto."
          : "Recortando y enderezando…";
  const hint = hintFor(detected);
  const announcedHint = hintFor(steadyDetected);

  const closeButton = (
    <Button
      ref={closeRef}
      variant="ghost"
      size="icon"
      aria-label="Cerrar el escáner"
      onClick={() => callbacksRef.current.onCancel()}
    >
      <X aria-hidden />
    </Button>
  );

  // Por encima de la bottom nav, que va en `z-50`. No es un `Dialog` (ver la
  // cabecera), pero para la tecnología de apoyo sí se comporta como uno: tapa
  // toda la página y lo de detrás no se puede usar.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Escanear el ticket"
      className="dark fixed inset-0 z-[60] flex flex-col bg-background text-foreground"
    >
      <div ref={containerRef} className="relative min-h-0 flex-1">
        {/* `muted` no es solo por el autoplay de iOS: sin pista de audio, la
            regla jsx-a11y/media-has-caption no exige subtítulos, que en una
            previsualización de cámara no tendrían nada que decir. */}
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="size-full object-contain"
        />
        <canvas
          ref={overlayRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full"
        />

        {stage === "adjusting" && box
          ? CORNER_LABELS.map((label, index) => (
              <button
                key={label}
                type="button"
                aria-label={`${label}. Usa las flechas para ajustarla.`}
                onPointerDown={(event) => handlePointerDown(event, index)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onKeyDown={(event) => handleKeyDown(event, index)}
                style={{
                  left: box.x + quad[index].x * box.width,
                  top: box.y + quad[index].y * box.height,
                }}
                className={cn(
                  "absolute flex size-11 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full outline-none",
                  "focus-visible:ring-3 focus-visible:ring-ring/50",
                )}
              >
                <span className="size-5 rounded-full bg-primary ring-2 ring-background" />
              </button>
            ))
          : null}
      </div>

      {/* pb-safe-3 y no pb-safe: sin inset (Android con botones, navegador de
          escritorio) la fila quedaba pegada al borde de la pantalla. */}
      <div className="shrink-0 px-4 pt-3 pb-safe-3">
        <p aria-hidden className="pb-3 text-center text-sm">
          {hint}
        </p>
        <p role="status" className="sr-only">
          {announcedHint}
        </p>

        {stage === "adjusting" || stage === "processing" ? (
          // La X también aquí: antes, ajustando solo se podía salir con Escape,
          // que en el móvil no existe, o repitiendo y cerrando. Para que quepan
          // los tres en 360 px los botones van al tamaño por defecto (44 px,
          // táctil igual) y el principal dice «Usar recorte».
          <div className="flex items-center gap-2">
            {closeButton}
            <div className="flex flex-1 items-center justify-end gap-2">
              <Button
                variant="outline"
                disabled={stage === "processing"}
                onClick={retry}
              >
                <RotateCcw aria-hidden />
                Repetir
              </Button>
              <Button
                loading={stage === "processing"}
                onClick={() => void confirm()}
              >
                <Check aria-hidden />
                Usar recorte
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            {closeButton}

            <Button
              size="icon"
              aria-label="Capturar el ticket"
              disabled={stage !== "scanning"}
              onClick={() => void capture(liveQuadRef.current)}
              className="size-16 rounded-full"
            >
              <span className="size-6 rounded-full bg-primary-foreground" />
            </Button>

            {torch === null ? (
              // Hueco del mismo tamaño que el botón: mantiene el disparador
              // centrado en los dispositivos sin linterna.
              <span className="size-11" aria-hidden />
            ) : (
              <Button
                variant={torch ? "secondary" : "ghost"}
                size="icon"
                aria-label="Linterna"
                aria-pressed={torch}
                disabled={stage !== "scanning"}
                onClick={() => void toggleTorch()}
              >
                {torch ? <Flashlight aria-hidden /> : <FlashlightOff aria-hidden />}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
