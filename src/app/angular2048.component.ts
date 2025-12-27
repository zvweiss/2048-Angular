import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'angular2048-root',
  imports: [RouterOutlet],
  templateUrl: './angular2048.component.html',
  styleUrl: './angular2048.component.css'
})
export class Angular2048Component {
  protected readonly title = signal('angular2048');
}
