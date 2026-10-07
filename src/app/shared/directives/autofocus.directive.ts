import { Directive, ElementRef, afterNextRender, inject, input } from '@angular/core';

/** Enfoca el elemento al renderizarse. `[appAutofocus]="false"` lo desactiva. */
@Directive({ selector: '[appAutofocus]' })
export class AutofocusDirective {
  readonly appAutofocus = input<boolean | ''>(true);

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef);
    afterNextRender(() => {
      if (this.appAutofocus() !== false) element.nativeElement.focus();
    });
  }
}
