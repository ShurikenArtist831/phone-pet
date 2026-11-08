import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PetApiService } from '../pet-api.service';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="join">
      <section>
        <h1>配对乎乎</h1>
        @if (error()) {
          <p role="alert">{{ error() }}</p>
        } @else {
          <p role="status">正在连接展示设备…</p>
        }
      </section>
    </main>
  `,
  styles: [`
    .join { min-height:100dvh; display:grid; place-items:center; padding:24px; background:#dff0f5; color:#293a3c; text-align:center; }
    section { width:min(100%,380px); padding:24px; border-radius:22px; background:#fffefa; }
    h1 { margin:0; font-size:24px; }
    p { margin:12px 0 0; }
  `],
})
export class JoinPage {
  private readonly api = inject(PetApiService);
  private readonly router = inject(Router);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';
  protected readonly error = signal('');

  constructor() {
    void this.claim();
  }

  private async claim(): Promise<void> {
    try {
      await this.api.claimInvite(this.token);
      await this.router.navigateByUrl('/viewer', { replaceUrl: true });
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : '配对失败，请稍后再试');
    }
  }
}
