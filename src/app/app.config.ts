import { provideRouter, RouteReuseStrategy } from '@angular/router';
import { GamePageComponent } from './pages/game-page/game-page.component';
import { RunHistoryComponent } from './pages/run-history/run-history.component';
import { GameRouteReuseStrategy } from './services/game-route-reuse.strategy';

export const appConfig = {
  providers: [
    provideRouter([
      { path: '', component: GamePageComponent },
      { path: 'runs', component: RunHistoryComponent },
    ]),
    { provide: RouteReuseStrategy, useClass: GameRouteReuseStrategy },
  ]
};
