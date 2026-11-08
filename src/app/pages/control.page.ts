import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MockPetService, PetAction } from '../pet-state';
import { PenguinComponent } from '../components/penguin.component';

@Component({
  standalone:true, imports:[PenguinComponent,RouterLink], changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    <main class="page control-page">
      <header class="topbar"><a class="brand" routerLink="/control"><span class="brand-icon">h</span> HuHu <span class="brand-light">vibe</span></a><span class="demo-tag"><i></i> DEMO</span></header>
      <section class="intro"><p class="eyebrow">YOUR LITTLE FRIEND</p><h1>嗨，今天心情<br class="mobile-break">怎么样？</h1><p class="subhead">选一个最像现在的你 ♡</p></section>
      <section class="pet-card" aria-label="企鹅状态"><div class="card-top"><span class="name">Pip <span>🐧</span></span><span class="mood"><i></i> {{ pet.copy().label }}</span></div><app-penguin [action]="pet.action()" /><div class="card-note">“{{ pet.copy().note }}”</div></section>
      <section class="actions" aria-label="企鹅情绪">
        <button class="action-button angry" (click)="setAction('Angry')"><span>💢</span><b>生气</b><small>有点烦躁</small></button><button class="action-button happy" (click)="setAction('Happy')"><span>☀</span><b>开心</b><small>心情不错</small></button><button class="action-button comfy" (click)="setAction('Comfortable')"><span>♡</span><b>舒服</b><small>放松一下</small></button><button class="action-button sleep" (click)="setAction('Sleep')"><span>☾</span><b>睡觉</b><small>晚安好梦</small></button>
      </section>
      <footer class="footer"><span>Made with a little love</span><a routerLink="/viewer">打开展示模式 <span>↗</span></a></footer>
    </main>
  `,
  styles:[`
    :host { display:block; min-height:100dvh; background:#f5f7f2; color:#293a3c; }.page { box-sizing:border-box; width:min(100%,540px); min-height:100dvh; margin:auto; padding:24px 22px 20px; display:flex; flex-direction:column; }
    .topbar { display:flex; justify-content:space-between; align-items:center; }.brand { color:#26393b; text-decoration:none; font-size:19px; font-weight:800; letter-spacing:-.7px; }.brand-light { font-weight:400; color:#82908a; }.brand-icon { display:inline-grid; place-items:center; width:25px; height:25px; margin-right:6px; border-radius:9px; background:#f4c977; color:white; font-size:16px; }.demo-tag { color:#8b9890; font-size:9px; letter-spacing:1.4px; font-weight:700; }.demo-tag i,.mood i { display:inline-block; width:6px; height:6px; margin-right:5px; border-radius:50%; background:#8fbd9b; vertical-align:1px; }
    .intro { margin:34px 0 20px; }.eyebrow { margin:0 0 11px; color:#a5afa6; font-size:9px; letter-spacing:2px; font-weight:700; }h1 { margin:0; color:#2b3d3f; font-size:27px; letter-spacing:-1.1px; line-height:1.36; font-weight:750; }.subhead { margin:8px 0 0; color:#89968f; font-size:13px; }
    .pet-card { padding:17px 18px 14px; border:1px solid #e8ede6; border-radius:22px; background:#fffefa; box-shadow:0 9px 28px #33463808; }.card-top { display:flex; align-items:center; justify-content:space-between; }.name { font-size:13px; font-weight:750; }.name span { font-size:15px; vertical-align:-2px; }.mood { border-radius:20px; background:#f1f6ed; padding:7px 10px; color:#738776; font-size:10px; }.card-note { margin-top:-1px; text-align:center; color:#89968d; font-size:12px; }
    .actions { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-top:17px; }.action-button { min-width:0; border:1px solid #e8ede6; border-radius:17px; padding:12px 4px 11px; display:flex; flex-direction:column; align-items:center; gap:3px; background:#fffefa; color:#394a49; cursor:pointer; font:inherit; transition:transform .16s,box-shadow .16s,border-color .16s; }.action-button:hover { transform:translateY(-2px); box-shadow:0 6px 14px #354b3c10; border-color:#cfddce; }.action-button:active { transform:scale(.97); }.action-button:focus-visible { outline:3px solid #8fbd9b; outline-offset:2px; }.action-button>span { display:grid; place-items:center; width:31px; height:31px; border-radius:11px; margin-bottom:3px; font-size:17px; background:#f8eee0; color:#c58d45; }.action-button.happy>span { background:#fff3d8; color:#d3a53f; }.action-button.comfy>span { background:#f9e9e5; color:#d6897c; }.action-button.sleep>span { background:#e9eff3; color:#8198a6; }.action-button b { font-size:12px; }.action-button small { color:#9aa39c; font-size:9px; }
    .footer { display:flex; justify-content:space-between; align-items:center; margin-top:auto; padding-top:24px; color:#a0aaa2; font-size:10px; }.footer a { color:#718678; text-decoration:none; }.footer a span { font-size:14px; }@media(min-width:480px) { .page { padding:30px 30px 24px; }.intro { margin-top:40px; }h1 { font-size:30px; }.pet-card { padding-inline:25px; } }
  `],
})
export class ControlPage { readonly pet=inject(MockPetService); setAction(action:PetAction):void { this.pet.setAction(action); } }
