import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PetState, petCopy } from '../pet-state';

@Component({
  selector: 'app-penguin',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scene">
      <img class="character" [class]="'mood-' + state()" [src]="image()" [alt]="description()" />
    </div>
  `,
  styles: [`
    :host { display:block; width:100%; }
    .scene { height:var(--pet-height, clamp(200px, 39svh, 290px)); display:grid; grid-template: minmax(0,1fr) / minmax(0,1fr); place-items:center; }
    .character { display:block; width:min(100%, var(--pet-width, 280px)); height:100%; min-height:0; object-fit:contain; filter:drop-shadow(0 15px 13px #263a3b20); transform-origin:50% 88%; }
    .mood-angry { animation:pet-grump 1.7s ease-in-out infinite; }
    .mood-happy { animation:pet-bounce 1.35s ease-in-out infinite; }
    .mood-comfortable { animation:pet-sway 4.8s ease-in-out infinite; }
    .mood-sleeping { animation:pet-sleep 4s ease-in-out infinite; }
    @keyframes pet-grump { 0%,100% { transform:translateX(0) rotate(0); } 20%,60% { transform:translateX(-3px) rotate(-1deg); } 40%,80% { transform:translateX(3px) rotate(1deg); } }
    @keyframes pet-bounce { 0%,100% { transform:translateY(0) rotate(0); } 45% { transform:translateY(-18px) rotate(-2deg); } 65% { transform:translateY(-12px) rotate(2deg); } }
    @keyframes pet-sway { 0%,100% { transform:rotate(-1deg) translateY(0); } 50% { transform:rotate(1deg) translateY(-5px); } }
    @keyframes pet-sleep { 0%,100% { transform:translateY(0) scale(1); } 50% { transform:translateY(3px) scale(.985); } }
    @media(prefers-reduced-motion:reduce) { .character { animation:none !important; } }
  `],
})
export class PenguinComponent {
  readonly state = input.required<PetState>();
  protected readonly image = computed(() => {
    const state = this.state();
    return `/images/penguin-${state === 'sleeping' ? 'sleep' : state}.png`;
  });
  protected readonly description = computed(() => `企鹅状态：${petCopy[this.state()].label}`);
}
