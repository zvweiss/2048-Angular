import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './components/navbar/navbar.component'; // ✅ IMPORT

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent], // ✅ DECLARE HERE
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {}