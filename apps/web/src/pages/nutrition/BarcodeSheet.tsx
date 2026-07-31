/**
 * Barcode scan & log sheet (wger/OFF integration Phase 4).
 * Manual EAN entry + live camera scanning via getUserMedia + BarcodeDetector
 * when the platform supports it (Telegram Mini App webview and modern mobile
 * browsers); degrades gracefully to manual entry otherwise.
 * Looks up GET /foods/barcode/:code and renders the result card with a
 * nutriscore badge, vegan/vegetarian chips, OFF attribution and a
 * deterministic client-side ALLERGEN WARNING (food allergens âˆ© profile
 * allergies â€” mirrors the backend filter; never model-estimated).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { Allergen, MealLogItem, MealType } from '@aquazerofit/shared';
import { api, ApiError } from '@/lib/api';
import { useProfile } from '@/lib/queries';
import type { BarcodeLookup } from '@/lib/contracts';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { haptic } from '@/lib/telegram';
import { GramsStepper, itemFromFood } from './Nutrition';
import { fmtInt, MEAL_LABEL, MEAL_TYPES, mealTypeForNow, round1 } from '../dashboard/lib';

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

const NUTRISCORE_STYLE: Record<string, string> = {
  a: 'bg-secondary text-on-secondary',
  b: 'bg-secondary/50 text-on-secondary',
  c: 'bg-primary/60 text-on-primary',
  d: 'bg-tertiary-container/70 text-on-tertiary-container',
  e: 'bg-tertiary-container text-on-tertiary-container',
};

function NutriscoreBadge({ grade }: { grade: 'a' | 'b' | 'c' | 'd' | 'e' }) {
  return (
    <span
      role="img"
      aria-label={`Nutri-Score ${grade.toUpperCase()}`}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-sm font-black uppercase ${NUTRISCORE_STYLE[grade]}`}
    >
      {grade}
    </span>
  );
}

export function BarcodeSheet({
  open,
  onClose,
  onLog,
}: {
  open: boolean;
  onClose: () => void;
  onLog: (item: MealLogItem, mealType: MealType) => void;
}) {
  const { show } = useToast();
  const profileQuery = useProfile(open);

  const [code, setCode] = useState('');
  const [result, setResult] = useState<BarcodeLookup | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [grams, setGrams] = useState(100);
  const [mealType, setMealType] = useState<MealType>(mealTypeForNow());
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const canScan =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof window !== 'undefined' &&
    Boolean(window.BarcodeDetector);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  };

  const lookup = useMutation({
    mutationFn: async (barcode: string) => {
      try {
        return await api<BarcodeLookup>(`/foods/barcode/${encodeURIComponent(barcode)}`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    onSuccess: (data) => {
      if (!data) {
        setNotFound(true);
        setResult(null);
        haptic('warning');
        return;
      }
      setNotFound(false);
      setResult(data);
      setGrams(data.food.commonServings[0]?.grams ?? 100);
      haptic('success');
    },
    onError: () => show('Lookup failed â€” check your connection and try again'),
  });

  const submitCode = (raw: string) => {
    const cleaned = raw.replace(/[^0-9]/g, '');
    if (cleaned.length < 8) return;
    stopCamera();
    lookup.mutate(cleaned);
  };

  // Camera lifecycle: start the stream + detection loop while cameraOn.
  useEffect(() => {
    if (!cameraOn || !open) return;
    let cancelled = false;
    let timer: number | undefined;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => undefined);

        const Detector = window.BarcodeDetector;
        if (!Detector) return;
        const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
        timer = window.setInterval(() => {
          if (cancelled || !videoRef.current || videoRef.current.readyState < 2) return;
          detector
            .detect(videoRef.current)
            .then((codes) => {
              const hit = codes[0]?.rawValue;
              if (hit && !cancelled) submitCode(hit);
            })
            .catch(() => {
              // Detection failures on individual frames are expected â€” keep scanning.
            });
        }, 500);
      } catch {
        if (!cancelled) {
          setCameraError('Camera unavailable â€” type the barcode below instead.');
          setCameraOn(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearInterval(timer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn, open]);

  // Reset when the sheet closes.
  useEffect(() => {
    if (!open) {
      stopCamera();
      setCode('');
      setResult(null);
      setNotFound(false);
      setCameraError(null);
      setGrams(100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Deterministic allergen intersection (mirrors the backend filter):
  // the endpoint's allergen list (OFF-derived, best-effort) âˆ© profile allergies.
  const profileAllergies = useMemo(
    () => new Set<string>((profileQuery.data?.allergies ?? []) as Allergen[]),
    [profileQuery.data],
  );
  const allergyHits = useMemo(() => {
    if (!result) return [];
    const foodAllergens = result.allergens.length > 0 ? result.allergens : result.food.allergens;
    const traces = result.tracesAllergens ?? [];
    const combined = [...new Set([...foodAllergens, ...traces])];
    return combined.filter((a) => profileAllergies.has(a));
  }, [result, profileAllergies]);

  if (!open) return null;

  const preview = result ? itemFromFood(result.food, grams) : null;

  return (
    <div
      className="fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
      aria-label="Scan a barcode"
    >
      <button
        type="button"
        aria-label="Close barcode scanner"
        onClick={() => {
          stopCamera();
          onClose();
        }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[88vh] max-w-md overflow-y-auto rounded-t-3xl border-t border-border-aqua bg-surface-container-high p-5 pb-8">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-outline-variant" aria-hidden="true" />
        <h3 className="mb-4 font-heading text-xl font-semibold uppercase tracking-[0.02em] text-on-surface">
          Scan barcode
        </h3>

        {!result ? (
          <div className="space-y-4">
            {/* Camera viewfinder (only when supported + enabled) */}
            {cameraOn && (
              <div className="relative overflow-hidden rounded-2xl border border-outline-variant bg-black">
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  aria-label="Camera viewfinder â€” point at a product barcode"
                  className="aspect-[4/3] w-full object-cover"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-10 top-1/2 h-0.5 -translate-y-1/2 bg-primary/80 shadow-[0_0_12px_rgba(47,217,244,0.6)]"
                />
              </div>
            )}
            {cameraError && (
              <p role="alert" className="text-sm text-on-surface-variant">
                {cameraError}
              </p>
            )}

            {canScan && (
              <button
                type="button"
                onClick={() => (cameraOn ? stopCamera() : setCameraOn(true))}
                className="glass-card flex w-full items-center justify-center gap-2 p-3 text-sm font-bold text-on-surface transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <span className="material-symbols-outlined text-primary" aria-hidden="true">
                  {cameraOn ? 'videocam_off' : 'barcode_scanner'}
                </span>
                {cameraOn ? 'Stop camera' : 'Scan with camera'}
              </button>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitCode(code);
              }}
              className="space-y-3"
            >
              <Input
                label="Barcode (EAN)"
                icon="barcode"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="e.g. 3017620422003"
                value={code}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCode(e.target.value)}
                autoFocus={!canScan}
              />
              <button
                type="submit"
                disabled={code.replace(/[^0-9]/g, '').length < 8 || lookup.isPending}
                className="cta-gradient h-12 w-full rounded-xl font-bold text-on-primary transition-transform active:scale-[0.98] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                {lookup.isPending ? 'Looking upâ€¦' : 'Look up product'}
              </button>
            </form>

            {lookup.isPending && <Skeleton className="h-24 w-full rounded-xl" />}
            {notFound && !lookup.isPending && (
              <p role="status" className="rounded-xl border border-outline-variant bg-surface-container-low p-3 text-sm text-on-surface-variant">
                We don't know that barcode yet. Try the food search instead.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Allergen warning â€” deterministic client-side check (food
                allergens âˆ© profile allergies), mirroring the backend filter. */}
            {allergyHits.length > 0 && (
              <div
                role="alert"
                className="rounded-xl border border-tertiary-container bg-tertiary-container/15 p-3"
              >
                <p className="flex items-center gap-2 text-sm font-bold text-tertiary-container">
                  <span className="material-symbols-outlined" aria-hidden="true">
                    warning
                  </span>
                  Allergen warning
                </p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  This product
                  {(result.tracesAllergens?.length ?? 0) > 0 &&
                  result.allergens.some((a) => profileAllergies.has(a))
                    ? ' contains'
                    : (result.tracesAllergens?.length ?? 0) > 0
                      ? ' may contain traces of'
                      : ' contains'}{' '}
                  {allergyHits.join(', ')}, which you listed as an allergy. Allergen data is
                  best-effort â€” always check the label.
                </p>
              </div>
            )}

            {/* Result card */}
            <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-on-surface">{result.food.name}</p>
                  <p className="text-xs text-on-surface-variant">
                    {result.food.brand ? `${result.food.brand} Â· ` : ''}
                    {result.food.category}
                  </p>
                </div>
                {result.food.nutriscore && <NutriscoreBadge grade={result.food.nutriscore} />}
              </div>
              <p className="mt-2 text-xs tabular-nums text-on-surface-variant">
                {Math.round(result.food.per100g.kcal)} kcal Â· P {round1(result.food.per100g.proteinG)}g
                Â· C {round1(result.food.per100g.carbsG)}g Â· F {round1(result.food.per100g.fatG)}g per
                100g
              </p>
              {(result.food.isVegan || result.food.isVegetarian) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {result.food.isVegan && <Chip label="Vegan" tone="green" icon="eco" />}
                  {result.food.isVegetarian && !result.food.isVegan && (
                    <Chip label="Vegetarian" tone="green" icon="spa" />
                  )}
                </div>
              )}
              {/* OFF attribution â€” never omitted for OFF-sourced records (ODbL). */}
              {result.origin === 'off-api' && (
                <p className="mt-2 border-t border-outline-variant pt-2 text-[11px] text-on-surface-variant">
                  Â© Open Food Facts contributors
                  {result.food.sourceUrl && (
                    <>
                      {' â€” '}
                      <a
                        href={result.food.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        product page
                      </a>
                    </>
                  )}
                </p>
              )}
            </div>

            {/* Portion + meal target */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-on-surface">Portion</span>
              <GramsStepper value={grams} onChange={setGrams} label={result.food.name} />
            </div>
            {preview && (
              <div className="rounded-xl border border-outline-variant bg-surface-container-low p-3 tabular-nums">
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-on-surface-variant">Calories</span>
                  <span className="font-bold text-primary">{fmtInt(preview.kcal)} kcal</span>
                </div>
                <div className="flex justify-between text-xs text-on-surface-variant">
                  <span>Protein {preview.proteinG}g</span>
                  <span>Carbs {preview.carbsG}g</span>
                  <span>Fat {preview.fatG}g</span>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2" role="group" aria-label="Log to meal">
              {MEAL_TYPES.map((mt) => (
                <Chip
                  key={mt}
                  label={MEAL_LABEL[mt]}
                  active={mealType === mt}
                  onClick={() => setMealType(mt)}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => preview && onLog(preview, mealType)}
              className="cta-gradient h-14 w-full rounded-xl font-bold text-on-primary transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              Log {grams}g to {MEAL_LABEL[mealType]}
            </button>
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setCode('');
                setNotFound(false);
              }}
              className="w-full text-center text-sm text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              Scan another product
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
