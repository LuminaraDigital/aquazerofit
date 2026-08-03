import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './motion';

/**
 * The landing hero's 3D centrepiece: a raymarched liquid metaball in the
 * AquaZeroFit palette, drawn as a single full-screen triangle over a
 * transparent canvas so the page gradient shows through its glow.
 *
 * Written against raw WebGL for the same reason AppBackground is — a 3D
 * library would add a runtime dependency (and a third-party licence entry)
 * for one element. One draw call per frame, no geometry, no textures.
 *
 * Guards, in order of importance:
 *  - prefers-reduced-motion  → never initialises; the CSS fallback shows
 *  - no WebGL context        → returns quietly, CSS fallback shows
 *  - scrolled out of view    → rAF stops (IntersectionObserver)
 *  - backgrounded tab        → rAF stops (the browser pauses it anyway)
 *  - context loss            → cancels cleanly instead of throwing per frame
 */

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_pointer;

/* Polynomial smooth minimum — the join that makes three spheres read as
   one body of liquid rather than three spheres. */
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float map(vec3 p) {
  float t = u_time * 0.45;
  float d = length(p - vec3(sin(t) * 0.30, cos(t * 0.9) * 0.22, 0.0)) - 0.76;
  d = smin(d, length(p - vec3(cos(t * 1.1) * 0.46, sin(t * 0.7) * 0.38, sin(t * 0.8) * 0.30)) - 0.44, 0.55);
  d = smin(d, length(p - vec3(sin(t * 0.6 + 2.0) * 0.50, cos(t * 1.3) * 0.34, cos(t * 0.5) * 0.36)) - 0.34, 0.50);
  /* Surface ripple. Breaks the distance bound slightly, which is why the
     march below steps at 0.82 of the reported distance. */
  d += 0.028 * sin(5.0 * p.x + t * 2.0) * sin(4.5 * p.y - t * 1.6) * sin(4.0 * p.z + t);
  return d;
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.0028, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)
  ));
}

vec2 rot(vec2 v, float a) {
  float s = sin(a), c = cos(a);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);

  /* The uv multiplier is the field of view. It has to be wide enough that the
     metaball (roughly 1.3 units of half-extent once the spheres swing apart)
     sits inside the frame with clear air around it — too narrow and the ray
     starts inside the body, which renders as a flat wash with no silhouette. */
  vec3 ro = vec3(0.0, 0.0, 3.05);
  vec3 rd = normalize(vec3(uv * 1.7, -1.65));

  /* Pointer parallax: orbit the camera, not the object, so the lighting
     stays anchored and the shape reads as solid. */
  float ax = u_pointer.y * 0.30;
  float ay = u_pointer.x * 0.38;
  ro.yz = rot(ro.yz, ax); rd.yz = rot(rd.yz, ax);
  ro.xz = rot(ro.xz, ay); rd.xz = rot(rd.xz, ay);

  float t = 0.0;
  float hit = 0.0;
  vec3 p = ro;
  for (int i = 0; i < 72; i++) {
    p = ro + rd * t;
    float d = map(p);
    if (d < 0.0018) { hit = 1.0; break; }
    if (t > 6.5) break;
    t += d * 0.82;
  }

  vec3 cyan  = vec3(0.18, 0.85, 0.96);   /* #2fd9f4 */
  vec3 green = vec3(0.27, 0.87, 0.64);   /* #45dfa4 */
  vec3 deep  = vec3(0.015, 0.13, 0.18);

  vec3 col = vec3(0.0);
  float alpha = 0.0;

  if (hit > 0.5) {
    vec3 n = normalAt(p);
    vec3 v = -rd;
    vec3 l = normalize(vec3(0.55, 0.85, 0.70));

    float diff = max(dot(n, l), 0.0);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 2.6);
    float spec = pow(max(dot(reflect(-l, n), v), 0.0), 56.0);

    /* Iridescent body: the tint travels across the surface over time. Kept
       dark and glass-like — a bright fill reads as a flat pastel disc and
       swallows the device sitting in front of it. The light lives in the rim. */
    vec3 tint = mix(cyan, green, 0.5 + 0.5 * sin(u_time * 0.5 + p.y * 2.2 + p.x));
    col = mix(deep, tint, 0.20 + 0.36 * diff);
    col += fres * mix(cyan, vec3(1.0), 0.22) * 1.55;   /* rim light */
    col += spec * 0.55;                                 /* specular */
    col += cyan * 0.08 * sin(9.0 * p.y - u_time * 1.2) * (1.0 - fres); /* caustic banding */
    alpha = 0.90;
  }

  /* Halo that exists whether or not the ray hit, so the orb sits in light
     rather than being cut out of the page. */
  float halo = exp(-3.0 * length(uv)) * 0.34;
  col += mix(cyan, green, 0.35) * halo;
  alpha = clamp(max(alpha, halo * 1.5), 0.0, 1.0);

  gl_FragColor = vec4(col, alpha);
}
`;

/**
 * `className` owns the element's size and position — pass a positioning class
 * (the hero uses `absolute`), because the inner glow is laid out against this
 * wrapper. Do not add `relative` here: a caller passing `absolute` would then
 * lose, and the 640px box would join the grid flow and squeeze its siblings.
 */
export function HeroOrb({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      powerPreference: 'low-power',
    });
    if (!gl) return;

    const compile = (type: number, src: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      return shader;
    };

    const program = gl.createProgram();
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!program || !vs || !fs) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const attr = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(attr);
    gl.vertexAttribPointer(attr, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, 'u_res');
    const uTime = gl.getUniformLocation(program, 'u_time');
    const uPointer = gl.getUniformLocation(program, 'u_pointer');

    gl.clearColor(0, 0, 0, 0);

    /* Raymarching is fragment-bound: cap the pixel budget rather than the
       device ratio alone, so a 4K display does not pay 4x for a decoration. */
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      const budget = 900_000;
      const scale = w * h > budget ? Math.sqrt(budget / (w * h)) : 1;
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    /* Pointer target is smoothed towards, so the orb glides instead of snapping. */
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    const onPointer = (event: PointerEvent) => {
      target.x = (event.clientX / window.innerWidth) * 2 - 1;
      target.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onPointer, { passive: true });

    let raf = 0;
    let running = true;
    let lost = false;

    const frame = (ms: number) => {
      raf = 0;
      if (!running || lost) return;
      current.x += (target.x - current.x) * 0.05;
      current.y += (target.y - current.y) * 0.05;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, ms * 0.001);
      gl.uniform2f(uPointer, current.x, current.y);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (!running || lost || raf) return;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    /* Off-screen and backgrounded tabs render nothing. */
    const observer =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              running = entries.some((e) => e.isIntersecting);
              if (running) start();
              else stop();
            },
            { threshold: 0 },
          )
        : null;
    observer?.observe(canvas);
    if (!observer) start();

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      stop();
    };
    canvas.addEventListener('webglcontextlost', onLost);

    start();
    setLive(true);

    return () => {
      setLive(false);
      stop();
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onLost);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return (
    <div className={className} aria-hidden="true">
      {/* CSS stand-in: the whole visual when WebGL is unavailable or motion is
          reduced, faded out once the shader takes over — leaving both on stacks
          two glows into a flat pastel disc. */}
      <div
        className={`absolute inset-[12%] rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(138,235,255,0.45),rgba(47,217,244,0.22)_38%,rgba(69,223,164,0.12)_58%,transparent_72%)] blur-2xl transition-opacity duration-1000 ${
          live ? 'opacity-0' : 'opacity-100'
        }`}
      />
      <canvas ref={canvasRef} className="relative w-full h-full" />
    </div>
  );
}
