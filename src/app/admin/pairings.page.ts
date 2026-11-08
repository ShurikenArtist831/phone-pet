import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { adminError, AdminApiService } from './admin-api.service';
import type { AdminDevice, AdminPairings } from './admin-api.service';

@Component({
  standalone: true,
  imports: [DatePipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './admin.css',
  template: `
    <main class="pairings-page">
      <header class="page-header">
        <div><p class="brand">乎乎 Vibe</p><h1>配对管理</h1></div>
        <button type="button" [disabled]="busy()" (click)="logout()">退出登录</button>
      </header>

      <div class="toolbar">
        <div class="filters" aria-label="授权状态筛选">
          <button type="button" [attr.aria-pressed]="!showRevoked()" (click)="showRevoked.set(false)">已授权</button>
          <button type="button" [attr.aria-pressed]="showRevoked()" (click)="showRevoked.set(true)">已撤销</button>
        </div>
        <button class="primary" type="button" [disabled]="busy() || !data()" (click)="toggleInvite()">
          {{ showInvite() ? '关闭邀请' : '新增配对' }}
        </button>
      </div>

      @if (showInvite()) {
        <section class="card" aria-labelledby="invite-heading">
          <h2 id="invite-heading">新增展示设备</h2>
          @if (availablePets().length) {
            <form class="form" (ngSubmit)="invite()">
              <label for="invite-pet">选择宠物</label>
              <select id="invite-pet" name="pet" [(ngModel)]="selectedPet" [disabled]="busy()" required>
                <option value="">请选择宠物</option>
                @for (pet of availablePets(); track pet.id) {
                  <option [value]="pet.id">{{ pet.name }} · {{ pet.createdAt | date:'yyyy-MM-dd HH:mm' }} · {{ pet.id.slice(0, 8) }}</option>
                }
              </select>
              <button type="submit" class="primary" [disabled]="busy() || !selectedPet">生成邀请链接</button>
            </form>
          } @else {
            <p class="hint">{{ data()?.pets?.length ? '所有宠物都已绑定展示设备，请先解绑。' : '目前没有宠物，请先在控制端创建乎乎。' }}</p>
          }
          @if (inviteLink(); as link) {
            <p class="hint">链接仅可使用一次，10 分钟内有效。</p>
            <div class="field-row">
              <input #url aria-label="邀请链接" readonly [value]="link">
              <button type="button" (click)="copyLink(url)">复制链接</button>
            </div>
          }
        </section>
      }

      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      @if (notice()) {
        <p class="notice" role="status">{{ notice() }}</p>
      }

      @if (!data()) {
        <section class="card empty">
          @if (busy()) {
            <p role="status">正在加载设备…</p>
          } @else {
            <button type="button" (click)="load()">重新加载</button>
          }
        </section>
      } @else if (!devices().length) {
        <p class="card empty">{{ showRevoked() ? '暂无已撤销的设备。' : '暂无已授权的设备。' }}</p>
      } @else {
        <ul class="devices" aria-label="配对设备">
          @for (device of devices(); track device.id) {
            <li class="card device">
              <div class="device-title">
                <h2>{{ device.displayName || (device.role === 'viewer' ? '未备注的展示设备' : '控制设备') }}</h2>
                <span class="badge" [class.revoked]="device.revokedAt">{{ device.revokedAt ? '已撤销' : '已授权' }}</span>
              </div>
              <dl>
                <div><dt>宠物</dt><dd>{{ device.petName }} · {{ device.petId.slice(0, 8) }}</dd></div>
                <div><dt>角色</dt><dd>{{ device.role === 'viewer' ? '展示端' : '控制端' }}</dd></div>
                <div><dt>创建时间</dt><dd>{{ device.createdAt | date:'yyyy-MM-dd HH:mm' }}</dd></div>
              </dl>
              @if (device.role === 'viewer') {
                @if (editingId() === device.id) {
                  <form class="form" (ngSubmit)="save(device)">
                    <label for="device-note">设备备注</label>
                    <input id="device-note" name="note" [(ngModel)]="draftNote" [disabled]="busy()"
                      maxlength="120" placeholder="例如，我的手机">
                    <p class="hint">最多 60 个字符。留空可清除备注。</p>
                    <div class="actions">
                      <button class="primary" type="submit" [disabled]="busy()">保存</button>
                      <button type="button" [disabled]="busy()" (click)="editingId.set(null)">取消</button>
                    </div>
                  </form>
                } @else {
                  <div class="actions">
                    <button type="button" [disabled]="busy()" (click)="edit(device)">编辑备注</button>
                    @if (!device.revokedAt) {
                      <button class="danger" type="button" [disabled]="busy()" (click)="confirmRevoke(device, confirmation)">解绑</button>
                    }
                  </div>
                }
              }
            </li>
          }
        </ul>
      }

      <dialog #confirmation aria-labelledby="confirm-title" aria-describedby="confirm-message"
        (close)="revokeTarget.set(null)">
        <h2 id="confirm-title">确认解绑</h2>
        <p id="confirm-message">确定要解绑这台设备吗？解绑后该设备将无法继续查看乎乎。</p>
        <div class="actions">
          <button type="button" autofocus (click)="confirmation.close()">取消</button>
          <button class="danger" type="button" [disabled]="busy()" (click)="revoke(confirmation)">确认解绑</button>
        </div>
      </dialog>
    </main>
  `,
})
export class AdminPairingsPage {
  private readonly api = inject(AdminApiService);
  private readonly router = inject(Router);
  protected readonly data = signal<AdminPairings | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly showRevoked = signal(false);
  protected readonly showInvite = signal(false);
  protected readonly inviteLink = signal('');
  protected readonly editingId = signal<string | null>(null);
  protected readonly revokeTarget = signal<AdminDevice | null>(null);
  protected selectedPet = '';
  protected draftNote = '';

  protected readonly devices = computed(() => {
    const revoked = this.showRevoked();
    return this.data()?.devices.filter((device) => Boolean(device.revokedAt) === revoked) ?? [];
  });

  protected readonly availablePets = computed(() => {
    const data = this.data();
    if (!data) return [];
    const occupied = new Set(data.devices
      .filter((device) => device.role === 'viewer' && !device.revokedAt)
      .map((device) => device.petId));
    return data.pets.filter((pet) => !occupied.has(pet.id));
  });

  constructor() {
    void this.load();
  }

  protected load(): Promise<void> {
    return this.run(() => this.refresh());
  }

  private async refresh(): Promise<void> {
    this.data.set(await this.api.list());
  }

  protected toggleInvite(): void {
    this.showInvite.update((visible) => !visible);
    this.inviteLink.set('');
    this.selectedPet = '';
  }

  protected invite(): Promise<void> {
    return this.run(async () => {
      this.inviteLink.set('');
      const { path } = await this.api.invite(this.selectedPet);
      this.inviteLink.set(new URL(path, location.origin).href);
    });
  }

  protected async copyLink(input: HTMLInputElement): Promise<void> {
    try {
      await navigator.clipboard.writeText(input.value);
      this.notice.set('邀请链接已复制');
    } catch {
      input.focus();
      input.select();
      this.notice.set('请手动复制已选中的链接');
    }
  }

  protected edit(device: AdminDevice): void {
    this.draftNote = device.displayName ?? '';
    this.editingId.set(device.id);
  }

  protected save(device: AdminDevice): Promise<void> {
    return this.run(async () => {
      await this.api.edit(device.id, this.draftNote);
      this.editingId.set(null);
      this.notice.set('备注已保存');
      await this.refresh();
    });
  }

  protected confirmRevoke(device: AdminDevice, dialog: HTMLDialogElement): void {
    this.revokeTarget.set(device);
    dialog.showModal();
  }

  protected revoke(dialog: HTMLDialogElement): Promise<void> {
    const device = this.revokeTarget();
    dialog.close();
    return this.run(async () => {
      if (!device) return;
      await this.api.revoke(device.id);
      this.inviteLink.set('');
      this.notice.set('解绑成功');
      await this.refresh();
    });
  }

  protected logout(): Promise<void> {
    return this.run(async () => {
      await this.api.logout();
      await this.router.navigateByUrl('/admin/login', { replaceUrl: true });
    });
  }

  private async run(operation: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await operation();
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        await this.router.navigateByUrl('/admin/login', { replaceUrl: true });
      } else {
        this.error.set(adminError(error, '操作失败，请稍后再试'));
      }
    } finally {
      this.busy.set(false);
    }
  }
}
