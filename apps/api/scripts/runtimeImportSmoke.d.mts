export function extractRuntimeSpecifiers(source: string): string[];
export function checkRuntimeImports(rootDir: string): {
  files: number;
  packages: string[];
  missing: { spec: string; from: string }[];
};
