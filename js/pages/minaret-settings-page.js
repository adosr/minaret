export function renderMinaretSettingsPage({ state, refs, config }) {
  refs.settingsHeaderLabel.textContent = state.t("about", "About");
  refs.aboutAppNameLabel.textContent = state.t("about_app", "App");
  refs.aboutAppNameValue.textContent = config.appName;
  refs.aboutVersionLabel.textContent = state.t("about_version", "Version");
  refs.aboutVersionValue.textContent = config.appVersion;
  refs.aboutDescriptionLabel.textContent = state.t("about_description", "Description");
  refs.aboutDescriptionValue.textContent = state.t("about_description_value", "Prayer times and monthly overview.");
}
