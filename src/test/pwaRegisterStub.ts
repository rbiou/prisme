/**
 * Substitut de test pour le module virtuel fourni par vite-plugin-pwa.
 * `usePwaUpdate` n'importe ce module qu'en production ; l'alias évite à
 * Vitest d'échouer sur la résolution de `virtual:pwa-register`.
 */
export function registerSW(): () => Promise<void> {
  return async () => undefined;
}
