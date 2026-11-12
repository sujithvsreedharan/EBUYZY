import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { CategoryService } from '../../../core/services/category.service';
import { Category } from '../../../core/models/category.model';

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './categories.html',
  styleUrl: './categories.css',
})
export class Categories {
  private readonly fb = inject(FormBuilder);
  private readonly categoryService = inject(CategoryService);

  readonly categories = toSignal(this.categoryService.getCategories(), { initialValue: [] });

  readonly searchQuery = signal<string>('');
  readonly isModalOpen = signal<boolean>(false);
  readonly editingCategory = signal<Category | null>(null);
  readonly categoryToDelete = signal<Category | null>(null);
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  readonly categoryForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)]],
    description: ['']
  });

  readonly filteredCategories = computed(() => {
    const list = this.categories();
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.slug.toLowerCase().includes(query) ||
        (c.description && c.description.toLowerCase().includes(query))
    );
  });

  openAddModal(): void {
    this.editingCategory.set(null);
    this.errorMessage.set(null);
    this.categoryForm.reset({
      name: '',
      slug: '',
      description: ''
    });
    this.isModalOpen.set(true);
  }

  openEditModal(category: Category): void {
    this.editingCategory.set(category);
    this.errorMessage.set(null);
    this.categoryForm.setValue({
      name: category.name,
      slug: category.slug,
      description: category.description || ''
    });
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.editingCategory.set(null);
    this.categoryForm.reset();
  }

  generateSlugFromName(): void {
    const name = this.categoryForm.get('name')?.value || '';
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-');
    this.categoryForm.patchValue({ slug });
  }

  saveCategory(): void {
    if (this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    const formVal = this.categoryForm.getRawValue();

    if (this.editingCategory()) {
      this.categoryService
        .updateCategory(this.editingCategory()!.id, formVal)
        .subscribe({
          next: () => {
            this.isSubmitting.set(false);
            this.closeModal();
          },
          error: (err) => {
            this.isSubmitting.set(false);
            this.errorMessage.set(err.message || 'Failed to update category');
          }
        });
    } else {
      this.categoryService.addCategory(formVal).subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.closeModal();
        },
        error: (err) => {
          this.isSubmitting.set(false);
          this.errorMessage.set(err.message || 'Failed to add category');
        }
      });
    }
  }

  attemptDelete(category: Category): void {
    this.categoryToDelete.set(category);
  }

  executeDelete(id: string): void {
    this.categoryService.deleteCategory(id).subscribe({
      next: () => {
        this.categoryToDelete.set(null);
      }
    });
  }
}
