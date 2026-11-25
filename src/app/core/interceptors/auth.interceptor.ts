import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { apiUrl } from '../../app.constant';

const TOKEN_KEY = 'ebuyzy_auth_token';
const USER_KEY = 'ebuyzy_auth_user';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const isApiRequest = req.url.startsWith(apiUrl);
  let requestToSend = req;

  if (isApiRequest && !req.headers.has('Authorization')) {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) {
        requestToSend = req.clone({
          setHeaders: { Authorization: `Bearer ${token}` }
        });
      }
    } catch {
      // Ignore storage access errors
    }
  }

  return next(requestToSend).pipe(
    catchError((err: unknown) => {
      if (
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        isApiRequest &&
        !req.url.includes('/api/login') &&
        !req.url.includes('/api/registerCustomer')
      ) {
        try {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
        } catch {
          // Ignore storage access errors
        }
      }
      return throwError(() => err);
    })
  );
};
