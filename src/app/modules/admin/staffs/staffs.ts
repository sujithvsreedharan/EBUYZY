import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { SubAdminService } from '../../../core/services/sub-admin.service';
import { AdminPagePermission, PERMISSION_DEFINITIONS, PermissionDefinition, StaffRecord, StaffType } from '../../../core/models/sub-admin.model';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-staffs',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './staffs.html',
  styleUrl: './staffs.css'
})
export class Staffs {
  private readonly fb = inject(FormBuilder);
  protected readonly staffService = inject(SubAdminService);
  protected readonly authService = inject(AuthService);

  readonly permissionDefinitions: PermissionDefinition[] = PERMISSION_DEFINITIONS;

  // Search & Filter State
  readonly searchQuery = signal<string>('');
  readonly selectedFilter = signal<'all' | 'sub_admin' | 'delivery_person' | 'active'>('all');

  // Modal State
  readonly isModalOpen = signal<boolean>(false);
  readonly editingStaff = signal<StaffRecord | null>(null);
  readonly selectedStaffType = signal<StaffType>('sub_admin');
  readonly isSubmitting = signal<boolean>(false);
  readonly formError = signal<string | null>(null);
  readonly successNotice = signal<string | null>(null);
  readonly copiedStaffId = signal<string | null>(null);

  // Selected tick-marked permissions inside the modal (for Sub-Admins)
  readonly selectedPermissions = signal<AdminPagePermission[]>(['orders', 'dashboard']);

