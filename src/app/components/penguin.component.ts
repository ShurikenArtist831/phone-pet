import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PetAction } from '../pet-state';

@Component({
  selector: 'app-penguin',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="scene"><img class="character" [class]="'character mood-' + action().toLowerCase()" [src]="image()" [alt]="'企鹅状态：' + action()" /></div>`,
  styles: [`
    :host { display:block; width:100%; }
    .scene { height:330px; display:grid; place-items:center; overflow:visible; }
    .character { display:block; width:min(100%, 340px); height:100%; object-fit:contain; filter:drop-shadow(0 15px 13px #263a3b20); animation:pet-float 3.6s ease-in-out infinite; transform-origin:50% 88%; will-change:transform; }
    .mood-angry { animation:pet-grump 1.7s ease-in-out infinite; }
    .mood-happy { animation:pet-bounce 1.35s ease-in-out infinite; }
    .mood-comfortable { animation:pet-sway 4.8s ease-in-out infinite; }
    .mood-sleep { animation:pet-sleep 4s ease-in-out infinite; }
    @keyframes pet-float { 0%,100% { transform:translateY(0) rotate(0); } 50% { transform:translateY(-10px) rotate(-1deg); } }
    @keyframes pet-grump { 0%,100% { transform:translateX(0) rotate(0); } 20%,60% { transform:translateX(-3px) rotate(-1deg); } 40%,80% { transform:translateX(3px) rotate(1deg); } }
    @keyframes pet-bounce { 0%,100% { transform:translateY(0) rotate(0); } 45% { transform:translateY(-18px) rotate(-2deg); } 65% { transform:translateY(-12px) rotate(2deg); } }
    @keyframes pet-sway { 0%,100% { transform:rotate(-1deg) translateY(0); } 50% { transform:rotate(1deg) translateY(-5px); } }
    @keyframes pet-sleep { 0%,100% { transform:translateY(0) scale(1); } 50% { transform:translateY(3px) scale(.985); } }
    @media(prefers-reduced-motion:reduce) { .character { animation:none !important; } }
  `],
})
export class PenguinComponent {
  readonly action = input<PetAction>('Happy');
  readonly image = computed(() => `/images/penguin-${this.action().toLowerCase()}.png`);
}
