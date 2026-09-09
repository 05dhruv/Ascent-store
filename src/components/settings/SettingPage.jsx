import SettingsResourcePage from '@/components/settings/SettingsResourcePage';
import { getSettingPageConfig } from '@/components/settings/settingsPageConfigs';

export default function SettingPage({ configKey }) {
  const config = getSettingPageConfig(configKey);
  return <SettingsResourcePage {...config} />;
}
