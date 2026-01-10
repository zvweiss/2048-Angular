import { Directive, EventEmitter, HostListener, Output } from '@angular/core';

@Directive({
  selector: '[appSwipe]',
  standalone: true,
})
export class SwipeDirective {
  @Output() swipe = new EventEmitter<'left' | 'right' | 'up' | 'down'>();

  private startX = 0;
  private startY = 0;
  private endX = 0;
  private endY = 0;

  private readonly swipeThreshold = 30;

  @HostListener('pointerdown', ['$event'])
  onPointerDown(event: PointerEvent) {
    this.startX = event.clientX;
    this.startY = event.clientY;
  }

  @HostListener('pointermove', ['$event'])
  onPointerMove(event: PointerEvent) {
    this.endX = event.clientX;
    this.endY = event.clientY;
  }

  @HostListener('pointerup', ['$event'])
  onPointerUp(event: PointerEvent) {
    const deltaX = this.endX - this.startX;
    const deltaY = this.endY - this.startY;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      if (Math.abs(deltaX) > this.swipeThreshold) {
        this.swipe.emit(deltaX > 0 ? 'right' : 'left');
      }
    } else {
      if (Math.abs(deltaY) > this.swipeThreshold) {
        this.swipe.emit(deltaY > 0 ? 'down' : 'up');
      }
    }
  }

  // Optional: Prevent default scrolling on touch
  @HostListener('touchmove', ['$event'])
  preventScroll(event: TouchEvent) {
    if (event.cancelable) event.preventDefault();
  }
}