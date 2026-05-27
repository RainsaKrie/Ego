mod db;
mod models;
mod secrets;

use models::{
    BootstrapWorkspacePayload, ConversationDto, ConversationSettingsDto, SaveProviderProfilesInput,
    SaveSettingsInput, RetryMessageResultDto, SendMessageInput, SendMessageResultDto,
    SettingsSnapshotDto,
};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, State};

#[derive(Default)]
struct StreamCancellationRegistry {
    flags: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl StreamCancellationRegistry {
    fn register(&self, conversation_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        let mut flags = self.flags.lock().expect("stream cancellation registry poisoned");
        flags.insert(conversation_id.to_string(), flag.clone());
        flag
    }

    fn cancel(&self, conversation_id: &str) {
        let flags = self.flags.lock().expect("stream cancellation registry poisoned");
        if let Some(flag) = flags.get(conversation_id) {
            flag.store(true, Ordering::SeqCst);
        }
    }

    fn clear(&self, conversation_id: &str) {
        let mut flags = self.flags.lock().expect("stream cancellation registry poisoned");
        flags.remove(conversation_id);
    }
}

#[tauri::command]
fn bootstrap_workspace(app: AppHandle) -> Result<BootstrapWorkspacePayload, String> {
    let database = db::Database::new(&app).map_err(|error| error.to_string())?;
    database.bootstrap_workspace().map_err(|error| error.to_string())
}

#[tauri::command]
fn create_conversation(app: AppHandle, title: Option<String>) -> Result<ConversationDto, String> {
    let database = db::Database::new(&app).map_err(|error| error.to_string())?;
    database
        .create_conversation(title)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_conversation(
    app: AppHandle,
    conversation_id: String,
) -> Result<BootstrapWorkspacePayload, String> {
    let database = db::Database::new(&app).map_err(|error| error.to_string())?;
    database
        .delete_conversation(&conversation_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_global_settings(
    app: AppHandle,
    input: SaveSettingsInput,
) -> Result<SettingsSnapshotDto, String> {
    let database = db::Database::new(&app).map_err(|error| error.to_string())?;
    database
        .save_settings(input)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_provider_profiles(
    app: AppHandle,
    input: SaveProviderProfilesInput,
) -> Result<SettingsSnapshotDto, String> {
    let database = db::Database::new(&app).map_err(|error| error.to_string())?;
    database
        .save_provider_profiles(input)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_api_key(provider_id: String, api_key: String) -> Result<(), String> {
    secrets::SecretStore::new()
        .set_api_key(&provider_id, api_key)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn clear_api_key(provider_id: String) -> Result<(), String> {
    secrets::SecretStore::new()
        .clear_api_key(&provider_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn fetch_available_models(
    app: AppHandle,
    provider_id: String,
    base_url: String,
) -> Result<Vec<String>, String> {
    let database = db::Database::new(&app).map_err(|error| error.to_string())?;
    database
        .fetch_available_models(provider_id, base_url)
        .await
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_conversation_settings(
    app: AppHandle,
    conversation_id: String,
    input: SaveSettingsInput,
) -> Result<ConversationSettingsDto, String> {
    let database = db::Database::new(&app).map_err(|error| error.to_string())?;
    database
        .save_conversation_settings(&conversation_id, input)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn reset_conversation_settings(
    app: AppHandle,
    conversation_id: String,
) -> Result<ConversationSettingsDto, String> {
    let database = db::Database::new(&app).map_err(|error| error.to_string())?;
    database
        .reset_conversation_settings(&conversation_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn send_message(
    app: AppHandle,
    stream_registry: State<'_, StreamCancellationRegistry>,
    input: SendMessageInput,
) -> Result<SendMessageResultDto, String> {
    let database = db::Database::new(&app).map_err(|error| error.to_string())?;
    let conversation_id = input.conversation_id.clone();
    let cancel_flag = stream_registry.register(&conversation_id);
    let result = database
        .send_message(&app, input, cancel_flag)
        .await
        .map_err(|error| error.to_string());
    stream_registry.clear(&conversation_id);
    result
}

#[tauri::command]
async fn retry_latest_failed_request(
    app: AppHandle,
    stream_registry: State<'_, StreamCancellationRegistry>,
    conversation_id: String,
) -> Result<RetryMessageResultDto, String> {
    let database = db::Database::new(&app).map_err(|error| error.to_string())?;
    let cancel_flag = stream_registry.register(&conversation_id);
    let result = database
        .retry_latest_failed_request(&app, &conversation_id, cancel_flag)
        .await
        .map_err(|error| error.to_string());
    stream_registry.clear(&conversation_id);
    result
}

#[tauri::command]
fn stop_streaming(
    stream_registry: State<'_, StreamCancellationRegistry>,
    conversation_id: String,
) -> Result<(), String> {
    stream_registry.cancel(&conversation_id);
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            db::Database::new(app.handle())?;
            Ok(())
        })
        .manage(StreamCancellationRegistry::default())
        .invoke_handler(tauri::generate_handler![
            bootstrap_workspace,
            create_conversation,
            delete_conversation,
            save_global_settings,
            save_provider_profiles,
            save_conversation_settings,
            reset_conversation_settings,
            set_api_key,
            clear_api_key,
            fetch_available_models,
            send_message,
            retry_latest_failed_request,
            stop_streaming
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ego");
}
