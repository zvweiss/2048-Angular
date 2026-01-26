import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Observable } from 'rxjs';
import { GameService } from '../../services/game.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css'],
})
export class NavbarComponent {
  score$!: Observable<number>;
  bestScore$!: Observable<number>;

  constructor(private game: GameService) {
    this.score$ = game.score$;
    this.bestScore$ = game.bestScore$;
  }
}
