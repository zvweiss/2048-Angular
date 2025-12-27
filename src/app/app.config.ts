import { provideRouter } from '@angular/router';
import { GamePageComponent } from './pages/game-page/game-page.component';

export const appConfig = {
  providers: [
    provideRouter([
      { path: '', component: GamePageComponent },
    ])
  ]
};
