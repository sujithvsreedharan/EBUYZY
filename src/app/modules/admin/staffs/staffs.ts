import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { SubAdminService } from '../../../core/services/sub-admin.service';
import { AdminPagePermission, PERMISSION_DEFINITIONS, PermissionDefinition, StaffRecord, StaffType } from '../../../core/models/sub-admin.model';
import { AuthService, StaffRoleItem, StaffCounts, StaffApiItem } from '../../../core/services/auth.service';

@Component({
  selector: 'app-staffs',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './staffs.html',
  styleUrl: './staffs.css'
})
export class Staffs implements OnInit {
  private readonly fb = inject(FormBuilder);
  protected readonly staffService = inject(SubAdminService);
  protected readonly authService = inject(AuthService);

  readonly permissionDefinitions: PermissionDefinition[] = PERMISSION_DEFINITIONS;

  // Search & Filter State
  readonly searchQuery = signal<string>('');
  readonly selectedFilter = signal<'all' | 'sub_admin' | 'delivery_person' | 'active'>('all');

  // Backend Initial Data Signals (PROC_STAFF_DETAILS)
  // Recordset 0: Staff roles dropdown
  readonly staffRoles = signal<StaffRoleItem[]>([
    { id: 1001, name: 'DELIVERY PARTNER', desc: 'Staff member who picks up and delivers orders to customers' },
    { id: 1002, name: 'SUB ADMIN', desc: 'Staff manager who handles orders and stock and can add delivery partners' }
  ]);
  // Recordset 1: KPI dashboard counts
  readonly staffCounts = signal<StaffCounts | null>(null);
  readonly isLoading = signal<boolean>(false);

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
    roleId: [1002, [Validators.required]],
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    roleTitle: ['', [Validators.required, Validators.minLength(2)]],
    vehicleType: [''],
    vehicleNumber: [''],
    zone: ['']
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

  // KPI Computations from Backend Counts (Recordset 1) or local store fallback
  readonly totalStaffCount = computed(() => {
    const c = this.staffCounts();
    if (c && typeof c.total === 'number') return c.total;
    return this.staffService.staffs().length;
  });
  readonly subAdminCount = computed(() => {
    const c = this.staffCounts();
    if (c && typeof c.sub_admin === 'number') return c.sub_admin;
    return this.staffService.subAdminList().length;
  });
  readonly deliveryPersonCount = computed(() => {
    const c = this.staffCounts();
    if (c && typeof c.delivery_part === 'number') return c.delivery_part;
    return this.staffService.deliveryPersons().length;
  });
  readonly activeCount = computed(() => {
    const c = this.staffCounts();
    if (c && typeof c.active_emp === 'number') return c.active_emp;
    return this.staffService.staffs().filter((s) => s.isActive).length;
  });

  ngOnInit(): void {
    this.loadInitialData();
  }

