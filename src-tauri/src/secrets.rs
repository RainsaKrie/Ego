use keyring::{Entry, Error as KeyringError};

const SERVICE_NAME: &str = "com.ego.desktop";
const ACCOUNT_NAME: &str = "default-api-key";

pub struct SecretStore;

impl SecretStore {
    pub fn new() -> Self {
        Self
    }

    pub fn has_api_key(&self) -> bool {
        match Entry::new(SERVICE_NAME, ACCOUNT_NAME).and_then(|entry| entry.get_password()) {
            Ok(secret) => !secret.is_empty(),
            Err(KeyringError::NoEntry) => false,
            Err(_) => false,
        }
    }

    pub fn set_api_key(&self, api_key: String) -> Result<(), KeyringError> {
        let entry = Entry::new(SERVICE_NAME, ACCOUNT_NAME)?;
        entry.set_password(&api_key)
    }

    pub fn get_api_key(&self) -> Result<String, KeyringError> {
        let entry = Entry::new(SERVICE_NAME, ACCOUNT_NAME)?;
        entry.get_password()
    }

    pub fn clear_api_key(&self) -> Result<(), KeyringError> {
        let entry = Entry::new(SERVICE_NAME, ACCOUNT_NAME)?;

        match entry.delete_credential() {
            Ok(_) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) => Err(error),
        }
    }
}
