// PD_BASE_URL is set when the web app is hosted in a sub-folder, for example "/private-diary" on GitHub Pages.
module.exports = ({ config }) => {
  const base = (process.env.PD_BASE_URL || '').replace(/\/+$/, '');
  return base ? { ...config, experiments: { ...(config.experiments || {}), baseUrl: base } } : config;
};
