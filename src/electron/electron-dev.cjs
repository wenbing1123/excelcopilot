const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// 1) 启动 Vite dev server（HMR 即时预览）
const vite = spawn(`${npmCmd} run dev -- --host 127.0.0.1 --port 5173`, {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env },
  shell: true,
});

vite.on('exit', (code) => process.exit(code ?? 0));

// 2) 等待 Vite ready 后启动 Electron
const waitOn = require('wait-on');
waitOn({ resources: ['http://127.0.0.1:5173'], timeout: 60_000 })
  .then(() => {
    // electronmon：监听 main/preload 变更自动重启主进程
    const electronmonBin = process.platform === 'win32'
      ? path.join(ROOT, 'node_modules', '.bin', 'electronmon.cmd')
      : path.join(ROOT, 'node_modules', '.bin', 'electronmon');

    const child = spawn(
      electronmonBin,
      ['--watch', path.join(__dirname, '**/*.cjs'), '--', 'electron', path.join(__dirname, 'main.cjs')],
      {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, ELECTRON_RENDERER_URL: 'http://127.0.0.1:5173' },
      },
    );

    child.on('exit', (code) => {
      try {
        vite.kill();
      } catch {}
      process.exit(code ?? 0);
    });
  })
  .catch((e) => {
    console.error('wait-on failed:', e);
    try {
      vite.kill();
    } catch {}
    process.exit(1);
  });
