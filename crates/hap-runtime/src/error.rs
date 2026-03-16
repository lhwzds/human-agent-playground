use anyhow::Error;
use serde_json::{Map, Value};
use std::fmt::{Display, Formatter};

#[derive(Debug, Clone)]
pub struct RuntimeError {
    status_code: u16,
    message: String,
    code: Option<String>,
    details: Map<String, Value>,
}

impl RuntimeError {
    pub fn new(status_code: u16, message: impl Into<String>) -> Self {
        Self {
            status_code,
            message: message.into(),
            code: None,
            details: Map::new(),
        }
    }

    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::new(400, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(404, message)
    }

    pub fn internal(error: impl Display) -> Self {
        Self::new(500, error.to_string())
    }

    pub fn with_code(mut self, code: impl Into<String>) -> Self {
        self.code = Some(code.into());
        self
    }

    pub fn with_detail(mut self, key: impl Into<String>, value: impl Into<Value>) -> Self {
        self.details.insert(key.into(), value.into());
        self
    }

    pub fn status_code(&self) -> u16 {
        self.status_code
    }

    pub fn code(&self) -> Option<&str> {
        self.code.as_deref()
    }

    pub fn message(&self) -> &str {
        &self.message
    }

    pub fn details(&self) -> &Map<String, Value> {
        &self.details
    }
}

impl Display for RuntimeError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for RuntimeError {}

impl From<Error> for RuntimeError {
    fn from(value: Error) -> Self {
        Self::internal(value)
    }
}