  // Reactive Form
  readonly staffForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required, Validators.pattern(/^[6-9]\d{9}$/)]],
    password: ['order123', [Validators.required, Validators.minLength(4)]],
    roleTitle: ['Order Dispatch Executive', [Validators.required, Validators.minLength(2)]],
    vehicleType: ['Honda Activa (Scooter)'],
    vehicleNumber: ['KL-07-CD-4521'],
    zone: ['Kakkanad & Infopark']
  });

  // Filtered staff list
  readonly filteredStaffs = computed(() => {
    const list = this.staffService.staffs();
    const query = this.searchQuery().trim().toLowerCase();
    const filter = this.selectedFilter();

    return list.filter((staff) => {
      // Search match
      const matchesSearch =
        !query ||
        staff.name.toLowerCase().includes(query) ||
        staff.email.toLowerCase().includes(query) ||
        staff.phone.includes(query) ||
        staff.roleTitle.toLowerCase().includes(query) ||
        (staff.vehicleNumber && staff.vehicleNumber.toLowerCase().includes(query)) ||
        (staff.zone && staff.zone.toLowerCase().includes(query));

      if (!matchesSearch) return false;

      // Filter match
      if (filter === 'sub_admin') {
        return staff.type === 'sub_admin';
      }
      if (filter === 'delivery_person') {
        return staff.type === 'delivery_person';
      }
      if (filter === 'active') {
        return staff.isActive;
      }
      return true;
    });
  });

  // KPI Computations
  readonly totalStaffCount = computed(() => this.staffService.staffs().length);
  readonly subAdminCount = computed(() => this.staffService.subAdminList().length);
  readonly deliveryPersonCount = computed(() => this.staffService.deliveryPersons().length);
  readonly activeCount = computed(() => this.staffService.staffs().filter((s) => s.isActive).length);

  // Modal Controls
  openCreateModal(type: StaffType = 'sub_admin'): void {
    this.editingStaff.set(null);
    this.selectedStaffType.set(type);
    this.formError.set(null);

    const isDelivery = type === 'delivery_person';
    this.staffForm.reset({
      name: '',
      email: '',
      phone: '',
      password: isDelivery ? 'delivery123' : 'order123',
      roleTitle: isDelivery ? 'Kakkanad Express Delivery Partner' : 'Order Dispatch Executive',
      vehicleType: 'Honda Activa (Scooter)',
      vehicleNumber: 'KL-07-CD-4521',
      zone: 'Kakkanad & Infopark'
    });

    this.selectedPermissions.set(isDelivery ? ['assigned_orders'] : ['orders', 'dashboard']);
    this.isModalOpen.set(true);
  }

  setStaffType(type: StaffType): void {
    this.selectedStaffType.set(type);
    const isDelivery = type === 'delivery_person';
    const currentTitle = this.staffForm.get('roleTitle')?.value;

    if (isDelivery && (!currentTitle || currentTitle === 'Order Dispatch Executive')) {
      this.staffForm.patchValue({
        roleTitle: 'Kakkanad Express Delivery Partner',
        password: this.staffForm.get('password')?.value || 'delivery123'
      });
      this.selectedPermissions.set(['assigned_orders']);
    } else if (!isDelivery && (!currentTitle || currentTitle.includes('Delivery Partner'))) {
      this.staffForm.patchValue({
        roleTitle: 'Order Dispatch Executive',
        password: this.staffForm.get('password')?.value || 'order123'
      });
      this.selectedPermissions.set(['orders', 'dashboard']);
    }
  }

  openEditModal(staff: StaffRecord): void {
    this.editingStaff.set(staff);
    this.selectedStaffType.set(staff.type || 'sub_admin');
    this.formError.set(null);

    this.staffForm.patchValue({
      name: staff.name,
      email: staff.email,
      phone: staff.phone,
      password: staff.password || 'order123',
      roleTitle: staff.roleTitle,
      vehicleType: staff.vehicleType || '',
      vehicleNumber: staff.vehicleNumber || '',
      zone: staff.zone || ''
    });

    this.selectedPermissions.set([...staff.permissions]);
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.editingStaff.set(null);
    this.formError.set(null);
  }

  // Permission Tick-Mark Controls
  isPermissionSelected(permId: AdminPagePermission): boolean {
    return this.selectedPermissions().includes(permId);
  }

  togglePermission(permId: AdminPagePermission): void {
    const current = this.selectedPermissions();
    if (current.includes(permId)) {
      this.selectedPermissions.set(current.filter((p) => p !== permId));
    } else {
      this.selectedPermissions.set([...current, permId]);
    }
  }

  // Quick Preset Handlers for Sub-Admins
  applyPreset(preset: 'order-manager' | 'inventory-manager' | 'all' | 'orders-only'): void {
    switch (preset) {
      case 'order-manager':
        this.selectedPermissions.set(['orders', 'dashboard']);
        this.staffForm.patchValue({ roleTitle: 'Order Dispatch Executive' });
        break;
      case 'orders-only':
        this.selectedPermissions.set(['orders']);
        this.staffForm.patchValue({ roleTitle: 'Order Handling Assistant' });
        break;
      case 'inventory-manager':
        this.selectedPermissions.set(['products', 'categories', 'dashboard']);
        this.staffForm.patchValue({ roleTitle: 'Catalog & Inventory Manager' });
        break;
      case 'all':
        this.selectedPermissions.set(['orders', 'dashboard', 'products', 'categories', 'customers', 'settings']);
        this.staffForm.patchValue({ roleTitle: 'General Store Operations' });
        break;
    }
  }

  // Form Submit Handler
  saveStaff(): void {
    if (this.staffForm.invalid) {
      this.staffForm.markAllAsTouched();
      return;
    }

    const type = this.selectedStaffType();
    const perms = type === 'delivery_person' ? ['assigned_orders'] : this.selectedPermissions();

    if (type === 'sub_admin' && perms.length === 0) {
      this.formError.set('Please tick-mark at least one page permission for this Sub-Admin.');
      return;
    }

    this.isSubmitting.set(true);
    this.formError.set(null);

    const formValues = this.staffForm.getRawValue();
    const editing = this.editingStaff();

    if (editing) {
      this.staffService.updateStaff(editing.id, {
        type,
        name: formValues.name!,
        email: formValues.email!,
        phone: formValues.phone!,
        password: formValues.password!,
        roleTitle: formValues.roleTitle!,
        permissions: perms as AdminPagePermission[],
        vehicleType: formValues.vehicleType || undefined,
        vehicleNumber: formValues.vehicleNumber || undefined,
        zone: formValues.zone || undefined
      });
      this.showNotice(`Staff member "${formValues.name}" updated successfully!`);
    } else {
      this.staffService.createStaff({
        type,
        name: formValues.name!,
        email: formValues.email!,
        phone: formValues.phone!,
        password: formValues.password!,
        roleTitle: formValues.roleTitle!,
        permissions: perms as AdminPagePermission[],
        vehicleType: formValues.vehicleType || undefined,
        vehicleNumber: formValues.vehicleNumber || undefined,
        zone: formValues.zone || undefined,
        isActive: true
      });
      const typeLabel = type === 'delivery_person' ? 'Delivery Partner' : 'Sub-Admin';
      this.showNotice(`${typeLabel} "${formValues.name}" created successfully!`);
    }

    this.isSubmitting.set(false);
    this.closeModal();
  }

  // Row Action Handlers
  toggleActiveStatus(staff: StaffRecord): void {
    this.staffService.toggleStatus(staff.id);
    const updatedStatus = !staff.isActive ? 'activated' : 'deactivated';
    this.showNotice(`Staff account for ${staff.name} has been ${updatedStatus}.`);
  }

  deleteStaff(staff: StaffRecord): void {
    const roleLabel = staff.type === 'delivery_person' ? 'Delivery Partner' : 'Sub-Admin';
    const confirmed = confirm(
      `Are you sure you want to remove ${roleLabel} "${staff.name}" (${staff.email})?\n\nThey will no longer be able to log in to the admin portal.`
    );
    if (confirmed) {
      this.staffService.deleteStaff(staff.id);
      this.showNotice(`Staff member "${staff.name}" has been removed.`);
    }
  }

  copyCredentials(staff: StaffRecord): void {
    const roleLabel = staff.type === 'delivery_person' ? 'EBUYZY Delivery Partner Login' : 'EBUYZY Sub-Admin Login';
    const creds = `${roleLabel}:\nUsername/Email: ${staff.email}\nPhone: ${staff.phone}\nPassword: ${staff.password || 'delivery123'}\nPortal: ${window.location.origin}/admin/login`;
    navigator.clipboard.writeText(creds).then(() => {
      this.copiedStaffId.set(staff.id);
      setTimeout(() => this.copiedStaffId.set(null), 2500);
    });
  }

  getPermissionBadge(permId: AdminPagePermission): PermissionDefinition | undefined {
    return this.permissionDefinitions.find((p) => p.id === permId);
  }

  private showNotice(msg: string): void {
    this.successNotice.set(msg);
    setTimeout(() => this.successNotice.set(null), 4000);
  }
}

// Backward compatibility alias export
export const SubAdmins = Staffs;

