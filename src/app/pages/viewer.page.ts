import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { PetApiError, PetApiService } from '../pet-api.service';
import { petCopy } from '../pet-state';
import type { PetSnapshot } from '../pet-state';
import { PenguinComponent } from '../components/penguin.component';

@Component({
  standalone:true,
  imports:[PenguinComponent],
  changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    <main class="desktop-pet">
      <div class="ambient ambient-one"></div><div class="ambient ambient-two"></div>
      @if (pet(); as current) {
        <div class="pet-bubble" aria-live="polite">{{ current.name }} · {{ copy[current.state].label }}</div>
        <section class="pet-stage" aria-label="桌面宠物企鹅">
          <app-penguin [state]="current.state" />
          <div class="ground-shadow" aria-hidden="true"></div>
        </section>
      }
      @if (error()) {
        <p class="message" role="alert">{{ error() }}</p>
      } @else if (!device) {
        <p class="message">请在这台手机上打开邀请链接，与乎乎配对。</p>
      } @else if (!pet()) {
        <p class="message" role="status">正在加载乎乎…</p>
      }
    </main>
  `,
  styles:[`
    :host { display:block; min-height:100dvh; background:#dff0f5; color:#293a3c; overflow:hidden; }
    .desktop-pet { position:relative; box-sizing:border-box; width:min(100%,1100px); min-height:100dvh; margin:auto; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:36px 20px 8vh; isolation:isolate; }
    .desktop-pet::before { content:""; position:absolute; z-index:-2; inset:auto -10% -16vh; height:42vh; border-radius:50% 50% 0 0; background:#eff5e9; }
    .ambient { position:absolute; z-index:-1; border-radius:50%; background:#fff8; filter:blur(1px); }
    .ambient-one { width:150px; height:150px; top:15%; left:15%; }.ambient-two { width:90px; height:90px; top:27%; right:17%; }
    .pet-bubble { position:relative; z-index:2; margin-bottom:10px; padding:10px 18px; border:1px solid #ffffffc9; border-radius:20px; background:#fffefa; box-shadow:0 8px 24px #47645b12; color:#597064; font-size:clamp(14px,2vw,18px); font-weight:650; animation:bubble-hover 3s ease-in-out infinite; }
    .pet-bubble::after { content:""; position:absolute; left:50%; bottom:-7px; width:13px; height:13px; border-right:1px solid #ffffffc9; border-bottom:1px solid #ffffffc9; background:#fffefa; transform:translateX(-50%) rotate(45deg); }
    .pet-stage { position:relative; width:min(100%,440px); --pet-height:clamp(180px,50svh,380px); --pet-width:360px; }
    .message { max-width:28rem; margin:14px 0 0; padding:12px 16px; border-radius:16px; background:#fffefa; color:#495c56; text-align:center; }
    .ground-shadow { position:absolute; left:50%; bottom:4%; z-index:-1; width:44%; height:24px; border-radius:50%; background:#526f6040; filter:blur(12px); animation:shadow-breathe 3.6s ease-in-out infinite; }
    @keyframes bubble-hover { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-5px); } }
    @keyframes shadow-breathe { 0%,100% { transform:translateX(-50%) scaleX(1); opacity:.85; } 50% { transform:translateX(-50%) scaleX(.8); opacity:.55; } }
    @media(max-width:520px) { .desktop-pet { padding:24px 10px 8vh; }.desktop-pet::before { height:32vh; }.ambient-one { left:-15%; top:17%; }.ambient-two { right:-8%; top:34%; }.pet-stage { --pet-height:clamp(180px,45svh,320px); --pet-width:min(85vw,310px); } }
    @media(prefers-reduced-motion:reduce) { .pet-bubble,.ground-shadow { animation:none; } }
  `],
})
export class ViewerPage {
  private readonly api = inject(PetApiService);
  private readonly document = inject(DOCUMENT);
  private timer?: ReturnType<typeof setInterval>;
  private request?: AbortController;
  private accessRevoked = false;
  protected readonly device = this.api.getDevice('viewer');
  protected readonly pet = signal<PetSnapshot | null>(null);
  protected readonly error = signal('');
  protected readonly copy = petCopy;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopPolling());
    this.visibilityChanged();
  }

  @HostListener('document:visibilitychange')
  protected visibilityChanged(): void {
    this.stopPolling();
    if (this.document.hidden || !this.device || this.accessRevoked) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), 3000);
  }

  private stopPolling(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.request?.abort();
    this.request = undefined;
  }

  private async refresh(): Promise<void> {
    if (!this.device || this.request || this.document.hidden) return;
    const request = new AbortController();
    this.request = request;
    try {
      const next = await this.api.getPet(this.device, request.signal);
      if (request.signal.aborted) return;
      if (next.version !== this.pet()?.version) this.pet.set(next);
      this.error.set('');
    } catch (error) {
      if (request.signal.aborted) return;
      if (error instanceof PetApiError && (error.status === 401 || error.status === 403)) {
        this.accessRevoked = true;
        this.stopPolling();
        this.pet.set(null);
        this.error.set('展示设备的授权已失效，请打开新的邀请链接。');
      } else {
        this.error.set(error instanceof Error ? error.message : '更新失败，稍后会重试');
      }
    } finally {
      if (this.request === request) this.request = undefined;
    }
  }
}
