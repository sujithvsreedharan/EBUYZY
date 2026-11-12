import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DeliveryAreaModal } from './delivery-area-modal';

describe('DeliveryAreaModal', () => {
  let component: DeliveryAreaModal;
  let fixture: ComponentFixture<DeliveryAreaModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeliveryAreaModal],
      providers: [provideRouter([])]
    }).compileComponents();

    fixture = TestBed.createComponent(DeliveryAreaModal);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

