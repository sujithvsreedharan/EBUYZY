import { Component } from '@angular/core';
import { Staffs } from '../staffs/staffs';

@Component({
  selector: 'app-sub-admins',
  standalone: true,
  imports: [Staffs],
  template: '<app-staffs></app-staffs>'
})
export class SubAdmins {}
