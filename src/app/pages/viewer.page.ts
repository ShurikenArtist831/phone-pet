import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MockPetService } from '../pet-state';
import { PenguinComponent } from '../components/penguin.component';

@Component({
  standalone:true,
  imports:[PenguinComponent],
  changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    <main class="desktop-pet">
      <div class="ambient ambient-one"></div><div class="ambient ambient-two"></div>
      <div class="pet-bubble">{{ pet.copy().label }}</div>
      <section class="pet-stage" aria-label="桌面宠物企鹅">
        <app-penguin [action]="pet.action()" />
        <div class="ground-shadow"></div>
      </section>
    </main>
  `,
  styles:[`
    :host { display:block; min-height:100dvh; background:#dff0f5; color:#293a3c; overflow:hidden; }
    .desktop-pet { position:relative; box-sizing:border-box; width:min(100%,1100px); min-height:100dvh; margin:auto; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:36px 20px 8vh; isolation:isolate; }
    .desktop-pet::before { content:""; position:absolute; z-index:-2; inset:auto -10% -16vh; height:42vh; border-radius:50% 50% 0 0; background:#eff5e9; }
    .ambient { position:absolute; z-index:-1; border-radius:50%; background:#fff8; filter:blur(1px); }
    .ambient-one { width:150px; height:150px; top:15%; left:15%; }.ambient-two { width:90px; height:90px; top:27%; right:17%; }
    .pet-bubble { position:relative; z-index:2; margin-bottom:4px; padding:13px 23px; border:1px solid #ffffffc9; border-radius:24px; background:#fffefa; box-shadow:0 8px 24px #47645b12; color:#718678; font-size:clamp(14px,2vw,18px); font-weight:650; animation:bubble-hover 3s ease-in-out infinite; }
    .pet-bubble::after { content:""; position:absolute; left:50%; bottom:-7px; width:13px; height:13px; border-right:1px solid #ffffffc9; border-bottom:1px solid #ffffffc9; background:#fffefa; transform:translateX(-50%) rotate(45deg); }
    .pet-stage { position:relative; width:min(100%,580px); }
    .pet-stage ::ng-deep .scene { height:clamp(350px,62vh,530px); }
    .pet-stage ::ng-deep .character { width:min(90vw,480px); }
    .ground-shadow { position:absolute; left:50%; bottom:4%; z-index:-1; width:44%; height:24px; border-radius:50%; background:#526f6040; filter:blur(12px); animation:shadow-breathe 3.6s ease-in-out infinite; }
    @keyframes bubble-hover { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-5px); } }
    @keyframes shadow-breathe { 0%,100% { transform:translateX(-50%) scaleX(1); opacity:.85; } 50% { transform:translateX(-50%) scaleX(.8); opacity:.55; } }
    @media(max-width:520px) { .desktop-pet { padding:24px 10px 8vh; }.desktop-pet::before { height:32vh; }.ambient-one { left:-15%; top:17%; }.ambient-two { right:-8%; top:34%; }.pet-stage ::ng-deep .scene { height:clamp(320px,54vh,420px); }.pet-stage ::ng-deep .character { width:min(96vw,400px); } }
    @media(max-height:620px) and (min-width:521px) { .desktop-pet { padding-top:12px; padding-bottom:10px; }.pet-stage ::ng-deep .scene { height:70vh; min-height:300px; }.pet-bubble { padding:9px 18px; } }
    @media(prefers-reduced-motion:reduce) { .pet-bubble,.ground-shadow { animation:none; } }
  `],
})
export class ViewerPage { readonly pet=inject(MockPetService); }
