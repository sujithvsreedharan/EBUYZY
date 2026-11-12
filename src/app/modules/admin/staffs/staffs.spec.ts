import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Staffs } from './staffs';

describe('Staffs', () => {
  let component: Staffs;
  let fixture: ComponentFixture<Staffs>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Staffs],
      providers: [provideRouter([])]
    }).compileComponents();

    fixture = TestBed.createComponent(Staffs);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

