# 乎乎 Vibe

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.0.6.

## 本地运行

在项目目录运行以下命令。启动脚本会自动应用本地 D1 迁移，再用同一个 Worker 提供页面和 API。

```bash
npm ci
npm start
```

打开 [本地控制页](http://localhost:8787/control)，创建乎乎并用邀请链接配对。右上角「管理员登录」通往 `/admin/login`。

本地管理员账号配置在项目根目录的 `.dev.vars`。用 `node scripts/admin-password-hash.mjs` 生成哈希，然后在文件中分别设置 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD_HASH`，保存后重启 `npm start`。该文件已被 Git 忽略。

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
