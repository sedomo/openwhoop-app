use serde::Serialize;
use std::fmt::Display;

pub type AppResult<T, E = AppError> = std::result::Result<T, E>;

#[derive(Debug, Serialize)]
// TODO REPLACE WITH REAL ERROR TYPE
pub struct AppError {
    pub message: String,
}

impl<E> From<E> for AppError
where
    E: Display,
{
    fn from(error: E) -> Self {
        Self {
            message: error.to_string(),
        }
    }
}

impl From<AppError> for String {
    fn from(value: AppError) -> Self {
        value.message
    }
}
