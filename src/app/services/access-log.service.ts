import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AccessLog } from './types';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AccessLogService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/access-logs`;

  getAccessLogs(limit: number = 50, offset: number = 0): Observable<AccessLog[]> {
    return this.http.get<AccessLog[]>(`${this.apiUrl}/?limit=${limit}&offset=${offset}`);
  }

  createAccessLog(userId: number, action: string): Observable<AccessLog> {
    return this.http.post<AccessLog>(this.apiUrl, { user_id: userId, action });
  }
}
