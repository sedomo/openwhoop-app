#[tauri::command]
pub fn tauri_blec_check_permissions(ask: bool) -> Result<bool, tauri_plugin_blec::Error> {
    tauri_plugin_blec::check_permissions(ask)
}
