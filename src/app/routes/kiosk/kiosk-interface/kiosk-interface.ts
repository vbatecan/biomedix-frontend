import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { Subject, takeUntil } from 'rxjs';

import { CameraService } from '../../../services/camera.service';
import { FaceRecognitionService } from '../../../services/face-recognition-service/face-recognition.service';
import { MedicineDetectionService } from '../../../services/medicine-service/medicine-detection.service';
import { SystemService } from '../../../services/system-service/system-service';
import { AccessLog, MedicineDetection, MedicineInteractionResponse, SystemStatus, User } from '../../../services/types';
import { MedicineService } from '../../../services/medicine-service/medicine-service';
import { HttpErrorResponse } from '@angular/common/http';
import { AccessLogService } from '../../../services/access-log.service';

@Component({
  selector: 'app-kiosk-interface',
  standalone: true,
  imports: [CommonModule, FormsModule, ToastModule, ButtonModule],
  templateUrl: './kiosk-interface.html',
  styleUrl: './kiosk-interface.css',
  providers: [
    MessageService
  ]
})
export class KioskInterface implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('videoElement', { static: false }) videoElement!: ElementRef<HTMLVideoElement>;

  private cameraService = inject(CameraService);
  private faceRecognitionService = inject(FaceRecognitionService);
  private medicineDetectionService = inject(MedicineDetectionService);
  private systemService = inject(SystemService);
  private messageService = inject(MessageService);
  private medicineService = inject(MedicineService);
  private accessLogService = inject(AccessLogService);

  // Use the service's authenticatedUser signal
  readonly authenticatedUser = this.faceRecognitionService.authenticatedUser;
  readonly systemStatus = signal<SystemStatus>({ isOnline: false, lastSync: new Date() });
  readonly accessLogs = signal<AccessLog[]>([]);
  readonly selectedMedicine = signal<MedicineDetection | null>(null);

  readonly isCameraActive = computed(() => this.cameraService.isActive());
  readonly isProcessing = computed(() =>
    this.faceRecognitionService.isProcessing() ||
    this.medicineDetectionService.isProcessing()
  );

  readonly currentDetections = computed(() => this.medicineDetectionService.medicineDetections());
  readonly showAccessPanel = signal(false);
  readonly showSystemPanel = signal(false);

  private destroy$ = new Subject<void>();
  private isAnalyzing = false;

  ngOnInit() {
    this.updateSystemStatus();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.cameraService.stopCamera();
  }

  async ngAfterViewInit() {
    await this.initializeCamera();
    this.startProcessing();
  }

  private async initializeCamera() {
    try {
      await this.cameraService.initializeCamera(this.videoElement);
      this.messageService.add({
        severity: 'success',
        summary: 'Camera Ready',
        detail: 'Camera initialized successfully'
      });
    } catch (error) {
      console.error('Error initializing camera:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Camera Error',
        detail: 'Failed to initialize camera'
      });
    }
  }

  private startProcessing() {
    this.cameraService.startFrameProcessing(this.videoElement)
      .pipe(takeUntil(this.destroy$))
      .subscribe(frame => {
        if (frame) {
          this.processFrame(frame).then();
        }
      });
  }

  private async processFrame(frame: ImageData) {
    if (this.isAnalyzing) return;
    this.isAnalyzing = true;

    try {
      let faceResult: User | null = null;
      if (!this.isUserAuthenticated()) {
        faceResult = await this.faceRecognitionService.processFrame(frame);
      }

      if (faceResult) {
        this.logAccess(faceResult);
        this.messageService.add({
          severity: 'success',
          summary: 'Authentication Successful',
          detail: `Welcome ${faceResult.face_name || faceResult.email}!`,
          life: 3000
        });
      } else if (this.isUserAuthenticated()) {
        await this.medicineDetectionService.processFrameWithVideoElement(frame, this.videoElement);
      }
    } catch (error) {
      console.error('Error processing frame:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Processing Error',
        detail: 'Failed to process camera frame',
        life: 3000
      });
    } finally {
      this.isAnalyzing = false;
    }
  }



  private logAccess(user: User) {
    if (!user.id) return;

    const userId = parseInt(user.id);
    this.accessLogService.createAccessLog(userId, 'face_recognition_success').subscribe({
      next: (log) => {
        this.accessLogs.update(logs => [log, ...logs]);
      },
      error: (err) => console.error('Failed to save access log', err)
    });
  }

  private updateSystemStatus() {
    this.systemService.getSystemStatus().subscribe({
      next: (status: { status: boolean }) => {
        this.systemStatus.set({
          isOnline: status.status,
          lastSync: new Date()
        });
      },
      error: (error) => {
        console.error('Error fetching system status:', error);
        this.systemStatus.set({ isOnline: false, lastSync: new Date() });
      }
    });
  }

  selectMedicine(medicine: MedicineDetection) {
    this.selectedMedicine.set(medicine);
  }

  toggleAccessPanel() {
    this.showAccessPanel.update(show => {
      if (!show) {
        this.fetchAccessLogs();
      }
      return !show;
    });
  }

  fetchAccessLogs() {
    this.accessLogService.getAccessLogs().subscribe({
      next: (logs) => this.accessLogs.set(logs),
      error: (err) => console.error('Error fetching logs', err)
    });
  }

  closeAccessPanel() {
    this.showAccessPanel.set(false);
  }

  closeSystemPanel() {
    this.showSystemPanel.set(false);
  }

  toggleSystemPanel() {
    this.showSystemPanel.update(show => !show);
  }

  refreshCamera() {
    this.cameraService.stopCamera();
    this.initializeCamera().then();
  }

  logout() {
    this.faceRecognitionService.authenticatedUser.set(null);
    this.medicineDetectionService.resetDetections();
    this.selectedMedicine.set(null);
    this.showAccessPanel.set(false);
    this.showSystemPanel.set(false);

    this.messageService.add({
      severity: 'info',
      summary: 'Logged Out',
      detail: 'User session ended'
    });
  }

  dispenseMedicine(detection: MedicineDetection) {
    this.selectMedicine(detection);
    const medicineName = detection.medicine?.name || detection.name;

    this.medicineService.dispenseMedicine(medicineName, 1).subscribe({
      next: (response) => {
        console.log('Medicine dispensed:', response);
        this.medicineDetectionService.removeFromDetection(detection);
        this.messageService.add({
          severity: 'success',
          summary: 'Medicine Dispensed',
          detail: `${medicineName} has been dispensed from storage`,
          life: 3000
        });
      },
      error: (err: HttpErrorResponse) => {
        console.error('Error dispensing medicine:', err);
        const errorMsg = err.error?.detail || 'An error occurred while dispensing the medicine.';
        this.messageService.add({
          severity: 'error',
          summary: 'Dispense Error',
          detail: errorMsg,
          life: 5000
        });
      }
    });
  }

  addToStorage(detection: MedicineDetection) {
    this.selectMedicine(detection);
    const medicineName = detection.medicine?.name || detection.name;

    this.medicineService.addStock(medicineName, 1).subscribe({
      next: (response: MedicineInteractionResponse) => {
        console.log('Stock added:', response);
        this.medicineDetectionService.removeFromDetection(detection);
        this.messageService.add({
          severity: 'success',
          summary: 'Medicine Added',
          detail: `${medicineName} has been added to storage`,
          life: 3000
        });
      },
      error: (error: HttpErrorResponse) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Add Stock Error',
          detail: error.error?.detail || 'An error occurred while adding stock.',
          life: 5000
        })
      }
    })
  }

  readonly detectionCount = computed(() => this.currentDetections().length);
  readonly isUserAuthenticated = computed(() => this.authenticatedUser() !== null);
  readonly userName = computed(() => this.authenticatedUser()?.face_name || 'Unknown User');
  readonly userRole = computed(() => this.authenticatedUser()?.role || 'guest');

  getMedicineStatusClass(medicine: MedicineDetection): string {
    if (medicine.confidence > 0.8) return 'high-confidence';
    if (medicine.confidence > 0.6) return 'medium-confidence';
    return 'low-confidence';
  }

  formatTimestamp(date: Date | string | undefined): string {
    if (!date) return 'N/A';

    try {
      const dateObj = typeof date === 'string' ? new Date(date) : date;

      // Check for invalid date
      if (isNaN(dateObj.getTime())) {
        return 'Invalid Time';
      }

      return new Intl.DateTimeFormat('en-US', {
        timeStyle: 'medium',
        dateStyle: 'short'
      }).format(dateObj);
    } catch (e) {
      console.error('Date formatting error:', e);
      return 'Error';
    }
  }
}
