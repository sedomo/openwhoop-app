import { createDeviceManagementScreenState } from "./deviceManagement";
import { createHealthMonitorScreenState } from "./healthMonitor";
import { createHomePageState } from "./homePage";
import { createPagePermissionsState } from "./pagePermissions";
import { createScanForDevicesState } from "./scanForDevices";
import { createSelectedWhoopScreenState } from "./selectedWhoopScreen";
import { createStressMonitorScreenState } from "./stressMonitor";
import { selectedWhoopStore } from "./selectedWhoop";

function createAppStore() {
  return {
    selectedWhoop: selectedWhoopStore,
    permissions: createPagePermissionsState(),
    home: createHomePageState(),
    pages: {
      scan: createScanForDevicesState(),
      deviceManagement: createDeviceManagementScreenState(),
      selectedWhoop: createSelectedWhoopScreenState(),
      healthMonitor: createHealthMonitorScreenState(),
      stressMonitor: createStressMonitorScreenState(),
    },
  };
}

export const appStore = createAppStore();
