import { useEffect } from 'react';

/**
 * Hook to dynamically update the browser favicon based on tenant logo
 */
export function useTenantFavicon(logoUrl: string | null | undefined) {
  useEffect(() => {
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    
    if (link) {
      if (logoUrl) {
        link.href = logoUrl;
      } else {
        // Reset to default favicon
        link.href = '/favicon.png';
      }
    }
  }, [logoUrl]);
}
