use tauri::AppHandle;

use crate::{
    error::AppResult,
    handlers::{log_info, whoop_manager::read_persisted_whoop_store},
    AppState,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhoopSelectionState {
    selected_whoop_address: Option<String>,
    has_selected_whoop: bool,
}

#[tauri::command]
pub fn get_whoop_selection_state(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> AppResult<WhoopSelectionState> {
    let persisted_store = read_persisted_whoop_store(&app)?;
    let selected_whoop_address = persisted_store.selected_whoop_address.clone();
    state
        .inner()
        .set_whoop_address(selected_whoop_address.clone())?;

    log_info(
        &app,
        "selection_state",
        format!(
            "Loaded WHOOP selection state selected_address={:?} has_selected_whoop={}",
            selected_whoop_address, persisted_store.has_selected_whoop
        ),
    );

    Ok(WhoopSelectionState {
        selected_whoop_address,
        has_selected_whoop: persisted_store.has_selected_whoop,
    })
}
