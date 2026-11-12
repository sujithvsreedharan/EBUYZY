import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SubAdmins } from './sub-admins';

describe('SubAdmins', () => {
  let component: SubAdmins;
  let fixture: ComponentFixture<SubAdmins>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubAdmins],
      providers: [provideRouter([])]
    }).compileComponents();

    fixture = TestBed.createComponent(SubAdmins);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
