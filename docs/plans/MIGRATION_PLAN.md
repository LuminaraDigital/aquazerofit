# Vite 8.x Migration Plan

## Overview
This document outlines the required changes to migrate from Vite 5.x to Vite 8.x to resolve the esbuild vulnerability chain (CVE-2024-XXXXX). This is a **breaking change** migration that requires careful testing.

## Current State
- **vite**: 5.4.0 → **8.2.0** (breaking)
- **@vitejs/plugin-react**: 4.3.1 → **6.0.5** (breaking)
- **vitest**: 2.1.9 (web) / 2.0.5 (api) → **4.1.10** (breaking)
- **@vitest/mocker**: transitive via vitest → **4.1.10**
- **vite-node**: transitive via vitest → **6.0.0**

## Vulnerability Chain
```
esbuild ≤0.24.2 (moderate)
  └── vite ≤6.4.2
      └── @vitest/mocker ≤3.0.0-beta.4
          └── vitest ≤3.2.5
              └── vite-node ≤2.2.0-beta.2
```

## Required Changes

### 1. Root package.json
```json
{
  "devDependencies": {
    "tsx": "^4.16.2"  // Keep - compatible
  }
}
```

### 2. apps/web/package.json
```json
{
  "devDependencies": {
    "@vitejs/plugin-react": "^6.0.5",   // UPDATE: 4.3.1 → 6.0.5
    "vite": "^8.2.0",                     // UPDATE: 5.4.0 → 8.2.0
    "vitest": "^4.1.10"                   // UPDATE: 2.1.9 → 4.1.10
  }
}
```

### 3. apps/api/package.json
```json
{
  "devDependencies": {
    "vitest": "^4.1.10"                   // UPDATE: 2.0.5 → 4.1.10
  }
}
```

### 4. Vite Config Changes (apps/web/vite.config.ts)
**Breaking Changes in Vite 8:**
- `vite build` now uses ES modules by default
- `define` config behavior changed
- `server.hmr` config structure updated
- CSS handling changes

**Plugin React 6 Changes:**
- New JSX transform options
- Updated React Fast Refresh integration
- Different default behaviors

### 5. Vitest 4.x Migration (apps/web/vitest.config.ts, apps/api/vitest.config.ts)
**Breaking Changes in Vitest 4:**
- Configuration structure changes
- `globals` default behavior
- Test runner internals updated
- Coverage provider changes (@vitest/coverage-v8)

### 6. TypeScript Config Updates
May need adjustments for:
- Module resolution changes
- New JSX transform options
- ES module interop

## Testing Checklist

### Pre-Migration Baseline
- [ ] Run `npm run verify` - confirm all passes
- [ ] Run `npm run build` - confirm build works
- [ ] Run `npm run test` - confirm all tests pass
- [ ] Run `npm run typecheck` - confirm no type errors

### Migration Steps
1. [ ] Backup current node_modules and package-lock.json
2. [ ] Update package.json versions as specified above
3. [ ] Run `npm install` at root
4. [ ] Fix any vite.config.ts breaking changes
5. [ ] Fix any vitest.config.ts breaking changes
6. [ ] Fix any TypeScript config issues
7. [ ] Run `npm run typecheck`
8. [ ] Run `npm run test`
9. [ ] Run `npm run build`
10. [ ] Run `npm run verify`

### Post-Migration Validation
- [ ] All unit tests pass
- [ ] Integration tests pass
- [ ] Build produces valid output
- [ ] Dev server starts correctly
- [ ] Hot Module Replacement works
- [ ] No runtime errors in browser console

## Rollback Plan
If migration fails:
1. Restore package.json files from backup
2. Delete node_modules and package-lock.json
3. Run `npm install`
4. Verify `npm run verify` passes

## Timeline
- **P1 Priority**: Document and prepare
- **Testing**: Apply in feature branch, full test suite
- **Merge**: After all validations pass

## References
- [Vite 8 Migration Guide](https://vite.dev/guide/migration.html)
- [Vitest 4 Migration Guide](https://vitest.dev/guide/migration.html)
- [@vitejs/plugin-react v6 Changelog](https://github.com/vitejs/vite-plugin-react/releases)