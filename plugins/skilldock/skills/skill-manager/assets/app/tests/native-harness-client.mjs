import { AppBridge, PostMessageTransport, buildAllowAttribute } from '@modelcontextprotocol/ext-apps/app-bridge';
const iframe = document.querySelector('iframe');
iframe.allow = buildAllowAttribute({ clipboardWrite: {} });
const hostTheme = new URL(location.href).searchParams.get('hostTheme') === 'dark' ? 'dark' : 'light';
// Model the host's independent document theme, which a plain iframe misses.
// These conflicting root rules reproduced the native UAT mixed-palette defect.
iframe.addEventListener('load', () => {
  const doc = iframe.contentDocument;
  doc.documentElement.classList.add(hostTheme);
  const style = doc.createElement('style');
  style.textContent = ':root.light{color-scheme:light}:root.dark{color-scheme:dark}';
  doc.head.append(style);
});
const bridge = new AppBridge(null, { name: 'SkillDock isolated browser host', version: '1' }, { serverTools: {}, openLinks: {} }, {
  hostContext: { displayMode: 'fullscreen', availableDisplayModes: ['fullscreen'], theme: hostTheme, locale: 'zh-CN', containerDimensions: { width: innerWidth, height: innerHeight - 30 } },
});
bridge.oncalltool = async params => {
  const response = await fetch('/call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
  if (!response.ok) throw new Error('Harness HTTP ' + response.status);
  return response.json();
};
bridge.onopenlink = async ({ url }) => { window.open(url, '_blank', 'noopener'); return {}; };
await bridge.connect(new PostMessageTransport(iframe.contentWindow, iframe.contentWindow));
iframe.src = '/ui';
