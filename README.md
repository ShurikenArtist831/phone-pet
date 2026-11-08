# 乎乎 Vide

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.0.6.

## 本地运行

在项目目录执行以下命令，初始化本地数据库并启动同时提供页面和接口的 Worker。

```bash
npm ci
npx wrangler d1 migrations apply DB --local
npm start
```

打开 Wrangler 输出的地址，在 `/control` 创建乎乎，再用邀请链接打开 `/viewer`。

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
