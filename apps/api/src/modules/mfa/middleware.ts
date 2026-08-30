/**
 * requireFreshMfa — the step-up gate that sits in front of the admin router,
 * after requireAuth and requireAdmin.
 *
 * The problem it exists for: `role: 'admin'` currently rides on a session
 * established by a password alone, and GET /admin/users lists every account on
 * the platform. One phished password is the whole user table.
 */
import type { RequestHandler } from 'express';
import { config } from '../../platform/config';
import { AppError } from '../../platform/errors';
import { logEvent } from '../../platform/telemetry';
import { auditDataAccess } from '../me/service';
import { accessTokenOf, findFreshStepUp, isMfaActive } from './service';

/** Where a client is told to go to satisfy the gate. */
export const MFA_CHALLENGE_PATH = '/api/v1/auth/mfa/challenge';
export const MFA_ENROL_PATH = '/api/v1/auth/mfa/enroll';

/**
 * Three outcomes, and the middle one is the migration posture:
 *
 *  1. MFA enrolled + a fresh step-up bound to this access token -> through.
 *  2. MFA enrolled, no fresh step-up -> 403 with `reason: 'mfa_step_up_required'`.
 *  3. MFA not enrolled -> refused when MFA_REQUIRE_ADMIN is on; otherwise
 *     allowed through, but every such request is written to the audit
 *     container AND to stdout first. "No MFA enrolled" never silently means
 *     "gate disabled" — it means "gate open and shouting about it".
 *
 * Note that (1) and (2) apply regardless of the flag: enrolling is
 * self-enforcing, so an admin who has set up an authenticator is protected
 * immediately without waiting for an operator to flip anything.
 *
 * FORBIDDEN carries a machine-readable `details.reason` rather than a new
 * top-level error code, so the shared error taxonomy in packages/shared is
 * untouched by this change.
 */
export const requireFreshMfa: RequestHandler = (req, _res, next) => {
  const user = req.user;
  if (!user) {
    next(new AppError('AUTH_REQUIRED', 'Authentication required'));
    return;
  }
  try {
    const route = `${req.method} ${req.baseUrl}${req.path}`;
    if (isMfaActive(user.id)) {
      const token = accessTokenOf(req);
      if (token && findFreshStepUp(user.id, token)) {
        next();
        return;
      }
      auditDataAccess(user.id, 'admin.mfa.stepup_required', { route });
      logEvent('mfa.admin.stepup_required', { userId: user.id, route });
      next(
        new AppError('FORBIDDEN', 'Re-verify with your authenticator to continue.', {
          reason: 'mfa_step_up_required',
          challengePath: MFA_CHALLENGE_PATH,
        }),
      );
      return;
    }

    if (config.mfaRequireAdmin) {
      auditDataAccess(user.id, 'admin.mfa.enrolment_required', { route });
      logEvent('mfa.admin.enrolment_required', { userId: user.id, route });
      next(
        new AppError('FORBIDDEN', 'Administrator accounts must enrol a second factor.', {
          reason: 'mfa_enrolment_required',
          enrolPath: MFA_ENROL_PATH,
        }),
      );
      return;
    }

    // The loud unenrolled path. Audited and logged on EVERY request, not once
    // per session: an operator reading either sink must be able to see how much
    // admin traffic is still running on a password alone.
    auditDataAccess(user.id, 'admin.mfa.unenforced', { route });
    logEvent('mfa.admin.unenforced', {
      userId: user.id,
      route,
      detail:
        'Administrator reached an admin route with no second factor enrolled. ' +
        'Enrol at ' + MFA_ENROL_PATH + ' and set MFA_REQUIRE_ADMIN=true to close this.',
    });
    next();
  } catch (err) {
    next(err);
  }
};
