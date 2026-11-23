import { ApplicationConfig, ErrorHandler, Injectable, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';

@Injectable()
export class ChunkLoadErrorHandler implements ErrorHandler {
  handleError(error: any): void {
    const errorMsg = error?.message || String(error || '');
    const isChunkFailed =
      /Loading chunk [\d]+ failed/i.test(errorMsg) ||
      /Failed to fetch dynamically imported module/i.test(errorMsg) ||
      /error loading dynamically imported module/i.test(errorMsg);

    if (isChunkFailed) {
      const reloadKey = 'ebuyzy_chunk_reload_ts';
      const lastAttempt = sessionStorage.getItem(reloadKey);
      const now = Date.now();
      // Prevent infinite reload loops if server is truly down (allow reload at most once every 10 seconds)
      if (!lastAttempt || now - Number(lastAttempt) > 10000) {
        sessionStorage.setItem(reloadKey, String(now));
        window.location.reload();
        return;
      }
    }

    console.error('Application Error:', error);
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    { provide: ErrorHandler, useClass: ChunkLoadErrorHandler }
  ]
};

