// The application menu, built from the same dictionary the window uses and
// rebuilt when the language changes – a menu that stayed English while the
// window turned German would be the one place the setting did not reach.
//
// Two items open something inside the window rather than doing work here
// (New lecture and Settings), so they send a command to the renderer. The
// rest call straight into the actions the app already has.

const { Menu, app } = require('electron');

function buildMenu(ctx) {
  const t = (key) => ctx.t(key);
  const isDev = !app.isPackaged;
  const hasProject = ctx.builder.getState().phase !== 'closed';

  const template = [];

  if (process.platform === 'darwin') {
    // The standard first menu: About, Services, Hide, Quit. Settings sits in
    // File rather than here, because the interface has one settings sheet and
    // one place that opens it on every platform.
    template.push({ role: 'appMenu' });
  }

  template.push({
    label: t('menu.file'),
    submenu: [
      { label: t('menu.open'), accelerator: 'CmdOrCtrl+O', click: () => ctx.actions.chooseSource() },
      { label: t('menu.new'), accelerator: 'CmdOrCtrl+N', click: () => ctx.actions.command('new') },
      { type: 'separator' },
      { label: t('menu.close'), accelerator: 'CmdOrCtrl+W', enabled: hasProject, click: () => ctx.actions.closeProject() },
      { label: t('menu.build'), accelerator: 'CmdOrCtrl+B', enabled: hasProject, click: () => ctx.actions.buildNow() },
      { type: 'separator' },
      { label: t('menu.settings'), accelerator: 'CmdOrCtrl+,', click: () => ctx.actions.command('settings') },
      ...(process.platform === 'darwin' ? [] : [{ type: 'separator' }, { role: 'quit' }]),
    ],
  });

  // Copy and paste in the name field of the new-lecture form need these; the
  // roles carry their own platform labels, so nothing here needs translating.
  template.push({ role: 'editMenu' });

  if (isDev) {
    // Development only. In a packaged app there is nothing in this menu a
    // reader would use, and a reload that throws away the running state is
    // a way to lose a build.
    template.push({
      label: t('menu.view'),
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }],
    });
  }

  template.push({ role: 'windowMenu' });

  template.push({
    role: 'help',
    label: t('menu.help'),
    submenu: [
      { label: t('menu.docs'), click: () => ctx.actions.openExternal('docs') },
      { label: t('menu.tutorial'), click: () => ctx.actions.openExternal('tutorial') },
    ],
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { buildMenu };
