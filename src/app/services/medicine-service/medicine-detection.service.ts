import { Injectable, inject, ElementRef, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';
import { MedicineDetectionResponse, MedicineDetection } from '../types';

@Injectable({
  providedIn: 'root'
})
export class MedicineDetectionService {
  private readonly http = inject(HttpClient);
  private readonly messageService = inject(MessageService);
  private readonly API_URL = environment.apiUrl;

  // Medicine detection state
  medicineDetections = signal<MedicineDetection[]>([]);
  private readonly CONFIDENCE_THRESHOLD = 0.1; // 10% improvement required for replacement

  /**
   * Process medicine detection with API call
   */
  async processMedicineDetection(imageBlob: Blob, videoElement: ElementRef<HTMLVideoElement>, videoWidth: number, videoHeight: number): Promise<void> {
    try {
      const formData = new FormData();
      formData.append('image', imageBlob, 'medicine.jpg');

      const response = await firstValueFrom(this.http.post<MedicineDetectionResponse>(
        `${this.API_URL}/medicines/recognize`,
        formData
      ));

      console.log("Medicine Detection Response: ", response);

      if (response?.results?.length > 0) {
        this.handleMedicineDetectionResults(response.results, videoElement, videoWidth, videoHeight);
      }
    } catch (error) {
      console.error('Medicine detection error:', error);
      this.messageService.add({
        severity: 'warn',
        summary: 'Detection Error',
        detail: 'Unable to detect medicines. Please try again.',
        life: 3000
      });
    }
  }

  /**
   * Handle medicine detection results from API with persistence and confidence-based updates
   */
  private handleMedicineDetectionResults(
    results: MedicineDetectionResponse['results'],
    videoElement: ElementRef<HTMLVideoElement>,
    videoWidth: number,
    videoHeight: number
  ): void {
    if (!videoElement || !videoElement.nativeElement) return;

    const video = videoElement.nativeElement;

    let scaleX = 1;
    let scaleY = 1;
    let canCalculateBoundingBoxes = false;

    if (video.getBoundingClientRect) {
      try {
        const videoRect = video.getBoundingClientRect();

        if (videoRect.width > 0 && videoRect.height > 0) {
          scaleX = videoRect.width / videoWidth;
          scaleY = videoRect.height / videoHeight;
          canCalculateBoundingBoxes = true;
        } else {
          console.warn('Video element has zero dimensions, cannot calculate bounding boxes');
        }
      } catch (error) {
        console.warn('Error getting video bounding rect:', error);
      }
    } else {
      console.warn('Video element does not support getBoundingClientRect, medicines will be added without bounding boxes');
    }

    const newDetections: MedicineDetection[] = results.map((result, index) => {
      const detection: MedicineDetection = {
        id: `medicine_${Date.now()}_${index}`,
        name: result.classify.product.charAt(0).toUpperCase() + result.classify.product.slice(1),
        details: `Detected medicine with ${(result.detection.confidence * 100).toFixed(1)}% detection confidence`,
        confidence: result.detection.confidence,
        classifyConfidence: result.classify.confidence,
        bbox: canCalculateBoundingBoxes ? {
          x: result.detection.bbox.x * scaleX,
          y: result.detection.bbox.y * scaleY,
          width: result.detection.bbox.width * scaleX,
          height: result.detection.bbox.height * scaleY
        } : {
          x: -1, // Use -1 to indicate invalid bounding box
          y: -1,
          width: -1,
          height: -1
        }
      };

      return detection;
    });

    this.medicineDetections.update(currentDetections => {
      return this.mergeDetectionsWithConfidenceCheck(currentDetections, newDetections);
    });

    const newMedicineNames = this.getNewlyDetectedMedicines(newDetections);
    if (newMedicineNames.length > 0) {
      this.messageService.add({
        severity: 'success',
        summary: 'New Medicines Detected',
        detail: `Found: ${newMedicineNames.join(', ')}`,
        life: 4000
      });
    }
  }

  /**
   * Merge new detections with existing ones based on confidence thresholds
   */
  private mergeDetectionsWithConfidenceCheck(
    currentDetections: MedicineDetection[],
    newDetections: MedicineDetection[]
  ): MedicineDetection[] {
    const mergedDetections = [...currentDetections];

    for (const newDetection of newDetections) {
      const existingIndex = mergedDetections.findIndex(
        existing => existing.name.toLowerCase() === newDetection.name.toLowerCase()
      );

      if (existingIndex >= 0) {
        const existing = mergedDetections[existingIndex];
        const avgCurrentConfidence = (existing.confidence + (existing.classifyConfidence || 0)) / 2;
        const avgNewConfidence = (newDetection.confidence + (newDetection.classifyConfidence || 0)) / 2;

        if (avgNewConfidence > avgCurrentConfidence) {
          mergedDetections[existingIndex] = {
            ...newDetection,
            id: existing.id,
            details: `Updated: ${(newDetection.confidence * 100).toFixed(1)}% confidence (improved)`
          };

          this.messageService.add({
            severity: 'info',
            summary: 'Detection Updated',
            detail: `${newDetection.name} detection improved to ${(avgNewConfidence * 100).toFixed(1)}%`,
            life: 2000
          });
        }
      } else {
        mergedDetections.push(newDetection);
      }
    }

    return mergedDetections;
  }

  /**
   * Get names of newly detected medicines (not updates to existing ones)
   */
  private getNewlyDetectedMedicines(newDetections: MedicineDetection[]): string[] {
    const currentMedicineNames = this.medicineDetections().map(m => m.name.toLowerCase());
    return newDetections
      .filter(detection => !currentMedicineNames.includes(detection.name.toLowerCase()))
      .map(detection => detection.name);
  }

  /**
   * Handle medicine dispensing (remove from storage)
   */
  dispenseMedicine(medicine: MedicineDetection): void {
    console.log('Dispensing medicine:', medicine.name);

    this.messageService.add({
      severity: 'success',
      summary: 'Medicine Dispensed',
      detail: `${medicine.name} has been dispensed from storage`,
      life: 3000
    });


    this.removeFromDetection(medicine);
  }

  /**
   * Add medicine to storage inventory
   */
  addToStorage(medicine: MedicineDetection): void {
    console.log('Adding medicine to storage:', medicine.name);

    this.messageService.add({
      severity: 'success',
      summary: 'Medicine Added to Storage',
      detail: `${medicine.name} has been added to storage inventory`,
      life: 3000
    });

    // TODO: Call API to update storage inventory (increase stock)
    // await this.medicineService.addMedicineToStorage(medicine.name, quantity);

    // Remove the medicine from detection results after adding to storage
    this.removeFromDetection(medicine);
  }

  /**
   * Remove medicine from detection list without any inventory action
   */
  removeFromDetection(medicine: MedicineDetection): void {
    console.debug('Removing medicine from detection:', medicine.name);
    this.medicineDetections.update(currentDetections => {
      return currentDetections.filter(m => m.medicine?.name !== medicine.medicine?.name);
    });

    this.messageService.add({
      severity: 'info',
      summary: 'Medicine Removed',
      detail: `${medicine.name} removed from detection list`,
      life: 2000
    });

    if (this.medicineDetections().length === 0) {
      this.messageService.add({
        severity: 'info',
        summary: 'No Medicines Detected',
        detail: 'Hold medicine packages in front of camera to detect them',
        life: 3000
      });
    }
  }

  /**
   * Clear all detected medicines
   */
  clearAllDetections(): void {
    this.medicineDetections.update(() => []);

    this.messageService.add({
      severity: 'info',
      summary: 'Detections Cleared',
      detail: 'All medicine detections have been cleared',
      life: 2000
    });
  }

  resetDetections(): void {
    this.medicineDetections.update(() => []);
  }

  isProcessing(): boolean {
    return false;
  }

  /**
   * Process frame for medicine detection using real video element
   */
  async processFrameWithVideoElement(frame: ImageData, videoElement: ElementRef<HTMLVideoElement>): Promise<void> {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = frame.width;
      canvas.height = frame.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.putImageData(frame, 0, 0);

      return new Promise((resolve) => {
        canvas.toBlob(async (blob) => {
          if (blob) {
            await this.processMedicineDetection(blob, videoElement, frame.width, frame.height);
            resolve();
          } else {
            resolve();
          }
        }, 'image/jpeg', 0.8);
      });
    } catch (error) {
      console.error('Error processing frame for medicine detection:', error);
    }
  }

  /**
   * Get detections observable
   */
  get detections$() {
    return {
      subscribe: (callback: (detections: any[] | null) => void) => {
        const interval = setInterval(() => {
          callback(this.medicineDetections().map(detection => ({
            medicine: {
              id: detection.id,
              name: detection.name,
              description: detection.details,
              stock: 100,
              image_path: ''
            },
            confidence: detection.confidence,
            bbox: detection.bbox,
            lastSeen: new Date()
          })));
        }, 1000);

        return {
          unsubscribe: () => clearInterval(interval)
        };
      }
    };
  }
}
