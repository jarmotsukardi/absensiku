export const debugLog = (...args: unknown[]): void => {
  if (!import.meta.env.DEV) return;
  console.debug(...args);
};
