/**
 * Transport security middleware.
 *
 * Helmet already sends HSTS, but HSTS only binds a browser that has *already*
 * completed one successful https request. The very first plaintext request —
 * the one a user makes by typing the bare domain, and the one an attacker on
 * the same network is waiting for — is unprotected unless the origin refuses
 * to answer it. That refusal is what this file adds.
 *
 * Behind a TLS-terminating ingress (Azure Container Apps, App Service, Front
 * Door, managed PaaS) the socket reaching Node is plaintext on every request, so
 * `req.secure` alone would redirect forever. Express derives `req.secure` from
 * X-Forwarded-Proto only for hops covered by `trust proxy`, which app.ts sets
 * from config.trustProxy — so `req.secure` is the correct signal here provided
 * TRUST_PROXY matches the real topology. That pairing is exactly what
 * `assertTrustProxyHeaders` below watches for at runtime.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { config } from './config';

/**
 * Paths that must stay reachable over plaintext.
 *
 * Orchestrator probes commonly dial the container's own http port directly and
 * do not follow redirects; a 301 there reads as unhealthy and the platform
 * restarts a container that is fine. ACME http-01 validation has the same
 * shape — the challenge is served over http by definition, so redirecting it
 * would make certificate renewal fail, which is the opposite of the goal.
 */
function isPlaintextExempt(path: string): boolean {
  return (
    path === '/health' ||
    path === '/ready' ||
    path.startsWith('/.well-known/acme-challenge/')
  );
}

/**
 * Redirect plaintext traffic to https in production.
 *
 * 308 rather than 301: a 301 lets intermediaries downgrade a POST to GET, so a
 * form submission that arrived over http would silently lose its body on the
 * way to the secure origin. 308 preserves method and body.
 *
 * Only GET/HEAD are actually worth redirecting, though — a redirected POST
 * replays credentials that already crossed the wire in the clear. Those are
 * refused outright so the client learns the request must be re-made securely
 * rather than believing it succeeded.
 *
 * Disabled outside production (there is no TLS on localhost) and switchable
 * off with FORCE_HTTPS=false for the rare deployment that terminates TLS in a
 * sidecar and genuinely serves plaintext on a private network.
 */
export const enforceHttps: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (!config.forceHttps) return next();
  if (req.secure) return next();
  if (isPlaintextExempt(req.path)) return next();

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(403).json({
      code: 'FORBIDDEN',
      message: 'This endpoint requires HTTPS.',
    });
    return;
  }

  // req.host honours the trusted X-Forwarded-Host; fall back to the Host header.
  const host = req.get('x-forwarded-host')?.split(',')[0]?.trim() || req.get('host');
  if (!host) {
    res.status(400).json({ code: 'VALIDATION_FAILED', message: 'Missing Host header.' });
    return;
  }
  res.redirect(308, `https://${host}${req.originalUrl}`);
};

/**
 * Runtime check that TRUST_PROXY describes the real deployment.
 *
 * Getting this wrong is silent and dangerous in both directions. Too low and
 * every client shares one rate-limit bucket keyed on the ingress IP, so the
 * per-IP auth lane locks out the whole platform after ten attempts. Too high
 * and Express believes a client-supplied X-Forwarded-For hop, which lets an
 * attacker forge `req.ip` and sidestep the limiter entirely — and, with
 * enforceHttps above, spoof `req.secure` as well.
 *
 * Neither failure produces an error, so the only way to find out is to look.
 * This logs once per process rather than per request: a mismatch is a
 * deployment-shaped fact, and one line is a signal while thousands are noise.
 */
let proxyWarningEmitted = false;

export function resetProxyWarning(): void {
  proxyWarningEmitted = false;
}

export const assertTrustProxyHeaders: RequestHandler = (req, _res, next) => {
  if (proxyWarningEmitted || config.isTest) return next();
  const expected = config.trustProxy;
  if (expected <= 0) return next();
  // Probes originate inside the cluster and legitimately carry no forwarding
  // chain; judging the topology from one would report a phantom mismatch.
  if (isPlaintextExempt(req.path)) return next();

  const raw = req.headers['x-forwarded-for'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  const hops = header ? header.split(',').filter((s) => s.trim() !== '').length : 0;

  if (hops !== expected) {
    proxyWarningEmitted = true;
    // eslint-disable-next-line no-console
    console.warn(
      JSON.stringify({
        t: new Date().toISOString(),
        kind: 'security',
        event: 'trust_proxy_mismatch',
        expectedHops: expected,
        observedHops: hops,
        detail:
          hops > expected
            ? 'More forwarding hops than trusted: req.ip is the wrong client and may be attacker-controlled. Raise TRUST_PROXY only if every extra hop is yours.'
            : 'Fewer forwarding hops than trusted: req.ip may collapse to the ingress address and rate limits will be shared. Lower TRUST_PROXY.',
      }),
    );
  }
  next();
};
