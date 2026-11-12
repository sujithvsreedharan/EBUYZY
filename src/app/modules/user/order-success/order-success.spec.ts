import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OrderSuccess } from './order-success';

describe('OrderSuccess', () => {
  let component: OrderSuccess;
  let fixture: ComponentFixture<OrderSuccess>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrderSuccess],
      providers: [provideRouter([])]
    }).compileComponents();

    fixture = TestBed.createComponent(OrderSuccess);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
