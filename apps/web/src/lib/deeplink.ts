/**
 * Modular deep link parser and router (inspired by DeepLinkKit).
 * Handles Telegram `startapp` parameters, web URL query parameters (`?startapp=`, `?deeplink=`),
 * and path-based deep linking for AquaZeroFit.
 */

import { useEffect } from 'react';
import { getTelegramStartParam } from '@/lib/telegram';

export interface DeepLinkResult {
  raw: string;
  action: string;
  targetPath?: string;
  params: Record<string, string>;
}

export type DeepLinkHandler = (
  result: DeepLinkResult,
  navigate: (path: string) => void,
) => boolean | void;

export class DeepLinkRouter {
  private handlers = new Map<string, DeepLinkHandler>();

  constructor() {
    this.registerDefaultRoutes();
  }

  /**
   * Register a route action handler.
   */
  public register(action: string, handler: DeepLinkHandler): void {
    this.handlers.set(action.toLowerCase(), handler);
  }

  /**
   * Register default AquaZeroFit deep link routes.
   */
  private registerDefaultRoutes(): void {
    // Log Meal (e.g. startapp=log_meal or startapp=log_meal_breakfast)
    this.register('log_meal', (res, navigate) => {
      const type = res.params.type || 'breakfast';
      navigate(`/nutrition?action=add_meal&meal=${type}`);
      return true;
    });

    // Scan Barcode
    this.register('scan_barcode', (_res, navigate) => {
      navigate('/nutrition?action=scan_barcode');
      return true;
    });

    // Scan Meal (Smart Scan AI)
    this.register('scan_meal', (_res, navigate) => {
      navigate('/nutrition/capture');
      return true;
    });

    // Water Add (e.g. startapp=water_add or startapp=water_add_250)
    this.register('water_add', (res, navigate) => {
      const amount = res.params.amount || '250';
      navigate(`/nutrition?action=water_add&amount=${amount}`);
      return true;
    });

    // Buddy Challenge (e.g. startapp=challenge_abc123)
    this.register('challenge', (res, navigate) => {
      const id = res.params.id || res.params.code;
      if (id) {
        navigate(`/challenges?code=${id}`);
      } else {
        navigate('/challenges');
      }
      return true;
    });

    // Coach Select / Chat (e.g. startapp=coach_akin)
    this.register('coach', (res, navigate) => {
      const id = res.params.id;
      if (id) {
        navigate(`/coach?id=${id}`);
      } else {
        navigate('/coach');
      }
      return true;
    });

    // AI Meal Plan
    this.register('meal_plan', (_res, navigate) => {
      navigate('/nutrition/meal-plan');
      return true;
    });
  }

  /**
   * Parse a raw input string (Telegram start_param or web query string) into a structured DeepLinkResult.
   */
  public parse(input?: string): DeepLinkResult | null {
    const raw = input || getTelegramStartParam() || this.extractWebQueryParam();
    if (!raw || typeof raw !== 'string') return null;

    const trimmed = raw.trim();
    if (!trimmed) return null;

    // Handle encoded JSON or key=val params
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed) as { action?: string; path?: string; [key: string]: unknown };
        if (parsed.action) {
          const params: Record<string, string> = {};
          for (const [k, v] of Object.entries(parsed)) {
            if (k !== 'action' && k !== 'path') params[k] = String(v);
          }
          return {
            raw: trimmed,
            action: String(parsed.action).toLowerCase(),
            targetPath: parsed.path ? String(parsed.path) : undefined,
            params,
          };
        }
      } catch {
        // Fall back to string parsing
      }
    }

    // Standard format: action_param1_param2 or action?key=val
    const [actionPart, queryPart] = trimmed.split('?');
    const parts = actionPart.split('_');
    const action = parts[0].toLowerCase();
    const params: Record<string, string> = {};

    // Parse underscore positional parameters (e.g. log_meal_breakfast -> action: log_meal, type: breakfast)
    if (action === 'log' && parts[1] === 'meal') {
      const fullAction = 'log_meal';
      if (parts[2]) params.type = parts[2];
      return { raw: trimmed, action: fullAction, params };
    }

    if (action === 'scan' && (parts[1] === 'barcode' || parts[1] === 'meal')) {
      const fullAction = `scan_${parts[1]}`;
      return { raw: trimmed, action: fullAction, params };
    }

    if (action === 'water' && parts[1] === 'add') {
      const fullAction = 'water_add';
      if (parts[2]) params.amount = parts[2];
      return { raw: trimmed, action: fullAction, params };
    }

    if ((action === 'challenge' || action === 'coach') && parts[1]) {
      params.id = parts[1];
      return { raw: trimmed, action, params };
    }

    // Generic fallback for underscore splitting
    if (parts.length > 1) {
      params.param1 = parts[1];
      if (parts[2]) params.param2 = parts[2];
    }

    // Parse query params if present in deep link string
    if (queryPart) {
      const searchParams = new URLSearchParams(queryPart);
      searchParams.forEach((v, k) => {
        params[k] = v;
      });
    }

    return {
      raw: trimmed,
      action,
      params,
    };
  }

  /**
   * Helper to extract `startapp` or `deeplink` or `start` query params from window.location.
   */
  private extractWebQueryParam(): string | null {
    if (typeof window === 'undefined') return null;
    const url = new URL(window.location.href);
    return (
      url.searchParams.get('startapp') ||
      url.searchParams.get('deeplink') ||
      url.searchParams.get('start') ||
      null
    );
  }

  /**
   * Route deep link input to registered handler or execute navigation.
   */
  public route(input?: string, navigate?: (path: string) => void): boolean {
    const parsed = this.parse(input);
    if (!parsed || !navigate) return false;

    // Check registered action handler
    const handler = this.handlers.get(parsed.action);
    if (handler) {
      const handled = handler(parsed, navigate);
      return handled !== false;
    }

    // Direct path routing fallback
    if (parsed.targetPath) {
      navigate(parsed.targetPath);
      return true;
    }

    return false;
  }
}

export const defaultDeepLinkRouter = new DeepLinkRouter();

/**
 * Convenience helper to parse a deep link string.
 */
export function parseDeepLink(input?: string): DeepLinkResult | null {
  return defaultDeepLinkRouter.parse(input);
}

/**
 * Convenience helper to route a deep link string.
 */
export function handleDeepLink(input?: string, navigate?: (path: string) => void): boolean {
  return defaultDeepLinkRouter.route(input, navigate);
}

/**
 * React hook to process deep links on component mount / app start.
 */
export function useDeepLinkRouter(navigate: (path: string) => void): void {
  useEffect(() => {
    handleDeepLink(undefined, navigate);
  }, [navigate]);
}
