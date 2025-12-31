import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'flat',
  standalone: true
})
export class FlatPipe implements PipeTransform {
  transform<T>(array: T[][]): T[] {
    return array.reduce((acc, val) => acc.concat(val), []);
  }
}