import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AssignedOrders } from './assigned-orders';

describe('AssignedOrders', () => {
  let component: AssignedOrders;
  let fixture: ComponentFixture<AssignedOrders>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AssignedOrders],
      providers: [provideRouter([])]
    }).compileComponents();

    fixture = TestBed.createComponent(AssignedOrders);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