  /**
   * Load initial staff page data via GET /admin/staff/initial
   * - Recordset 0: Staff roles dropdown
   * - Recordset 1: KPI metric counts
   * - Recordset 2: Staff roster list
   */
  loadInitialData(): void {
    this.isLoading.set(true);
    this.authService.getStaffInitial().subscribe({
      next: (res) => {
        this.isLoading.set(false);
        if (res && res.success) {
          // 1. Roles dropdown
          if (Array.isArray(res.roles) && res.roles.length > 0) {
            this.staffRoles.set(res.roles);
          }
          // 2. Counts
          if (res.counts) {
            this.staffCounts.set(res.counts);
          }
          // 3. Staff roster
          if (Array.isArray(res.staff)) {
            // Deduplicate staff records by slno
            const uniqueStaffMap = new Map<number, StaffApiItem>();
            for (const item of res.staff) {
              if (item && item.slno != null && !uniqueStaffMap.has(item.slno)) {
                uniqueStaffMap.set(item.slno, item);
              }
            }
            const uniqueStaff = Array.from(uniqueStaffMap.values());

            const existingMap = new Map(this.staffService.staffs().map((s) => [s.id, s]));
            const mapped: StaffRecord[] = uniqueStaff.map((item) => {
              const isDelivery = String(item.role || '').toUpperCase().includes('DELIVERY');
              const existing = existingMap.get(String(item.slno));
              return {
                id: String(item.slno),
                type: isDelivery ? 'delivery_person' : 'sub_admin',
                name: item.name,
                email: item.email || '',
                phone: item.phone || '',
                roleTitle: item.desc || (isDelivery ? 'Delivery Partner' : 'Sub-Admin'),
                permissions: existing?.permissions || (isDelivery ? ['assigned_orders'] : ['orders', 'dashboard']),
                vehicleType: item.vehicleType || existing?.vehicleType,
                vehicleNumber: item.vehicleNumber || existing?.vehicleNumber,
                zone: item.address || existing?.zone || 'Kakkanad, Kochi',
                isActive: item.status === 1 || item.status === true,
                createdAt: existing?.createdAt || new Date().toISOString()
              };
            });

            if (mapped.length > 0 || (res.counts && res.counts.total === 0)) {
              this.staffService.staffs.set(mapped);
            }
          }
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        console.warn('Initial staff data fetch warning:', err);
      }
    });
  }

  // Dropdown Change Handler
  onRoleDropdownChange(roleIdValue: number | string): void {
    const roleId = Number(roleIdValue);
    this.staffForm.get('roleId')?.setValue(roleId);
    const roleObj = this.staffRoles().find((r) => r.id === roleId);
    const roleName = (roleObj?.name || '').toUpperCase();

    if (roleId === 1001 || roleName.includes('DELIVERY')) {
      this.setStaffType('delivery_person');
    } else {
      this.setStaffType('sub_admin');
    }
  }

  // Modal Controls
  openCreateModal(type: StaffType = 'sub_admin'): void {
    this.editingStaff.set(null);
    this.selectedStaffType.set(type);
    this.formError.set(null);

    const isDelivery = type === 'delivery_person';
    const matchingRoleId = isDelivery ? 1001 : 1002;

    this.staffForm.get('password')?.setValidators([Validators.required, Validators.minLength(8)]);
    this.staffForm.get('password')?.updateValueAndValidity();

    this.staffForm.reset({
      roleId: matchingRoleId,
      name: '',
      email: '',
      phone: '',
      password: '',
      roleTitle: isDelivery ? 'Kakkanad Express Delivery Partner' : 'Order Dispatch Executive',
      vehicleType: 'Honda Activa (Scooter)',
      vehicleNumber: '',
      zone: 'Kakkanad & Infopark'
    });

    this.selectedPermissions.set(isDelivery ? ['assigned_orders'] : ['orders', 'dashboard']);
    this.isModalOpen.set(true);
  }

  setStaffType(type: StaffType): void {
    this.selectedStaffType.set(type);
    const isDelivery = type === 'delivery_person';
    const matchingRoleId = isDelivery ? 1001 : 1002;
    this.staffForm.get('roleId')?.setValue(matchingRoleId);

    const currentTitle = this.staffForm.get('roleTitle')?.value;

    if (isDelivery && (!currentTitle || currentTitle === 'Order Dispatch Executive')) {
      this.staffForm.patchValue({
        roleTitle: 'Kakkanad Express Delivery Partner'
      });
      this.selectedPermissions.set(['assigned_orders']);
    } else if (!isDelivery && (!currentTitle || currentTitle.includes('Delivery Partner'))) {
      this.staffForm.patchValue({
        roleTitle: 'Order Dispatch Executive'
      });
      this.selectedPermissions.set(['orders', 'dashboard']);
    }
  }

  openEditModal(staff: StaffRecord): void {
    this.editingStaff.set(staff);
    this.selectedStaffType.set(staff.type || 'sub_admin');
    this.formError.set(null);

    const isDelivery = staff.type === 'delivery_person';
    const roleId = isDelivery ? 1001 : 1002;

    this.staffForm.get('password')?.clearValidators();
    this.staffForm.get('password')?.updateValueAndValidity();

    this.staffForm.patchValue({
      roleId,
      name: staff.name,
      email: staff.email,
      phone: staff.phone,
      password: '',
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
      const controls = this.staffForm.controls;
      let error = 'Please check the required fields.';
      if (controls['name'].invalid) error = 'Please enter full name (at least 2 characters).';
      else if (controls['phone'].invalid) error = 'Please enter a valid 10-digit mobile number.';
      else if (controls['email'].invalid) error = 'Please enter a valid email address.';
      else if (controls['password'].invalid) error = 'Password must be at least 8 characters.';
      else if (controls['roleTitle'].invalid) error = 'Please enter role title / designation.';
      this.formError.set(error);
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
    const cleanPhone = String(formValues.phone || '').replace(/\D/g, '').slice(-10);
    const editing = this.editingStaff();

    if (editing) {
      this.staffService.updateStaff(editing.id, {
        type,
        name: formValues.name!,
        email: formValues.email!,
        phone: cleanPhone,
        roleTitle: formValues.roleTitle!,
        permissions: perms as AdminPagePermission[],
        vehicleType: formValues.vehicleType || undefined,
        vehicleNumber: formValues.vehicleNumber || undefined,
        zone: formValues.zone || undefined
      });
      this.isSubmitting.set(false);
      this.closeModal();
      this.showNotice(`Staff member "${formValues.name}" updated successfully!`);
    } else {
      const selectedRoleId = Number(formValues.roleId) || (type === 'delivery_person' ? 1001 : 1002);
      const staffRole = selectedRoleId === 1001 ? 'DELIVERY_PARTNER' : 'SUB_ADMIN';
      const typeLabel = staffRole === 'DELIVERY_PARTNER' ? 'Delivery Partner' : 'Sub-Admin';

      // Register staff via backend API (POST /api/admin/staff)
      this.authService
        .registerStaff({
          name: formValues.name!,
          mobile: cleanPhone,
          email: formValues.email!,
          password: formValues.password!,
          role: staffRole,
          address: formValues.zone || formValues.vehicleNumber || undefined,
          dept: 1,
          desig: 1,
          vehicleType: formValues.vehicleType || undefined,
          vehicleNumber: formValues.vehicleNumber || undefined
        })
        .subscribe({
          next: (res: any) => {
            this.isSubmitting.set(false);
            this.closeModal();
            const msg = res?.message || `${typeLabel} "${formValues.name}" created successfully!`;
            this.showNotice(msg);
            // Refresh table list & counts directly from DB API without page reload
            this.loadInitialData();
          },
          error: (err) => {
            this.isSubmitting.set(false);
            console.error('Backend staff registration error:', err);
            const msg = err?.error?.message || err?.message || 'Failed to create staff account. Please try again.';
            this.formError.set(msg);
          }
        });
    }
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
    const creds = `${roleLabel}:\nUsername/Email: ${staff.email}\nPhone: ${staff.phone}\nPortal: ${window.location.origin}/admin/login\nPassword: (set when account was created)`;
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
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {}
    setTimeout(() => this.successNotice.set(null), 5000);
  }
}

// Backward compatibility alias export
export const SubAdmins = Staffs;

