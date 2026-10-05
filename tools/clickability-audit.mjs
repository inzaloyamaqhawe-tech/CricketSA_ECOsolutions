import { spawn } from 'node:child_process';
import { once } from 'node:events';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const base = 'http://127.0.0.1:4178/public/';
const pages = ['index.html', 'roles.html', 'role.html?id=1', 'register.html', 'login.html'];
const viewports = [
  { name: 'desktop', width: 1366, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, tries = 30) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
    } catch {
      await wait(250);
    }
  }
  throw new Error(`Could not reach ${url}`);
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result || {});
      } else if (msg.method && this.events.has(msg.method)) {
        for (const resolve of this.events.get(msg.method)) resolve(msg.params || {});
        this.events.delete(msg.method);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  waitFor(method, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
      const wrapped = (params) => {
        clearTimeout(timer);
        resolve(params);
      };
      if (!this.events.has(method)) this.events.set(method, []);
      this.events.get(method).push(wrapped);
    });
  }
}

const chrome = spawn(chromePath, [
  '--headless=new',
  '--disable-gpu',
  '--remote-debugging-port=9224',
  `--user-data-dir=${process.env.TEMP}\\cricket-eco-cdp-audit`,
  'about:blank',
], { stdio: 'ignore' });

try {
  const targets = await fetchJson('http://127.0.0.1:9224/json/list');
  const pageTarget = targets.find((target) => target.type === 'page');
  if (!pageTarget) throw new Error('No Chrome page target available');
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await once(ws, 'open');
  const cdp = new Cdp(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const findings = [];
  for (const viewport of viewports) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.name === 'mobile',
    });

    for (const page of pages) {
      const loaded = cdp.waitFor('Page.loadEventFired');
      await cdp.send('Page.navigate', { url: base + page });
      await loaded;
      await wait(400);
      const result = await cdp.send('Runtime.evaluate', {
        returnByValue: true,
        expression: `(() => {
          const controls = [...document.querySelectorAll('a, button, input[type="button"], input[type="submit"]')];
          const findings = [];
          for (const el of controls) {
            el.scrollIntoView({ block: 'center', inline: 'center' });
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const top = document.elementFromPoint(cx, cy);
            const href = el.tagName === 'A' ? el.getAttribute('href') : '';
            const label = (el.innerText || el.value || el.getAttribute('aria-label') || href || el.id || el.tagName).trim().replace(/\\s+/g, ' ');
            const problems = [];
            const hasJsHandler = el.id || el.getAttribute('onclick') || el.closest('[data-action]');
            if (rect.width < 1 || rect.height < 1) problems.push('zero-size');
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) problems.push('hidden');
            if (el.disabled) problems.push('disabled');
            if (el.tagName === 'A' && (!href || (href === '#' && !hasJsHandler))) problems.push('bad-href');
            if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) {
              problems.push('offscreen-after-scroll');
            } else if (top && top !== el && !el.contains(top) && !top.contains(el)) {
              problems.push('covered-by-' + top.tagName.toLowerCase() + (top.id ? '#' + top.id : ''));
            }
            if (problems.length) findings.push({ label, tag: el.tagName.toLowerCase(), href, problems });
          }
          return findings;
        })()`,
      });
      for (const item of result.result.value) findings.push({ page, viewport: viewport.name, ...item });
    }
  }

  console.log(JSON.stringify({ ok: findings.length === 0, findings }, null, 2));
  ws.close();
  process.exitCode = findings.length ? 1 : 0;
} finally {
  chrome.kill();
}
