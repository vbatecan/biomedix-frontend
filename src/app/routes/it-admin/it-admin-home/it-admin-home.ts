import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { UserService } from '../../../services/user-service/user-service';
import { UserInput } from '../../../models/io-types';
import { HttpErrorResponse } from '@angular/common/http';
import { User } from '../../../services/types';
import { ItAdminNavigation } from '../it-admin-navigation/it-admin-navigation';

@Component({
  selector: 'app-it-admin-home',
  imports: [CommonModule, ReactiveFormsModule, ItAdminNavigation],
  templateUrl: './it-admin-home.html',
  styleUrl: './it-admin-home.css'
})
export class ItAdminHome implements OnInit {
  private userService = inject(UserService);
  private formBuilder = inject(FormBuilder);

  // Signals for state management
  users = signal<User[]>([]);
  loading = signal(false);
  error = signal('');
  success = signal('');
  selectedFile = signal<File | null>(null);
  showRegistrationForm = signal(false);
  processingUserId = signal<string | null>(null);

  // Computed signals
  hasUsers = computed(() => this.users().length > 0);
  isFormValid = computed(() =>
    this.userForm.valid && this.selectedFile() !== null
  );

  // Available roles
  roles = ['PHARMACIST', 'IT_ADMIN', 'SUPERVISOR'];

  // Reactive form
  userForm: FormGroup = this.formBuilder.group({
    face_name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    is_active: [true],
    role: ['PHARMACIST', Validators.required]
  });

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.loading.set(true);
    this.error.set('');

    this.userService.getAllUsers().subscribe({
      next: (response) => {
        this.users.set(response);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Error loading users: ' + (err.error?.message || err.message));
        this.loading.set(false);
      }
    });
  }

  onFileSelected(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const file = target.files[0];

      // Validate file type
      if (!file.type.startsWith('image/')) {
        this.error.set('Please select a valid image file');
        this.selectedFile.set(null);
        target.value = '';
      } else {
        this.selectedFile.set(file);
        this.error.set('');
      }
    }
  }

  registerUser() {
    this.error.set('');
    this.success.set('');

    if (!this.userForm.valid) {
      this.error.set('Please fill in all required fields correctly');
      return;
    }

    if (!this.selectedFile()) {
      this.error.set('Selfie image is required');
      return;
    }

    this.loading.set(true);

    const userInput: UserInput = this.userForm.value;
    this.userService.create(userInput, this.selectedFile()!).subscribe({
      next: (response) => {
        this.success.set('User registered successfully!');
        this.resetForm();
        this.users.update(users => [...users, response]);
        this.showRegistrationForm.set(false);
        this.loading.set(false);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set('Error registering user: ' + (err.error?.message || err.message));
        this.loading.set(false);
      }
    });
  }

  resetForm() {
    this.userForm.reset({
      face_name: '',
      email: '',
      password: '',
      is_active: true,
      role: 'PHARMACIST'
    });
    this.selectedFile.set(null);

    // Reset file input
    const fileInput = document.getElementById('selfieInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  toggleRegistrationForm() {
    this.showRegistrationForm.update(show => !show);
    if (!this.showRegistrationForm()) {
      this.resetForm();
      this.error.set('');
      this.success.set('');
    }
  }

  getStatusBadgeClass(isActive: boolean): string {
    return isActive ? 'badge-active' : 'badge-inactive';
  }

  getRoleBadgeClass(role: string): string {
    switch (role) {
      case 'IT_ADMIN':
        return 'badge-admin';
      case 'SUPERVISOR':
        return 'badge-supervisor';
      case 'PHARMACIST':
        return 'badge-pharmacist';
      default:
        return 'badge-default';
    }
  }

  trackByUserId(index: number, user: User): string {
    return user.id || index.toString();
  }

  deleteUser(user: User): void {
    const confirmed = confirm(
      `Are you sure you want to delete user "${user.face_name}" (${user.email})?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    if (!user.id) {
      this.error.set('Cannot delete user: Invalid user ID');
      return;
    }

    this.processingUserId.set(user.id);
    this.error.set('');
    this.success.set('');

    this.userService.delete(Number(user.id)).subscribe({
      next: () => {
        this.success.set(`User "${user.face_name}" has been deleted successfully`);
        // Remove user from local state
        this.users.update(users => users.filter(u => u.id !== user.id));
        this.processingUserId.set(null);
      },
      error: (err: HttpErrorResponse) => {
        this.error.set('Error deleting user: ' + (err.error?.message || err.message));
        this.processingUserId.set(null);
      }
    });
  }

  toggleUserStatus(user: User): void {
    const newStatus = !user.is_active;
    const actionText = newStatus ? 'activate' : 'deactivate';

    const confirmed = confirm(
      `Are you sure you want to ${actionText} user "${user.face_name}"?\n\n` +
      `This will ${newStatus ? 'enable' : 'disable'} their access to the system.`
    );

    if (!confirmed) return;

    if (!user.id) {
      this.error.set('Cannot update user: Invalid user ID');
      return;
    }

    this.processingUserId.set(user.id);
    this.error.set('');
    this.success.set('');

    this.userService.toggleUserActiveStatus(Number(user.id), newStatus).subscribe({
      next: (updatedUser) => {
        this.success.set(
          `User "${user.face_name}" has been ${newStatus ? 'activated' : 'deactivated'} successfully`
        );

        this.users.update(users =>
          users.map(u => u.id === user.id ? { ...u, is_active: newStatus } : u)
        );
        this.processingUserId.set(null);
      },
      error: (err: HttpErrorResponse) => {

        this.error.set(`Error ${actionText}ing user: ` + (err.error?.message || err.message));
        this.processingUserId.set(null);
      }
    });
  }

  isUserBeingProcessed(user: User): boolean {
    return this.processingUserId() === user.id;
  }

  get faceNameControl() {
    return this.userForm.get('face_name');
  }

  get emailControl() {
    return this.userForm.get('email');
  }

  get passwordControl() {
    return this.userForm.get('password');
  }

  get roleControl() {
    return this.userForm.get('role');
  }

  get isActiveControl() {
    return this.userForm.get('is_active');
  }
}
