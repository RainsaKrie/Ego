use keyring::{Entry, Error as KeyringError};

const SERVICE_NAME: &str = "com.ego.desktop";
const ACCOUNT_NAME: &str = "default-api-key";
const DEFAULT_PROVIDER_ID: &str = "provider-default";

pub struct SecretStore;

impl SecretStore {
    pub fn new() -> Self {
        Self
    }

    pub fn has_api_key(&self, provider_id: &str) -> bool {
        match self.keyring_entry(provider_id).and_then(|entry| entry.get_password()) {
            Ok(secret) => !secret.is_empty(),
            Err(KeyringError::NoEntry) => false,
            Err(_) => false,
        }
    }

    pub fn set_api_key(&self, provider_id: &str, api_key: String) -> Result<(), KeyringError> {
        let entry = self.keyring_entry(provider_id)?;
        entry.set_password(&api_key)
    }

    pub fn get_api_key(&self, provider_id: &str) -> Result<String, KeyringError> {
        let entry = self.keyring_entry(provider_id)?;
        entry.get_password()
    }

    pub fn clear_api_key(&self, provider_id: &str) -> Result<(), KeyringError> {
        let entry = self.keyring_entry(provider_id)?;

        match entry.delete_credential() {
            Ok(_) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) => Err(error),
        }
    }

    fn keyring_entry(&self, provider_id: &str) -> Result<Entry, KeyringError> {
        let account_name = if provider_id == DEFAULT_PROVIDER_ID {
            ACCOUNT_NAME.to_string()
        } else {
            format!("provider-api-key:{}", provider_id)
        };

        Entry::new(SERVICE_NAME, &account_name)
    }
}
