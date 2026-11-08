import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { adminError, AdminApiService } from './admin-api.service';

@Component({
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './admin.css',
  template: `
    <main class="login-page">
      <section class="card login-card" aria-labelledby="login-heading">
        <p class="brand">乎乎 Vibe</p>
        <h1 id="login-heading">管理员登录</h1>
        <form class="form" (ngSubmit)="submit()">
          <label for="username">管理员账号</label>
          <input id="username" name="username" autocomplete="username" [(ngModel)]="username"
            maxlength="128" required [disabled]="busy()">
          <label for="password">密码</label>
          <div class="field-row">
            <input id="password" name="password" [type]="showPassword() ? 'text' : 'password'"
              autocomplete="current-password" [(ngModel)]="password"
              maxlength="512" required [disabled]="busy()">
            <button type="button" (click)="showPassword.update(shown => !shown)"
              [attr.aria-pressed]="showPassword()">
              {{ showPassword() ? '隐藏密码' : '显示密码' }}
            </button>
          </div>
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <button class="primary" type="submit" [disabled]="busy() || !username.trim() || !password">
            {{ busy() ? '登录中…' : '登录' }}
          </button>
        </form>
      </section>
    </main>
  `,
})
export class AdminLoginPage {
  private readonly api = inject(AdminApiService);
  private readonly router = inject(Router);
  protected username = '';
  protected password = '';
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly showPassword = signal(false);

  protected async submit(): Promise<void> {
    if (this.busy() || !this.username.trim() || !this.password) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.login(this.username.trim(), this.password);
      await this.router.navigateByUrl('/admin/pairings', { replaceUrl: true });
    } catch (error) {
      this.error.set(adminError(error, '登录暂时不可用，请稍后再试'));
    } finally {
      this.password = '';
      this.busy.set(false);
    }
  }
}
