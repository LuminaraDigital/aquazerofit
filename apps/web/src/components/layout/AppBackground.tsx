import { useEffect, useRef, useState } from 'react';
import { isTMA } from '@/lib/telegram';
import { shouldUseStaticTelegramBackground } from '@/lib/telegramChrome';

/**
 * Animated WebGL aurora shader. Custom implementation in AquaZeroFit's
 * aquatic palette (cyan/teal/green).
 *
 * Renders three fixed layers:
 * 1. <canvas> - GLSL aurora light rays in aqua tones
 * 2. Diagonal hatch overlay - subtle texture
 * 3. Vignette - darkens edges to focus content
 *
 * The shader is a single full-screen triangle with banded light rays
 * that shift slowly. Performance: one draw call per frame, ~0% CPU when
 * tab is backgrounded (rAF pauses). Respects prefers-reduced-motion.
 *
 * Inside Telegram the shader is skipped on Android, on a light scheme (the
 * shader is a dark ocean and would sit under light text), when deviceMemory
 * or hardwareConcurrency is 4 or less, and when the user prefers reduced
 * motion. Those cases paint a static CSS wash instead. Outside Telegram the
 * only skip is reduced motion, and the canvas stack stays as it was.
 */
function prefersReducedMotion(): boolean {
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Read the host object directly. Page tests replace the telegram module with
 * a partial mock that only stubs isTMA, and a named import of telegramWebApp
 * would throw while rendering the marketing shell.
 */
function liveWebApp() {
  return typeof window === 'undefined' ? undefined : window.Telegram?.WebApp;
}

function telegramStaticBackground(): boolean {
  const tg = liveWebApp();
  return shouldUseStaticTelegramBackground({
    inTelegram: isTMA(),
    platform: tg?.platform,
    colorScheme: tg?.colorScheme,
    deviceMemory: navigator.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
    prefersReducedMotion: prefersReducedMotion(),
  });
}

function supportsThemeEvents(): boolean {
  const tg = liveWebApp();
  if (!tg?.initData || typeof tg.isVersionAtLeast !== 'function') return false;
  try {
    return tg.isVersionAtLeast('6.1') === true;
  } catch {
    return false;
  }
}

export function AppBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [staticBg, setStaticBg] = useState(telegramStaticBackground);

  useEffect(() => {
    let cancelled = false;
    let stopGl: (() => void) | undefined;

    const apply = () => {
      stopGl?.();
      stopGl = undefined;
      const reduced = prefersReducedMotion();
      const telegramStatic = telegramStaticBackground();
      if (cancelled) return;
      setStaticBg(telegramStatic);
      if (reduced || telegramStatic) return;

      const canvas = canvasRef.current;
      if (!canvas) return;
      stopGl = startAurora(canvas);
    };

    apply();
    const tg = liveWebApp();
    const onTheme = () => apply();
    if (supportsThemeEvents()) {
      tg?.onEvent?.('themeChanged', onTheme);
    }
    return () => {
      cancelled = true;
      stopGl?.();
      if (supportsThemeEvents()) tg?.offEvent?.('themeChanged', onTheme);
    };
  }, []);

  return (
    <>
      {staticBg ? <div className="azf-bg-static" aria-hidden="true" /> : null}
      <canvas
        ref={canvasRef}
        className="azf-bg-canvas"
        aria-hidden="true"
        style={staticBg ? { display: 'none' } : undefined}
      />
      <div className="azf-bg-hatch" aria-hidden="true" />
      <div className="azf-bg-vignette" aria-hidden="true" />
    </>
  );
}

function startAurora(canvas: HTMLCanvasElement): (() => void) | undefined {
  const gl = canvas.getContext('webgl');
  if (!gl) return;

  // Capture non-null refs for use inside callbacks
    const cv = canvas;
    const ctx = gl;

    const vsSrc = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    const fsSrc = `
      precision mediump float;
      uniform vec2 u_res;
      uniform float u_time;
      float band(float x, float c, float w) {
        float d = (x - c) / w;
        return exp(-d * d);
      }
      void main() {
        vec2 uv = gl_FragCoord.xy / u_res;
        float t = u_time * 0.1;

        // Base: deep ocean dark with slight vertical gradient
        vec3 base = mix(vec3(0.035, 0.06, 0.07), vec3(0.04, 0.09, 0.1), uv.y);

        float x = uv.x + (1.0 - uv.y) * (-0.3);
        float topFade = pow(uv.y, 1.6);

        // Aqua/teal/green aurora rays (AquaZeroFit brand colors)
        vec3 cyan  = vec3(0.18, 0.85, 0.96);  // #2fd9f4
        vec3 green = vec3(0.27, 0.87, 0.64);  // #45dfa4
        vec3 glow  = vec3(0.12, 0.45, 0.52);

        float r = 0.0;
        r += 0.85 * band(x, 0.30 + 0.06 * sin(t * 1.3),       0.055 + 0.015 * sin(t * 0.7));
        r += 0.55 * band(x, 0.44 + 0.05 * sin(t * 0.9 + 2.0),  0.10);
        r += 0.40 * band(x, 0.62 + 0.07 * sin(t * 1.1 + 4.0),  0.16);
        r += 0.30 * band(x, 0.16 + 0.04 * sin(t * 0.8 + 1.0),  0.09);
        r += 0.25 * band(x, 0.85 + 0.05 * sin(t * 1.4 + 3.0),  0.14);

        float shimmer = 0.5 + 0.5 * sin(u_time * 0.4 + uv.x * 6.0);
        vec3 col = base + glow * r * topFade * 1.1
                  + cyan * r * r * topFade * 0.5 * (0.7 + 0.3 * shimmer);

        // Soft glow near top
        col += cyan * 0.06 * pow(max(0.0, uv.y - 0.75) * 4.0, 2.0)
              * band(x, 0.35 + 0.05 * sin(t), 0.25);

        // Vignette
        float vg = smoothstep(1.3, 0.4, distance(uv, vec2(0.5, 0.55)));
        col *= mix(0.8, 1.0, vg);

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    function sh(type: number, src: string): WebGLShader {
      const s = ctx.createShader(type)!;
      ctx.shaderSource(s, src);
      ctx.compileShader(s);
      return s;
    }

    const prog = ctx.createProgram()!;
    ctx.attachShader(prog, sh(ctx.VERTEX_SHADER, vsSrc));
    ctx.attachShader(prog, sh(ctx.FRAGMENT_SHADER, fsSrc));
    ctx.linkProgram(prog);
    ctx.useProgram(prog);

    const buf = ctx.createBuffer();
    ctx.bindBuffer(ctx.ARRAY_BUFFER, buf);
    ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), ctx.STATIC_DRAW);

    const loc = ctx.getAttribLocation(prog, 'p');
    ctx.enableVertexAttribArray(loc);
    ctx.vertexAttribPointer(loc, 2, ctx.FLOAT, false, 0, 0);

    const uRes = ctx.getUniformLocation(prog, 'u_res');
    const uTime = ctx.getUniformLocation(prog, 'u_time');

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = cv.clientWidth * dpr;
      cv.height = cv.clientHeight * dpr;
      ctx.viewport(0, 0, cv.width, cv.height);
    }
    window.addEventListener('resize', resize);
    resize();

    let rafId: number;
    function frame(t: number) {
      ctx.uniform2f(uRes, cv.width, cv.height);
      ctx.uniform1f(uTime, t * 0.001);
      ctx.drawArrays(ctx.TRIANGLES, 0, 3);
      rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
}