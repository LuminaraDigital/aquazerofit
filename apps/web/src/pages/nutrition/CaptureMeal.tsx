import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { MealType } from '@aquazerofit/shared';
import { MEAL_PHOTO_MAX_BYTES } from '@aquazerofit/shared';
import { api } from '@/lib/api';
import { Chip } from '@/components/ui/Chip';
import { useToast } from '@/components/ui/Toast';
import { MEAL_LABEL, MEAL_TYPES, mealTypeForNow, todayLocalDate } from '../dashboard/lib';

const ACCEPT = 'image/jpeg,image/png,image/heic';

function isAcceptedFile(file: File): boolean {
  if (['image/jpeg', 'image/png', 'image/heic'].includes(file.type)) return true;
  // Some platforms report an empty MIME for HEIC — fall back to the extension.
  if (!file.type) return /\.(heic|jpe?g|png)$/i.test(file.name);
  return false;
}

/** Viewfinder corner bracket. */
function Corner({ className }: { className: string }) {
  return <div className={`w-10 h-10 border-primary/80 ${className}`} aria-hidden="true" />;
}

export default function CaptureMeal() {
  const navigate = useNavigate();
  const { show } = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mealType, setMealType] = useState<MealType>(mealTypeForNow());
  const [error, setError] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const upload = useMutation({
    mutationFn: async (photo: File) => {
      const formData = new FormData();
      formData.append('photo', photo);
      formData.append('mealType', mealType);
      formData.append('localDate', todayLocalDate());
      return api<{ jobId?: string; id?: string }>('/meal-photos', { method: 'POST', formData });
    },
    onSuccess: (res) => {
      const jobId = res?.jobId ?? res?.id;
      if (jobId) {
        navigate(`/nutrition/analysis/${jobId}`);
      } else {
        show('Upload succeeded but no analysis job was returned');
      }
    },
    onError: () => show('Upload failed — check your connection and try again'),
  });

  const onFileChosen = (chosen: File | undefined) => {
    setError(null);
    if (!chosen) return;
    if (!isAcceptedFile(chosen)) {
      setError('That file type is not supported. Please use a JPEG, PNG or HEIC photo.');
      return;
    }
    if (chosen.size > MEAL_PHOTO_MAX_BYTES) {
      setError('That photo is over 10MB. Try a smaller photo or lower the camera resolution.');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(chosen);
    setPreviewUrl(URL.createObjectURL(chosen));
  };

  return (
    <div className="fixed inset-0 bg-black text-on-surface overflow-hidden">
      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept={ACCEPT}
        capture="environment"
        className="hidden"
        aria-label="Take a photo of your meal"
        onChange={(e) => onFileChosen(e.target.files?.[0])}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        aria-label="Choose a meal photo from your library"
        onChange={(e) => onFileChosen(e.target.files?.[0])}
      />

      {/* Preview / viewport layer */}
      <div className="absolute inset-0 z-0">
        {previewUrl ? (
          <img src={previewUrl} alt="Preview of your meal photo" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-surface-container-low via-surface to-black flex items-center justify-center">
            <span className="material-symbols-outlined text-outline-variant text-[96px]" aria-hidden="true">
              restaurant
            </span>
          </div>
        )}
        {/* Viewfinder brackets */}
        <div className="absolute inset-x-container-margin top-[18%] bottom-[38%] flex flex-col justify-between pointer-events-none">
          <div className="flex justify-between">
            <Corner className="border-t-2 border-l-2 rounded-tl-lg" />
            <Corner className="border-t-2 border-r-2 rounded-tr-lg" />
          </div>
          <div className="flex justify-between">
            <Corner className="border-b-2 border-l-2 rounded-bl-lg" />
            <Corner className="border-b-2 border-r-2 rounded-br-lg" />
          </div>
        </div>
      </div>

      {/* UI overlay */}
      <div className="relative z-10 h-full flex flex-col max-w-md mx-auto">
        {/* Header */}
        <header className="bg-surface/40 backdrop-blur-md px-container-margin py-4 flex justify-between items-center border-b border-outline-variant/30">
          <button
            type="button"
            aria-label="Close meal capture"
            onClick={() => navigate('/nutrition')}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-low/60 text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              close
            </span>
          </button>
          <div className="flex flex-col items-center">
            <span className="font-heading font-semibold uppercase tracking-[0.02em] text-xl text-primary">
              Meal Capture
            </span>
            <span className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">
              Smart Scan AI
            </span>
          </div>
          <div className="w-10 h-10" aria-hidden="true" />
        </header>

        {/* Guidance copy */}
        <div className="flex-grow flex items-center justify-center pointer-events-none px-container-margin">
          {!upload.isPending && (
            <div className="bg-black/40 backdrop-blur-[2px] px-6 py-3 rounded-xl border border-white/10 text-center">
              <p className="text-white text-sm font-medium flex items-center gap-3 justify-center">
                <span className="material-symbols-outlined text-primary" aria-hidden="true">
                  center_focus_weak
                </span>
                {file ? 'Looks good — pick a meal type and analyze' : 'Frame your whole meal in the brackets'}
              </p>
              {!file && (
                <p className="text-on-surface-variant text-xs mt-1">
                  Good lighting and a top-down angle give the best estimates.
                </p>
              )}
            </div>
          )}
          {upload.isPending && (
            <div className="bg-black/50 backdrop-blur px-6 py-4 rounded-xl border border-primary/30 text-center" role="status">
              <p className="text-primary text-sm font-bold mb-2">Uploading your photo…</p>
              <div className="h-1.5 w-48 bg-outline-variant rounded-full overflow-hidden">
                <div className="h-full w-1/2 cta-gradient rounded-full animate-pulse" />
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="px-container-margin mb-3" aria-live="assertive">
            <div className="bg-error-container/80 border border-error rounded-xl px-4 py-3 text-on-error-container text-sm">
              {error}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="bg-gradient-to-t from-black via-black/85 to-transparent pt-10 pb-8 px-container-margin">
          {/* Meal type chips */}
          <div className="flex justify-center gap-2 mb-6 flex-wrap" role="group" aria-label="Meal type">
            {MEAL_TYPES.map((mt) => (
              <Chip
                key={mt}
                label={MEAL_LABEL[mt]}
                active={mealType === mt}
                onClick={() => setMealType(mt)}
              />
            ))}
          </div>

          {/* Shutter row */}
          <div className="flex items-center justify-between max-w-sm mx-auto">
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="group flex flex-col items-center gap-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              aria-label="Choose a photo from your gallery"
            >
              <div className="w-14 h-14 rounded-xl border-2 border-outline-variant bg-surface-container-highest/60 flex items-center justify-center transition-transform group-hover:scale-105">
                <span className="material-symbols-outlined text-on-surface" aria-hidden="true">
                  photo_library
                </span>
              </div>
              <span className="text-[10px] text-on-surface-variant font-bold uppercase tracking-tighter">
                Gallery
              </span>
            </button>

            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              aria-label="Take a photo"
              className="w-20 h-20 rounded-full bg-white flex items-center justify-center transition-all shadow-[0_0_20px_rgba(138,235,255,0.4)] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <div className="w-[72px] h-[72px] rounded-full border-2 border-background" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => {
                if (file) {
                  setFile(null);
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                  setError(null);
                }
              }}
              disabled={!file}
              aria-label="Retake photo"
              className="w-14 h-14 rounded-full bg-surface-container-highest/40 backdrop-blur-md border border-outline-variant/30 flex items-center justify-center text-on-surface disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                restart_alt
              </span>
            </button>
          </div>

          {/* Analyze CTA */}
          {file && (
            <button
              type="button"
              onClick={() => upload.mutate(file)}
              disabled={upload.isPending}
              className="mt-6 cta-gradient w-full h-14 rounded-xl text-on-primary font-bold flex items-center justify-center gap-2 shadow-lg shadow-primary/20 active:scale-[0.98] transition-transform disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                auto_awesome
              </span>
              {upload.isPending ? 'Uploading…' : 'Analyze meal'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
