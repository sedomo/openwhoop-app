use std::sync::Mutex;

use openwhoop::db::DatabaseHandler;

use crate::{
    error::AppResult,
    handlers::{
        database::ImportSyncController, sync::BackgroundSyncController, HeartRateStreamController,
        StressStreamController,
    },
};

pub struct AppState {
    selected_whoop_address: Mutex<Option<String>>,
    background_sync: Mutex<BackgroundSyncController>,
    import_sync: Mutex<ImportSyncController>,
    heart_rate_stream: Mutex<HeartRateStreamController>,
    stress_stream: Mutex<StressStreamController>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            selected_whoop_address: Mutex::new(None),
            background_sync: Mutex::new(BackgroundSyncController::default()),
            import_sync: Mutex::new(ImportSyncController::default()),
            heart_rate_stream: Mutex::new(HeartRateStreamController::default()),
            stress_stream: Mutex::new(StressStreamController::default()),
        }
    }
}

impl AppState {
    pub fn get_whoop_address(&self) -> AppResult<Option<String>> {
        Ok(self.selected_whoop_address.lock()?.clone())
    }

    pub fn set_whoop_address(&self, address: Option<String>) -> AppResult<()> {
        let mut lock = self.selected_whoop_address.lock()?;
        *lock = address;
        Ok(())
    }

    pub fn get_heart_rate_stream<FN, O>(&self, map_fn: FN) -> AppResult<O>
    where
        FN: Fn(&HeartRateStreamController) -> O,
    {
        let lock = self.heart_rate_stream.lock()?;
        Ok(map_fn(&*lock))
    }

    pub fn update_heart_rate_stream<FN>(&self, map_fn: FN) -> AppResult<()>
    where
        FN: FnOnce(&mut HeartRateStreamController),
    {
        let mut lock = self.heart_rate_stream.lock()?;
        map_fn(&mut lock);
        Ok(())
    }

    pub fn get_stress_stream<FN, O>(&self, map_fn: FN) -> AppResult<O>
    where
        FN: Fn(&StressStreamController) -> O,
    {
        let lock = self.stress_stream.lock()?;
        Ok(map_fn(&*lock))
    }

    pub fn update_stress_stream<FN>(&self, map_fn: FN) -> AppResult<()>
    where
        FN: FnOnce(&mut StressStreamController),
    {
        let mut lock = self.stress_stream.lock()?;
        map_fn(&mut lock);
        Ok(())
    }

    pub fn get_background_sync_controller<FN, O>(&self, map_fn: FN) -> AppResult<O>
    where
        FN: Fn(&BackgroundSyncController) -> O,
    {
        let lock = self.background_sync.lock()?;
        Ok(map_fn(&*lock))
    }

    pub fn update_background_sync_controller<FN, O>(&self, map_fn: FN) -> AppResult<O>
    where
        FN: FnOnce(&mut BackgroundSyncController) -> O,
    {
        let mut lock = self.background_sync.lock()?;
        Ok(map_fn(&mut lock))
    }

    pub fn get_import_sync_controller<FN, O>(&self, map_fn: FN) -> AppResult<O>
    where
        FN: Fn(&ImportSyncController) -> O,
    {
        let lock = self.import_sync.lock()?;
        Ok(map_fn(&*lock))
    }

    pub fn update_import_sync_controller<FN, O>(&self, map_fn: FN) -> AppResult<O>
    where
        FN: FnOnce(&mut ImportSyncController) -> O,
    {
        let mut lock = self.import_sync.lock()?;
        Ok(map_fn(&mut lock))
    }

    pub fn has_active_realtime_stream(&self) -> AppResult<bool> {
        let heart_rate_running = self.heart_rate_stream.lock()?.is_running();
        let stress_running = self.stress_stream.lock()?.is_running();
        Ok(heart_rate_running || stress_running)
    }
}

pub struct DatabaseState {
    database: DatabaseHandler,
}

impl DatabaseState {
    pub fn new(database: DatabaseHandler) -> Self {
        Self { database }
    }

    pub fn database(&self) -> DatabaseHandler {
        self.database.clone()
    }
}
