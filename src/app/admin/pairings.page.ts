import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { adminError, AdminApiService } from './admin-api.service';
import type { AdminDevice, AdminPairings, AdminWidgetToken } from './admin-api.service';

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
        <button type="button" [disabled]="busy() || !data()" (click)="toggleWidget()">
          {{ showWidget() ? '关闭小组件' : '创建桌面小组件' }}
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

      @if (showWidget()) {
        <section class="card" aria-labelledby="widget-heading">
          <h2 id="widget-heading">创建桌面小组件</h2>
          @if (widgetPets().length) {
            <form class="form" (ngSubmit)="createWidget()">
              <label for="widget-pet">选择已配对的宠物</label>
              <select id="widget-pet" name="widgetPet" [(ngModel)]="selectedWidgetPet" [disabled]="busy()" required>
                <option value="">请选择宠物</option>
                @for (pet of widgetPets(); track pet.id) {
                  <option [value]="pet.id">{{ pet.name }} · {{ pet.id.slice(0, 8) }}</option>
                }
              </select>
              <button class="primary" type="submit" [disabled]="busy() || !selectedWidgetPet">生成小组件凭证</button>
            </form>
          } @else {
            <p class="hint">请先在这只宠物的 Viewer 手机上完成配对。</p>
          }
          @if (newWidgetToken(); as token) {
            <div class="token-result">
              <p class="hint">此 Token 只显示这一次。复制后请在 Scriptable 中配置，不要发给他人。</p>
              <label for="widget-token">Widget Token</label>
              <textarea id="widget-token" readonly rows="3" [value]="token"></textarea>
              <div class="field-row">
                <input aria-label="Widget API 地址" readonly [value]="widgetApiUrl()">
                <button type="button" (click)="copyWidgetConfig()">复制配置</button>
              </div>
            </div>
          }
          <ol class="hint widget-steps">
            <li>复制上方配置，在 Scriptable 中运行 HuHuWidget 脚本并按提示粘贴。</li>
            <li>添加 Scriptable 桌面小组件，选择 HuHuWidget 脚本。</li>
          </ol>
        </section>
      }

      @if (widgets().length) {
        <section class="widget-section" aria-labelledby="widgets-heading">
          <h2 id="widgets-heading">桌面小组件凭证</h2>
          <ul class="devices" aria-label="桌面小组件凭证">
            @for (widget of widgets(); track widget.id) {
              <li class="card device">
                <div class="device-title">
                  <h3>{{ widget.petName }} · {{ widget.viewerName || '展示设备' }}</h3>
                  <span class="badge" [class.revoked]="widget.revokedAt">{{ widget.revokedAt ? '已撤销' : '已授权' }}</span>
                </div>
                <dl><div><dt>创建时间</dt><dd>{{ widget.createdAt | date:'yyyy-MM-dd HH:mm' }}</dd></div></dl>
                @if (!widget.revokedAt) {
                  <div class="actions"><button class="danger" type="button" [disabled]="busy()" (click)="revokeWidget(widget)">撤销小组件</button></div>
                }
              </li>
            }
          </ul>
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
  protected readonly widgets = signal<AdminWidgetToken[]>([]);
  protected readonly showWidget = signal(false);
  protected readonly newWidgetToken = signal('');
  protected selectedWidgetPet = '';
  protected readonly widgetApiUrl = signal('');
  protected readonly widgetPets = computed(() => {
    const data = this.data();
    if (!data) return [];
    const activeViewers = new Set(data.devices
      .filter((device) => device.role === 'viewer' && !device.revokedAt)
      .map((device) => device.petId));
    return data.pets.filter((pet) => activeViewers.has(pet.id));
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
    const [pairings, widgets] = await Promise.all([this.api.list(), this.api.listWidgets()]);
    this.data.set(pairings);
    this.widgets.set(widgets.widgets);
  }

  protected toggleWidget(): void {
    this.showWidget.update((visible) => !visible);
    this.newWidgetToken.set('');
    this.selectedWidgetPet = '';
  }

  protected createWidget(): Promise<void> {
    return this.run(async () => {
      this.newWidgetToken.set('');
      const { widget } = await this.api.createWidget(this.selectedWidgetPet);
      this.newWidgetToken.set(widget.token);
      this.widgetApiUrl.set(`${location.origin}/api/widget/state`);
      this.notice.set('小组件凭证已生成，请立即复制并配置');
      await this.refresh();
    });
  }

  protected async copyWidgetConfig(): Promise<void> {
    try {
      await navigator.clipboard.writeText(`${this.widgetApiUrl()}\n${this.newWidgetToken()}`);
      this.notice.set('配置已复制，请粘贴到 Scriptable');
    } catch {
      this.notice.set('复制失败，请分别复制接口地址和 Token');
    }
  }

  protected revokeWidget(widget: AdminWidgetToken): void {
    if (!window.confirm('确定撤销这个桌面小组件吗？撤销后它将无法读取乎乎状态。')) return;
    void this.run(async () => {
      await this.api.revokeWidget(widget.id);
      this.newWidgetToken.set('');
      this.notice.set('小组件凭证已撤销');
      await this.refresh();
    });
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
