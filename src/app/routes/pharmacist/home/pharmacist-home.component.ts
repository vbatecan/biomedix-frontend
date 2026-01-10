import { Component, computed, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { FileUploadModule } from 'primeng/fileupload';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { CreateMedicineRequest, FileSelectEvent, Medicine, StockSeverity } from '../../../models/io-types';
import { TextareaModule } from 'primeng/textarea';
import { MedicineService } from '../../../services/medicine-service/medicine-service';
import { HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { TableModule } from 'primeng/table';

@Component({
  selector: 'app-pharmacist-home',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    CardModule,
    DialogModule,
    InputTextModule,
    InputNumberModule,
    FileUploadModule,
    TagModule,
    ToastModule,
    ConfirmDialogModule,
    TooltipModule,
    TextareaModule,
    TableModule
  ],
  templateUrl: './pharmacist-home.component.html',
  styleUrls: ['./pharmacist-home.component.css'],
  providers: [MessageService, ConfirmationService]
})
export class PharmacistHomeComponent {
  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;
  @ViewChild('trainingUpload') trainingUpload!: any; // specific type can be tricky with imports sometimes, using any for safety or FileUpload if imported

  private readonly API_URL = environment.apiUrl;
  private fb = inject(FormBuilder);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private readonly medicineService = inject(MedicineService);

  medicines = signal<Medicine[]>([]);
  loading = signal(false);
  displayDialog = signal(false);
  displayViewDialog = signal(false);
  isEditing = signal(false);
  selectedMedicine = signal<Medicine | null>(null);
  thumbnailPreview = signal<string>('');
  trainingImagePreviews = signal<string[]>([]);
  selectedThumbnailFile = signal<File | null>(null);
  selectedTrainingFiles = signal<File[]>([]);

  totalMedicines = computed(() => this.medicines().length);
  medicineForm: FormGroup;

  constructor() {
    this.medicineForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100)]],
      description: ['', [Validators.required, Validators.maxLength(255)]],
      stock: [0, [Validators.required, Validators.min(0)]]
    });

    this.loadMedicines();
  }

  loadMedicines(): void {
    this.loading.set(true);
    this.medicineService.getAllMedicines().subscribe({
      next: (response) => {
        this.medicines.set(
          response.map(medicine => {
            return {
              ...medicine,
              image_path: `${this.API_URL}/medicines/${medicine.image_path}`
            }
          })
        );
        this.loading.set(false);
      },
      error: (error) => {
        console.error('Error fetching medicines:', error);
        this.loading.set(false);
      }
    });
  }

  openNewMedicineDialog(): void {
    this.isEditing.set(false);
    this.selectedMedicine.set(null);
    this.resetForm();
    this.displayDialog.set(true);
  }

  openEditMedicineDialog(medicine: Medicine): void {
    this.isEditing.set(true);
    this.selectedMedicine.set(medicine);
    this.medicineForm.patchValue({
      name: medicine.name,
      description: medicine.description,
      stock: medicine.stock
    });
    this.thumbnailPreview.set(medicine.image_path);
    this.displayDialog.set(true);
  }

  viewMedicine(medicine: Medicine): void {
    this.selectedMedicine.set(medicine);
    this.displayViewDialog.set(true);
  }

  deleteMedicine(medicine: Medicine): void {
    this.confirmationService.confirm({
      message: `Are you sure you want to delete ${medicine.name}?`,
      header: 'Confirm Delete',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.medicineService.deleteMedicine(medicine.id).subscribe({
          next: () => {
            const currentMedicines = this.medicines();
            const updatedMedicines = currentMedicines.filter(m => m.id !== medicine.id);
            this.medicines.set(updatedMedicines);

            this.messageService.add({
              severity: 'success',
              summary: 'Success',
              detail: 'Medicine deleted successfully'
            });
          },
          error: (error) => {
            console.error('Error deleting medicine:', error);
          }
        });
      }
    });
  }

  saveMedicine(): void {
    if (this.medicineForm.valid) {
      const formData = this.medicineForm.value;

      if (this.isEditing()) {
        const currentMedicines = this.medicines();
        const medicineIndex = currentMedicines.findIndex(m => m.id === this.selectedMedicine()?.id);
        if (medicineIndex !== -1) {
          const updatedMedicine: Medicine = {
            ...currentMedicines[medicineIndex],
            ...formData
          };
          const updatedMedicines = [...currentMedicines];
          updatedMedicines[medicineIndex] = updatedMedicine;
          this.medicines.set(updatedMedicines);
        }

        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Medicine updated successfully'
        });
      } else {
        const newMedicine: Medicine = {
          id: Date.now(),
          ...formData,
          image_path: this.thumbnailPreview() || 'https://picsum.photos/256'
        };

        const currentMedicines = this.medicines();
        this.medicines.set([...currentMedicines, newMedicine]);

        // Medicine input
        const thumbnailFile = this.selectedThumbnailFile();
        if (!thumbnailFile) {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Thumbnail image is required'
          });
          return;
        }

        const medicineInput: CreateMedicineRequest = {
          name: formData.name,
          description: formData.description,
          stock: formData.stock,
          thumbnail: thumbnailFile,
          training_files: Array.from(this.selectedTrainingFiles())
        }

        // Robustness check: Sync with FileUpload component if signal is empty
        if (this.selectedTrainingFiles().length === 0 && this.trainingUpload && this.trainingUpload.files && this.trainingUpload.files.length > 0) {
          console.log('Signal was empty but FileUpload has files. Syncing...');
          this.selectedTrainingFiles.set(this.trainingUpload.files);
          medicineInput.training_files = Array.from(this.trainingUpload.files);
        }

        if (this.selectedTrainingFiles().length === 0) {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'At least one training file is required'
          });
          return;
        }

        this.medicineService.createMedicine(medicineInput).subscribe({
          next: (response) => {
            console.log(response);
            const medicines = this.medicines();
            this.medicines.set([...medicines, response]);
            this.messageService.add({
              severity: 'success',
              summary: 'Success',
              detail: 'Medicine added successfully'
            });
          },
          error: (error: HttpErrorResponse) => {
            console.error('Error adding medicine:', error);
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: error.error.detail || 'Failed to add medicine'
            });
          }
        });
      }

      this.hideDialog();
    }
  }

  hideDialog(): void {
    this.displayDialog.set(false);
    this.displayViewDialog.set(false);
    this.resetForm();
  }

  resetForm(): void {
    this.medicineForm.reset({
      name: '',
      description: '',
      stock: 0
    });
    this.thumbnailPreview.set('');
    this.trainingImagePreviews.set([]);
    this.selectedThumbnailFile.set(null);
    this.selectedTrainingFiles.set([]);
    if (this.trainingUpload) {
      this.trainingUpload.clear();
    }
  }

  onThumbnailSelect(event: FileSelectEvent): void {
    const file = event.files[0];
    if (file) {
      this.selectedThumbnailFile.set(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        this.thumbnailPreview.set(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  onTrainingImagesSelect(event: any): void {
    console.log('onTrainingImagesSelect triggered with event:', event);

    let files: File[] = [];
    if (event.files) {
      files = event.files;
    } else if (event.currentFiles) {
      files = event.currentFiles;
    } else if (event.target && event.target.files) {
      // Standard DOM event
      files = Array.from(event.target.files);
    } else if (event.originalEvent && event.originalEvent.target && event.originalEvent.target.files) {
      // PrimeNG wrapped DOM event sometimes
      files = Array.from(event.originalEvent.target.files);
    }

    // Fallback: Check the ViewChild directly if event parsing gave nothing
    if ((!files || files.length === 0) && this.trainingUpload && this.trainingUpload.files && this.trainingUpload.files.length > 0) {
      console.log('Event did not yield files, falling back to ViewChild files');
      files = Array.from(this.trainingUpload.files);
    }

    if (files && files.length > 0) {
      this.selectedTrainingFiles.set(files);
      console.log('Selected training files updated:', files.length);

      const promises: Promise<string>[] = [];
      const fileArray = Array.from(files);

      fileArray.forEach(file => {
        promises.push(new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            resolve(e.target?.result as string);
          };
          reader.readAsDataURL(file);
        }));
      });

      Promise.all(promises).then(previews => {
        this.trainingImagePreviews.set(previews);
        console.log('Training image previews generated:', previews.length);
      });
    } else {
      console.warn('onTrainingImagesSelect triggered but no files found in event');
    }
  }

  getStockSeverity(stock: number): StockSeverity {
    if (stock === 0) return 'danger';
    if (stock <= 10) return 'warning';
    return 'success';
  }
}
