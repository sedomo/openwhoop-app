use openwhoop::{ble::tauri_blec::TauriBlecTransport, db::DatabaseHandler, WhoopDeviceWith};
use openwhoop_codec::{constants::WhoopGeneration, WhoopPacket};

use crate::{
    config::{normalize_whoop_address, SAVED_WHOOP_SCAN_DURATION_SECS},
    error::AppResult,
    handlers::{
        scan_for_saved_whoop,
        whoop_manager::{
            connect_handler_to_whoop_address, disconnect_connected_whoop,
            read_persisted_whoop_store,
        },
    },
    AppState,
};

// Move this to openwhoop lib
pub fn frame_whoop_command(
    packet: WhoopPacket,
    generation: WhoopGeneration,
) -> Result<Vec<u8>, String> {
    match generation {
        WhoopGeneration::Gen4 => packet.framed_packet().map_err(|err| err.to_string()),
        WhoopGeneration::Gen5 => packet
            .framed_packet_maverick()
            .map_err(|err| err.to_string()),
        WhoopGeneration::Placeholder => {
            Err("WhoopGeneration::Placeholder cannot be used for BLE command transport".to_owned())
        }
    }
}

pub async fn ensure_connected_saved_whoop(address: &str) -> Result<(), String> {
    let handler = tauri_plugin_blec::get_handler().map_err(|err| err.to_string())?;
    let normalized_address = normalize_whoop_address(address)?;

    if handler.is_connected() {
        let connected_device = handler
            .connected_device()
            .await
            .map_err(|err| err.to_string())?;

        if connected_device
            .address
            .eq_ignore_ascii_case(&normalized_address)
        {
            return Ok(());
        }

        disconnect_connected_whoop().await;
    }

    let Some(_) = scan_for_saved_whoop(&normalized_address).await? else {
        return Err(format!(
            "Saved WHOOP not found after scanning for {} seconds.",
            SAVED_WHOOP_SCAN_DURATION_SECS
        ));
    };

    connect_handler_to_whoop_address(&normalized_address).await?;
    Ok(())
}

pub async fn send_device_command(
    _state: &AppState,
    app: &tauri::AppHandle,
    address: &str,
    generation: WhoopGeneration,
    command: WhoopPacket,
) -> AppResult<()> {
    // Creates some issues fixes some
    // stop_background_sync(state).await?;
    ensure_connected_saved_whoop(address).await?;

    let handler = tauri_plugin_blec::get_handler().map_err(|err| err.to_string())?;
    let transport = TauriBlecTransport::connected(handler);
    let database = DatabaseHandler::new("sqlite::memory:").await;
    let debug_packets = read_persisted_whoop_store(app)?.debug_packets;
    let mut whoop = WhoopDeviceWith::from_transport(transport, database, debug_packets, generation);

    whoop.connect().await?;
    Ok(whoop.send_command(command).await?)
}
