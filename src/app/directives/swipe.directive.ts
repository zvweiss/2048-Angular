import {
  Directive,
  EventEmitter,
  Output,
  HostListener,
} from '@angular/core';

@Directive({
  selector: '[appSwipe]',
  standalone: true,
})
export class SwipeDirective {
  @Output() swipe = new EventEmitter<'left' | 'right' | 'up' | 'down'>();

  private touchStartX = 0;
  private touchStartY = 0;
  private threshold = 30; // Minimum distance in px to consider a swipe

  @HostListener('pointerdown', ['$event'])
  onPointerDown(event: PointerEvent) {
    this.touchStartX = event.clientX;
    this.touchStartY = event.clientY;
  }

  @HostListener('pointerup', ['$event'])
  onPointerUp(event: PointerEvent) {
    const dx = event.clientX - this.touchStartX;
    const dy = event.clientY - this.touchStartY;

    if (Math.abs(dx) < this.threshold && Math.abs(dy) < this.threshold) {
      return; // Ignore small movements
    }

    if (Math.abs(dx) > Math.abs(dy)) {
      this.swipe.emit(dx > 0 ? 'right' : 'left');
    } else {
      this.swipe.emit(dy > 0 ? 'down' : 'up');
    }
  }
}