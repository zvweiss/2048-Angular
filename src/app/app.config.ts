import { provideRouter } from '@angular/router';
import { GamePageComponent } from './pages/game-page/game-page.component';
import { RunHistoryComponent } from './pages/run-history/run-history.component';

export const appConfig = {
  providers: [
    provideRouter([
      { path: '', component: GamePageComponent },
      { path: 'runs', component: RunHistoryComponent },
    ])
  ]
};
