import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

if (!process.stdin.isTTY) {
  console.error('请在交互终端中运行此脚本。');
  process.exit(1);
}

const hiddenOutput = new Writable({
  write(_chunk, _encoding, done) {
    done();
  },
});
const input = createInterface({
  input: process.stdin,
  output: hiddenOutput,
  terminal: true,
  historySize: 0,
});

function prompt(label) {
  process.stdout.write(label);
  return new Promise((resolve) => input.question('', (value) => {
    process.stdout.write('\n');
    resolve(value);
  }));
}

input.on('SIGINT', () => {
  input.close();
  process.stdout.write('\n已取消。\n');
  process.exit(130);
});

try {
  const password = await prompt('输入管理员密码（输入隐藏）：');
  if ([...password].length < 5 || Buffer.byteLength(password) > 512) {
    throw new Error('密码至少需要 5 个字符，且不能超过 512 字节。');
  }
  if (password !== await prompt('再次输入密码（输入隐藏）：')) {
    throw new Error('两次输入的密码不一致。');
  }

  const salt = randomBytes(16);
  const digest = pbkdf2Sync(password, salt, 100_000, 32, 'sha256');
  console.log(`pbkdf2-sha256$100000$${salt.toString('hex')}$${digest.toString('hex')}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  input.close();
}
