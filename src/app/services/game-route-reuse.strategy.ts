import { Injectable } from '@angular/core';
import {
  RouteReuseStrategy,
  ActivatedRouteSnapshot,
  DetachedRouteHandle,
} from '@angular/router';

@Injectable()
export class GameRouteReuseStrategy implements RouteReuseStrategy {
  private storedHandles = new Map<string, DetachedRouteHandle>();

  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return this.isGameRoute(route);
  }

  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle): void {
    const key = this.getRouteKey(route);
    if (key !== null) {
      this.storedHandles.set(key, handle);
    }
  }

  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    const key = this.getRouteKey(route);
    return key !== null ? this.storedHandles.has(key) : false;
  }

  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    const key = this.getRouteKey(route);
    return key !== null ? this.storedHandles.get(key) ?? null : null;
  }

  shouldReuseRoute(
    future: ActivatedRouteSnapshot,
    curr: ActivatedRouteSnapshot
  ): boolean {
    return future.routeConfig === curr.routeConfig;
  }

  private isGameRoute(route: ActivatedRouteSnapshot): boolean {
    return route.routeConfig?.path === '';
  }

  private getRouteKey(route: ActivatedRouteSnapshot): string | null {
    const path = route.routeConfig?.path;
    return path === '' ? 'home' : null;
  }
}
