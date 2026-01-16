import { Directive, EventEmitter, Output, HostListener } from '@angular/core';

@Directive({
  selector: '[appSwipe]',
  standalone: true,
})
export class SwipeDirective {
  @Output() swipe = new EventEmitter<'left' | 'right' | 'up' | 'down'>();

  private touchStartX = 0;
  private touchStartY = 0;

  private readonly swipeThreshold = 30;

  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent) {
    const touch = event.changedTouches[0];
    this.touchStartX = touch.screenX;
    this.touchStartY = touch.screenY;
  }

  @HostListener('touchend', ['$event'])
  onTouchEnd(event: TouchEvent) {
    const touch = event.changedTouches[0];
    const deltaX = touch.screenX - this.touchStartX;
    const deltaY = touch.screenY - this.touchStartY;

    const distance = Math.hypot(deltaX, deltaY);
    if (distance < this.swipeThreshold) return;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      this.swipe.emit(deltaX > 0 ? 'right' : 'left');
    } else {
      this.swipe.emit(deltaY > 0 ? 'down' : 'up');
    }
  }
}