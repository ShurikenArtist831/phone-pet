import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PetApiService } from '../pet-api.service';
import { petCopy } from '../pet-state';
import type { PetSnapshot, PetState } from '../pet-state';
import { PenguinComponent } from '../components/penguin.component';

@Component({
  standalone:true, imports:[PenguinComponent,RouterLink], changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    <main class="page control-page">
      <header class="topbar">
        <a class="brand" routerLink="/control"><span class="brand-icon" aria-hidden="true">乎</span> 乎乎 <span class="brand-light">Vibe</span></a>
        <a class="admin-link" routerLink="/admin/login">管理员登录</a>
      </header>
      <section class="intro">
        <p class="eyebrow">你的企鹅小伙伴</p>
        <h1>嗨，今天心情<br>怎么样？</h1>
        <p class="subhead">选一个最像现在的你 ♡</p>
      </section>

      @if (pet(); as current) {
        <section class="pet-card" aria-label="企鹅状态">
          <div class="card-top">
            <span class="name">{{ current.name }} <span aria-hidden="true">🐧</span></span>
            <span class="mood" role="status"><i></i> {{ copy[current.state].label }}</span>
          </div>
          <app-penguin [state]="current.state" />
          <div class="card-note">“{{ copy[current.state].note }}”</div>
        </section>
        <section class="actions" aria-label="企鹅情绪">
          @for (mood of moods; track mood.state) {
            <button type="button" class="action-button" [class]="mood.style"
              [disabled]="busy()" [attr.aria-pressed]="current.state === mood.state"
              (click)="setState(mood.state)">
              <span aria-hidden="true">{{ mood.icon }}</span>
              <b>{{ copy[mood.state].label }}</b>
              <small>{{ mood.hint }}</small>
            </button>
          }
        </section>
        <section class="pairing" aria-label="邀请展示设备">
          <button type="button" class="primary" [disabled]="busy()" (click)="invite()">邀请对方</button>
          @if (inviteLink()) {
            <p>请在对方手机上打开链接。链接十分钟内有效，仅可使用一次。</p>
            <input #link type="text" aria-label="邀请链接" readonly [value]="inviteLink()">
            <button type="button" class="copy" (click)="copyInvite(link)">复制邀请链接</button>
            <p role="status">{{ copyStatus() }}</p>
          }
        </section>
      } @else {
        <section class="pet-card">
          <app-penguin state="happy" />
          @if (!device()) {
            <button type="button" class="primary" [disabled]="busy()" (click)="createPet()">创建乎乎</button>
          } @else if (busy()) {
            <p class="card-note" role="status">正在加载乎乎…</p>
          } @else {
            <button type="button" class="primary" (click)="loadPet()">重试</button>
          }
        </section>
      }
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <footer class="footer"><span>用一点爱陪着你</span><a routerLink="/viewer">打开展示模式 <span>↗</span></a></footer>
    </main>
  `,
  styles:[`
    :host { display:block; min-height:100dvh; background:#f5f7f2; color:#293a3c; }.page { box-sizing:border-box; width:min(100%,540px); min-height:100dvh; margin:auto; padding:24px 22px 20px; display:flex; flex-direction:column; }
    .topbar { display:flex; justify-content:space-between; align-items:center; }.brand { color:#26393b; text-decoration:none; font-size:19px; font-weight:800; letter-spacing:-.7px; }.brand-light { font-weight:400; color:#82908a; }.brand-icon { display:inline-grid; place-items:center; width:25px; height:25px; margin-right:6px; border-radius:9px; background:#f4c977; color:white; font-size:16px; }.mood i { display:inline-block; width:6px; height:6px; margin-right:5px; border-radius:50%; background:#8fbd9b; vertical-align:1px; }
    .admin-link { display:inline-flex; align-items:center; min-height:44px; padding:0 12px; border:1px solid #d8e3d9; border-radius:12px; color:#425e4e; background:#fffefa; font-size:13px; font-weight:650; text-decoration:none; }
    .intro { margin:34px 0 20px; }.eyebrow { margin:0 0 11px; color:#a5afa6; font-size:9px; letter-spacing:2px; font-weight:700; }h1 { margin:0; color:#2b3d3f; font-size:27px; letter-spacing:-1.1px; line-height:1.36; font-weight:750; }.subhead { margin:8px 0 0; color:#89968f; font-size:13px; }
    .pet-card { padding:17px 18px 14px; border:1px solid #e8ede6; border-radius:22px; background:#fffefa; box-shadow:0 9px 28px #33463808; }.card-top { display:flex; align-items:center; justify-content:space-between; }.name { font-size:13px; font-weight:750; }.name span { font-size:15px; vertical-align:-2px; }.mood { border-radius:20px; background:#f1f6ed; padding:7px 10px; color:#738776; font-size:10px; }.card-note { margin-top:-1px; text-align:center; color:#89968d; font-size:12px; }
    .actions { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-top:17px; }.action-button { min-width:0; border:1px solid #e8ede6; border-radius:17px; padding:12px 4px 11px; display:flex; flex-direction:column; align-items:center; gap:3px; background:#fffefa; color:#394a49; cursor:pointer; font:inherit; transition:transform .16s,box-shadow .16s,border-color .16s; }.action-button:hover { transform:translateY(-2px); box-shadow:0 6px 14px #354b3c10; border-color:#cfddce; }.action-button:active { transform:scale(.97); }.action-button:focus-visible { outline:3px solid #8fbd9b; outline-offset:2px; }.action-button>span { display:grid; place-items:center; width:31px; height:31px; border-radius:11px; margin-bottom:3px; font-size:17px; background:#f8eee0; color:#c58d45; }.action-button.happy>span { background:#fff3d8; color:#d3a53f; }.action-button.comfy>span { background:#f9e9e5; color:#d6897c; }.action-button.sleep>span { background:#e9eff3; color:#8198a6; }.action-button b { font-size:12px; }.action-button small { color:#9aa39c; font-size:9px; }
    .footer { display:flex; justify-content:space-between; align-items:center; margin-top:auto; padding-top:24px; color:#a0aaa2; font-size:10px; }.footer a { color:#718678; text-decoration:none; }.footer a span { font-size:14px; }@media(min-width:480px) { .page { padding:30px 30px 24px; }.intro { margin-top:40px; }h1 { font-size:30px; }.pet-card { padding-inline:25px; } }
    .pet-card { --pet-height:clamp(205px, 38svh, 285px); --pet-width:280px; }
    .action-button[aria-pressed='true'] { border-color:#8fbd9b; background:#f1f6ed; }
    button:disabled { cursor:wait; opacity:.65; }
    .pairing { display:grid; gap:8px; margin-top:16px; }
    .pairing p { margin:0; color:#596d60; font-size:13px; }
    .pairing input { width:100%; min-width:0; padding:10px; border:1px solid #d8e3d9; border-radius:10px; font:inherit; }
    .primary,.copy { width:100%; min-height:42px; border:1px solid #d8e3d9; border-radius:12px; background:#e7f1e6; color:#293a3c; cursor:pointer; font:inherit; font-weight:650; }
    .copy { background:#fffefa; }
    .error { margin:12px 0 0; color:#9a3737; font-size:14px; }
  `],
})
export class ControlPage {
  private readonly api = inject(PetApiService);
  protected readonly device = signal(this.api.getDevice('controller'));
  protected readonly pet = signal<PetSnapshot | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly inviteLink = signal('');
  protected readonly copyStatus = signal('');
  protected readonly copy = petCopy;
  protected readonly moods: ReadonlyArray<{ state: PetState; style: string; icon: string; hint: string }> = [
    { state: 'angry', style: 'angry', icon: '💢', hint: '有点烦躁' },
    { state: 'happy', style: 'happy', icon: '☀', hint: '心情不错' },
    { state: 'comfortable', style: 'comfy', icon: '♡', hint: '放松一下' },
    { state: 'sleeping', style: 'sleep', icon: '☾', hint: '晚安好梦' },
  ];

  constructor() {
    if (this.device()) void this.loadPet();
  }

  protected loadPet(): Promise<void> {
    const device = this.device();
    return this.run(async () => {
      if (device) this.pet.set(await this.api.getPet(device));
    });
  }

  protected createPet(): Promise<void> {
    return this.run(async () => {
      const { pet, device } = await this.api.createPet();
      this.device.set(device);
      this.pet.set(pet);
    });
  }

  protected setState(state: PetState): Promise<void> {
    const device = this.device();
    return this.run(async () => {
      if (device) this.pet.set(await this.api.setState(device, state));
    });
  }

  protected invite(): Promise<void> {
    const device = this.device();
    return this.run(async () => {
      if (!device) return;
      this.inviteLink.set('');
      this.copyStatus.set('');
      const { path } = await this.api.createInvite(device);
      this.inviteLink.set(new URL(path, location.origin).href);
    });
  }

  protected async copyInvite(input: HTMLInputElement): Promise<void> {
    try {
      await navigator.clipboard.writeText(input.value);
      this.copyStatus.set('邀请链接已复制');
    } catch {
      input.focus();
      input.select();
      this.copyStatus.set('请手动复制已选中的链接');
    }
  }

  private async run(operation: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await operation();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : '操作失败，请稍后再试');
    } finally {
      this.busy.set(false);
    }
  }
}
