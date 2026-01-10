import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const messageService = inject(MessageService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let severity = 'error';
      let summary = 'Error';
      let detail = 'An unexpected error occurred';

      if (error.error instanceof ErrorEvent) {
        // Client-side error
        detail = error.error.message;
      } else {
        // Server-side error
        summary = `Error ${error.status}`;

        // Try to extract the error message from the backend response
        // Backend typically sends { detail: "message" }
        if (error.error && error.error.detail) {
          detail = error.error.detail;
        } else if (error.error && error.error.message) {
          detail = error.error.message;
        } else {
          detail = error.message || error.statusText;
        }

        switch (error.status) {
          case 400:
            severity = 'warn';
            summary = 'Bad Request';
            break;
          case 401:
            severity = 'error';
            summary = 'Unauthorized';
            // Optionally redirect to login here
            break;
          case 403:
            severity = 'error';
            summary = 'Forbidden';
            break;
          case 404:
            severity = 'warn'; // Sometimes 404 is just "not found" which is info/warn
            summary = 'Not Found';
            break;
          case 422:
            severity = 'error';
            summary = 'Validation Error';
            break;
          case 500:
            severity = 'error';
            summary = 'Server Error';
            detail = 'Internal Server Error. Please try again later.';
            break;
        }
      }

      // Don't show toast for 401 if we are just checking auth status on load (optional refinement)
      // But for now, let's show it to be safe and explicit.

      messageService.add({
        severity: severity,
        summary: summary,
        detail: detail,
        life: 5000
      });

      return throwError(() => error);
    })
  );
};
