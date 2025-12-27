import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { Angular2048Component } from './app/angular2048.component'

bootstrapApplication(Angular2048Component, appConfig)
  .catch((err) => console.error(err));
