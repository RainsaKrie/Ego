use crate::models::{
    BootstrapWorkspacePayload, ConversationDto, ConversationSettingsDto, LatestRequestSummaryDto,
    MessageDto, RetryMessageResultDto, SaveSettingsInput, SendMessageInput, SendMessageResultDto,
    SettingsSnapshotDto, StreamCancelledEventDto, StreamChunkEventDto, StreamCompletedEventDto,
    StreamFailedEventDto,
};
use futures_util::StreamExt;
use crate::secrets::SecretStore;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::error::Error;
use std::fmt::{Display, Formatter};
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

const DATABASE_FILE_NAME: &str = "ego.db";
const STREAM_CHUNK_EVENT: &str = "conversation://stream-chunk";
const STREAM_COMPLETED_EVENT: &str = "conversation://stream-completed";
const STREAM_FAILED_EVENT: &str = "conversation://stream-failed";
const STREAM_CANCELLED_EVENT: &str = "conversation://stream-cancelled";

#[derive(Debug)]
pub enum DatabaseError {
    Sqlite(rusqlite::Error),
    Io(std::io::Error),
    Tauri(tauri::Error),
    Http(reqwest::Error),
    MissingApiKey,
    InvalidConversation,
}

impl Display for DatabaseError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Sqlite(error) => write!(f, "SQLite error: {error}"),
            Self::Io(error) => write!(f, "I/O error: {error}"),
            Self::Tauri(error) => write!(f, "Tauri path error: {error}"),
            Self::Http(error) => write!(f, "HTTP error: {error}"),
            Self::MissingApiKey => write!(f, "API Key 未配置，请先在全局设置中保存凭据。"),
            Self::InvalidConversation => write!(f, "当前会话不存在，无法发送消息。"),
        }
    }
}

impl Error for DatabaseError {}

impl From<rusqlite::Error> for DatabaseError {
    fn from(value: rusqlite::Error) -> Self {
        Self::Sqlite(value)
    }
}

impl From<std::io::Error> for DatabaseError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<tauri::Error> for DatabaseError {
    fn from(value: tauri::Error) -> Self {
        Self::Tauri(value)
    }
}

impl From<reqwest::Error> for DatabaseError {
    fn from(value: reqwest::Error) -> Self {
        Self::Http(value)
    }
}

pub struct Database {
    path: PathBuf,
}

struct ExecuteRequestContext {
    request_id: String,
    conversation_id: String,
    user_message: MessageDto,
    settings: ConversationSettingsDto,
    global_base_url: String,
    api_key: String,
    started_at: String,
    cancel_flag: Arc<AtomicBool>,
}

impl Database {
    pub fn new(app: &AppHandle) -> Result<Self, DatabaseError> {
        let app_data_dir = app.path().resolve("", BaseDirectory::AppConfig)?;
        fs::create_dir_all(&app_data_dir)?;
        let path = app_data_dir.join(DATABASE_FILE_NAME);
        let database = Self { path };
        database.initialize()?;
        Ok(database)
    }

    pub fn bootstrap_workspace(&self) -> Result<BootstrapWorkspacePayload, DatabaseError> {
        let connection = self.connect()?;
        let settings = self.read_settings(&connection)?;
        let conversations = self.list_conversations(&connection)?;
        let messages = self.list_messages(&connection)?;
        let mut messages_by_conversation_id: HashMap<String, Vec<MessageDto>> = HashMap::new();

        for message in messages {
            messages_by_conversation_id
                .entry(message.conversation_id.clone())
                .or_default()
                .push(message);
        }

        Ok(BootstrapWorkspacePayload {
            settings,
            conversations,
            messages_by_conversation_id,
            conversation_settings_by_id: self.list_conversation_settings_map(&connection)?,
            latest_request: self.latest_request_summary(&connection)?,
        })
    }

    pub fn save_settings(
        &self,
        input: SaveSettingsInput,
    ) -> Result<SettingsSnapshotDto, DatabaseError> {
        let connection = self.connect()?;
        self.upsert_setting(&connection, "base_url", &input.base_url)?;
        self.upsert_setting(&connection, "model", &input.model)?;
        self.upsert_setting(&connection, "temperature", &input.temperature.to_string())?;
        self.upsert_setting(&connection, "top_p", &input.top_p.to_string())?;
        self.upsert_setting(
            &connection,
            "max_output_tokens",
            &input.max_output_tokens.to_string(),
        )?;
        self.upsert_setting(&connection, "memory_policy", &input.memory_policy)?;
        self.read_settings(&connection)
    }

    pub fn create_conversation(
        &self,
        title: Option<String>,
    ) -> Result<ConversationDto, DatabaseError> {
        let connection = self.connect()?;
        let id = format!("conv-{}", now_millis());
        let now = now_iso();
        let title = title
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "未命名新会话".to_string());

        connection.execute(
            "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            params![id, title, now, now],
        )?;

        Ok(ConversationDto {
            id,
            title,
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn save_conversation_settings(
        &self,
        conversation_id: &str,
        input: SaveSettingsInput,
    ) -> Result<ConversationSettingsDto, DatabaseError> {
        let connection = self.connect()?;

        if !self.conversation_exists(&connection, conversation_id)? {
            return Err(DatabaseError::InvalidConversation);
        }

        connection.execute(
            "
            INSERT INTO conversation_settings
            (conversation_id, model, temperature, top_p, max_output_tokens, memory_policy)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(conversation_id) DO UPDATE SET
              model = excluded.model,
              temperature = excluded.temperature,
              top_p = excluded.top_p,
              max_output_tokens = excluded.max_output_tokens,
              memory_policy = excluded.memory_policy
            ",
            params![
                conversation_id,
                input.model,
                input.temperature,
                input.top_p,
                input.max_output_tokens,
                input.memory_policy
            ],
        )?;

        self.effective_conversation_settings(&connection, conversation_id)
    }

    pub fn reset_conversation_settings(
        &self,
        conversation_id: &str,
    ) -> Result<ConversationSettingsDto, DatabaseError> {
        let connection = self.connect()?;

        if !self.conversation_exists(&connection, conversation_id)? {
            return Err(DatabaseError::InvalidConversation);
        }

        connection.execute(
            "DELETE FROM conversation_settings WHERE conversation_id = ?1",
            params![conversation_id],
        )?;

        self.effective_conversation_settings(&connection, conversation_id)
    }

    pub async fn send_message(
        &self,
        app: &AppHandle,
        input: SendMessageInput,
        cancel_flag: Arc<AtomicBool>,
    ) -> Result<SendMessageResultDto, DatabaseError> {
        let connection = self.connect()?;
        let global_settings = self.read_settings(&connection)?;
        let settings = self.effective_conversation_settings(&connection, &input.conversation_id)?;
        let api_key = SecretStore::new()
            .get_api_key()
            .map_err(|_| DatabaseError::MissingApiKey)?;

        if !self.conversation_exists(&connection, &input.conversation_id)? {
            return Err(DatabaseError::InvalidConversation);
        }

        let user_message = MessageDto {
            id: format!("msg-{}", now_millis()),
            conversation_id: input.conversation_id.clone(),
            role: "user".to_string(),
            content: input.content.trim().to_string(),
            created_at: now_iso(),
        };

        self.insert_message(&connection, &user_message)?;
        let request_id = format!("req-{}", now_millis());
        let started_at = now_iso();
        self.insert_request_record(
            &connection,
            &request_id,
            &input.conversation_id,
            &user_message.id,
            "pending",
            &settings.model,
            &settings.memory_policy,
            settings.temperature,
            settings.top_p,
            settings.max_output_tokens,
            &global_settings.base_url,
            &started_at,
            None,
        )?;
        self.touch_conversation(&connection, &input.conversation_id, &started_at)?;

        self.execute_streaming_request(
            app,
            ExecuteRequestContext {
                request_id,
                conversation_id: input.conversation_id,
                user_message,
                settings,
                global_base_url: global_settings.base_url,
                api_key,
                started_at,
                cancel_flag,
            },
        )
        .await
    }

    fn initialize(&self) -> Result<(), DatabaseError> {
        let connection = self.connect()?;
        connection.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS conversations (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
              id TEXT PRIMARY KEY,
              conversation_id TEXT NOT NULL,
              role TEXT NOT NULL,
              content TEXT NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS request_records (
              id TEXT PRIMARY KEY,
              conversation_id TEXT NOT NULL,
              prompt_message_id TEXT NOT NULL,
              status TEXT NOT NULL,
              model TEXT NOT NULL,
              memory_policy TEXT NOT NULL,
              temperature REAL,
              top_p REAL,
              max_output_tokens INTEGER,
              base_url TEXT,
              started_at TEXT NOT NULL,
              finished_at TEXT,
              error_message TEXT,
              FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
              FOREIGN KEY(prompt_message_id) REFERENCES messages(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS conversation_settings (
              conversation_id TEXT PRIMARY KEY,
              model TEXT NOT NULL,
              temperature REAL NOT NULL,
              top_p REAL NOT NULL,
              max_output_tokens INTEGER NOT NULL,
              memory_policy TEXT NOT NULL,
              FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS usage_records (
              request_id TEXT PRIMARY KEY,
              prompt_tokens INTEGER,
              completion_tokens INTEGER,
              total_tokens INTEGER,
              latency_ms INTEGER,
              estimated_cost_usd REAL,
              usage_source TEXT NOT NULL,
              FOREIGN KEY(request_id) REFERENCES request_records(id) ON DELETE CASCADE
            );
            ",
        )?;

        self.ensure_request_record_columns(&connection)?;
        self.seed_defaults(&connection)?;
        self.recover_pending_requests(&connection)?;
        Ok(())
    }

    fn seed_defaults(&self, connection: &Connection) -> Result<(), DatabaseError> {
        let default_settings = [
            ("base_url", "https://api.openai.com/v1"),
            ("model", "gpt-4.1-mini"),
            ("temperature", "0.7"),
            ("top_p", "1"),
            ("max_output_tokens", "1024"),
            ("memory_policy", "recent-window"),
        ];

        for (key, value) in default_settings {
            self.upsert_setting(connection, key, value)?;
        }

        let conversation_count: i64 =
            connection.query_row("SELECT COUNT(*) FROM conversations", [], |row| row.get(0))?;

        if conversation_count == 0 {
            let conversation_id = "conv-welcome";
            let created_at = now_iso();
            connection.execute(
                "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
                params![conversation_id, "欢迎来到 Ego", created_at, created_at],
            )?;
            connection.execute(
                "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    "msg-welcome-user",
                    conversation_id,
                    "user",
                    "先把默认环境、会话主链和凭据边界站住。",
                    created_at
                ],
            )?;
            connection.execute(
                "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    "msg-welcome-assistant",
                    conversation_id,
                    "assistant",
                    "当前已经接入 SQLite 与系统凭据存储，后续可以继续补请求主链和 usage 落盘。",
                    created_at
                ],
            )?;
        }

        Ok(())
    }

    fn connect(&self) -> Result<Connection, rusqlite::Error> {
        Connection::open(&self.path)
    }

    fn read_settings(&self, connection: &Connection) -> Result<SettingsSnapshotDto, DatabaseError> {
        let base_url = self.read_setting(connection, "base_url")?;
        let model = self.read_setting(connection, "model")?;
        let temperature = self
            .read_setting(connection, "temperature")?
            .parse::<f64>()
            .unwrap_or(0.7);
        let top_p = self
            .read_setting(connection, "top_p")?
            .parse::<f64>()
            .unwrap_or(1.0);
        let max_output_tokens = self
            .read_setting(connection, "max_output_tokens")?
            .parse::<i64>()
            .unwrap_or(1024);
        let memory_policy = self.read_setting(connection, "memory_policy")?;
        let has_api_key = SecretStore::new().has_api_key();

        Ok(SettingsSnapshotDto {
            base_url,
            model,
            temperature,
            top_p,
            max_output_tokens,
            memory_policy,
            has_api_key,
            price_preset: "builtin",
        })
    }

    fn list_conversation_settings_map(
        &self,
        connection: &Connection,
    ) -> Result<HashMap<String, ConversationSettingsDto>, DatabaseError> {
        let conversations = self.list_conversations(connection)?;
        let mut map = HashMap::new();

        for conversation in conversations {
            let settings = self.effective_conversation_settings(connection, &conversation.id)?;
            map.insert(conversation.id, settings);
        }

        Ok(map)
    }

    fn effective_conversation_settings(
        &self,
        connection: &Connection,
        conversation_id: &str,
    ) -> Result<ConversationSettingsDto, DatabaseError> {
        let defaults = self.read_settings(connection)?;
        let override_result = connection.query_row(
            "
            SELECT model, temperature, top_p, max_output_tokens, memory_policy
            FROM conversation_settings
            WHERE conversation_id = ?1
            ",
            params![conversation_id],
            |row| {
                Ok(ConversationSettingsDto {
                    conversation_id: conversation_id.to_string(),
                    model: row.get(0)?,
                    temperature: row.get(1)?,
                    top_p: row.get(2)?,
                    max_output_tokens: row.get(3)?,
                    memory_policy: row.get(4)?,
                    inherits_default: false,
                })
            },
        );

        match override_result {
            Ok(settings) => Ok(settings),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(ConversationSettingsDto {
                conversation_id: conversation_id.to_string(),
                model: defaults.model,
                temperature: defaults.temperature,
                top_p: defaults.top_p,
                max_output_tokens: defaults.max_output_tokens,
                memory_policy: defaults.memory_policy,
                inherits_default: true,
            }),
            Err(error) => Err(DatabaseError::Sqlite(error)),
        }
    }

    fn latest_request_summary(
        &self,
        connection: &Connection,
    ) -> Result<LatestRequestSummaryDto, DatabaseError> {
        let request_count: i64 = connection.query_row(
            "SELECT COUNT(*) FROM request_records",
            [],
            |row| row.get(0),
        )?;
        let total_tokens: i64 = connection.query_row(
            "SELECT COALESCE(SUM(total_tokens), 0) FROM usage_records",
            [],
            |row| row.get(0),
        )?;

        let latest = connection.query_row(
            "
            SELECT
              r.conversation_id,
              r.id,
              r.status,
              r.model,
              r.memory_policy,
              u.prompt_tokens,
              u.completion_tokens,
              u.total_tokens,
              COALESCE(u.latency_ms, 0),
              COALESCE(u.estimated_cost_usd, 0),
              COALESCE(u.usage_source, 'unknown'),
              r.started_at,
              r.finished_at,
              r.error_message
            FROM request_records r
            LEFT JOIN usage_records u ON u.request_id = r.id
            ORDER BY r.started_at DESC
            LIMIT 1
            ",
            [],
            |row| {
                Ok(LatestRequestSummaryDto {
                    conversation_id: row.get(0)?,
                    request_id: row.get(1)?,
                    status: row.get(2)?,
                    model: row.get(3)?,
                    memory_policy: row.get(4)?,
                    request_count,
                    prompt_tokens: row.get(5)?,
                    completion_tokens: row.get(6)?,
                    request_total_tokens: row.get(7)?,
                    cumulative_total_tokens: total_tokens,
                    latency_ms: row.get(8)?,
                    estimated_cost_usd: row.get(9)?,
                    usage_source: row.get(10)?,
                    started_at: row.get(11)?,
                    finished_at: row.get(12)?,
                    error_message: row.get(13)?,
                })
            },
        );

        match latest {
            Ok(summary) => Ok(summary),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(LatestRequestSummaryDto {
                status: "idle".to_string(),
                conversation_id: None,
                request_id: None,
                model: None,
                memory_policy: None,
                request_count,
                prompt_tokens: None,
                completion_tokens: None,
                request_total_tokens: None,
                cumulative_total_tokens: total_tokens,
                latency_ms: 0,
                estimated_cost_usd: 0.0,
                usage_source: "unknown".to_string(),
                started_at: None,
                finished_at: None,
                error_message: None,
            }),
            Err(error) => Err(DatabaseError::Sqlite(error)),
        }
    }

    fn latest_failed_request_snapshot(
        &self,
        connection: &Connection,
        conversation_id: &str,
    ) -> Result<(MessageDto, String, String, f64, f64, i64, String), DatabaseError> {
        connection.query_row(
            "
            SELECT
              r.prompt_message_id,
              r.model,
              r.memory_policy,
              COALESCE(r.temperature, 0.7),
              COALESCE(r.top_p, 1.0),
              COALESCE(r.max_output_tokens, 1024),
              COALESCE(r.base_url, '')
            FROM request_records r
            WHERE r.conversation_id = ?1 AND r.status = 'failed'
            ORDER BY r.started_at DESC
            LIMIT 1
            ",
            params![conversation_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, f64>(3)?,
                    row.get::<_, f64>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, String>(6)?,
                ))
            },
        )
        .map_err(DatabaseError::Sqlite)
        .and_then(
            |(prompt_message_id, model, memory_policy, temperature, top_p, max_output_tokens, base_url)| {
                let prompt_message = self.read_message_by_id(connection, &prompt_message_id)?;
                Ok((
                    prompt_message,
                    model,
                    memory_policy,
                    temperature,
                    top_p,
                    max_output_tokens,
                    base_url,
                ))
            },
        )
    }

    fn list_conversations(&self, connection: &Connection) -> Result<Vec<ConversationDto>, DatabaseError> {
        let mut statement = connection.prepare(
            "SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(ConversationDto {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })?;

        let conversations = rows.collect::<Result<Vec<_>, _>>()?;
        Ok(conversations)
    }

    pub async fn retry_latest_failed_request(
        &self,
        app: &AppHandle,
        conversation_id: &str,
        cancel_flag: Arc<AtomicBool>,
    ) -> Result<RetryMessageResultDto, DatabaseError> {
        let connection = self.connect()?;
        let global_settings = self.read_settings(&connection)?;

        if !self.conversation_exists(&connection, conversation_id)? {
            return Err(DatabaseError::InvalidConversation);
        }

        let (prompt_message, model, memory_policy, temperature, top_p, max_output_tokens, base_url) =
            self.latest_failed_request_snapshot(&connection, conversation_id)?;
        let api_key = SecretStore::new()
            .get_api_key()
            .map_err(|_| DatabaseError::MissingApiKey)?;
        let request_id = format!("req-{}", now_millis());
        let started_at = now_iso();

        self.insert_request_record(
            &connection,
            &request_id,
            conversation_id,
            &prompt_message.id,
            "pending",
            &model,
            &memory_policy,
            temperature,
            top_p,
            max_output_tokens,
            &base_url,
            &started_at,
            None,
        )?;
        self.touch_conversation(&connection, conversation_id, &started_at)?;

        let effective_settings = ConversationSettingsDto {
            conversation_id: conversation_id.to_string(),
            model,
            temperature,
            top_p,
            max_output_tokens,
            memory_policy,
            inherits_default: false,
        };

        let result = self
            .execute_streaming_request(
                app,
                ExecuteRequestContext {
                    request_id,
                    conversation_id: conversation_id.to_string(),
                    user_message: prompt_message.clone(),
                    settings: effective_settings,
                    global_base_url: if base_url.trim().is_empty() {
                        global_settings.base_url
                    } else {
                        base_url
                    },
                    api_key,
                    started_at,
                    cancel_flag,
                },
            )
            .await?;

        Ok(RetryMessageResultDto {
            prompt_message,
            assistant_message: result.assistant_message,
            latest_request: result.latest_request,
            conversation_updated_at: result.conversation_updated_at,
        })
    }

    fn list_messages(&self, connection: &Connection) -> Result<Vec<MessageDto>, DatabaseError> {
        let mut statement = connection.prepare(
            "SELECT id, conversation_id, role, content, created_at FROM messages ORDER BY created_at ASC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(MessageDto {
                id: row.get(0)?,
                conversation_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;

        let messages = rows.collect::<Result<Vec<_>, _>>()?;
        Ok(messages)
    }

    fn read_message_by_id(
        &self,
        connection: &Connection,
        message_id: &str,
    ) -> Result<MessageDto, DatabaseError> {
        connection
            .query_row(
                "SELECT id, conversation_id, role, content, created_at FROM messages WHERE id = ?1",
                params![message_id],
                |row| {
                    Ok(MessageDto {
                        id: row.get(0)?,
                        conversation_id: row.get(1)?,
                        role: row.get(2)?,
                        content: row.get(3)?,
                        created_at: row.get(4)?,
                    })
                },
            )
            .map_err(DatabaseError::Sqlite)
    }

    fn insert_message(&self, connection: &Connection, message: &MessageDto) -> Result<(), DatabaseError> {
        connection.execute(
            "INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                message.id,
                message.conversation_id,
                message.role,
                message.content,
                message.created_at
            ],
        )?;
        Ok(())
    }

    fn insert_request_record(
        &self,
        connection: &Connection,
        request_id: &str,
        conversation_id: &str,
        prompt_message_id: &str,
        status: &str,
        model: &str,
        memory_policy: &str,
        temperature: f64,
        top_p: f64,
        max_output_tokens: i64,
        base_url: &str,
        started_at: &str,
        finished_at: Option<&str>,
    ) -> Result<(), DatabaseError> {
        connection.execute(
            "
            INSERT INTO request_records
            (id, conversation_id, prompt_message_id, status, model, memory_policy, temperature, top_p, max_output_tokens, base_url, started_at, finished_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            ",
            params![
                request_id,
                conversation_id,
                prompt_message_id,
                status,
                model,
                memory_policy,
                temperature,
                top_p,
                max_output_tokens,
                base_url,
                started_at,
                finished_at
            ],
        )?;
        Ok(())
    }

    fn finalize_completed_request(
        &self,
        connection: &Connection,
        request_id: &str,
        latency_ms: i64,
        prompt_tokens: i64,
        completion_tokens: i64,
        total_tokens: i64,
        estimated_cost_usd: f64,
        usage_source: &str,
    ) -> Result<(), DatabaseError> {
        let finished_at = now_iso();
        connection.execute(
            "
            UPDATE request_records
            SET status = 'completed', finished_at = ?2, error_message = NULL
            WHERE id = ?1
            ",
            params![request_id, finished_at],
        )?;
        connection.execute(
            "
            INSERT INTO usage_records
            (request_id, prompt_tokens, completion_tokens, total_tokens, latency_ms, estimated_cost_usd, usage_source)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(request_id) DO UPDATE SET
              prompt_tokens = excluded.prompt_tokens,
              completion_tokens = excluded.completion_tokens,
              total_tokens = excluded.total_tokens,
              latency_ms = excluded.latency_ms,
              estimated_cost_usd = excluded.estimated_cost_usd,
              usage_source = excluded.usage_source
            ",
            params![
                request_id,
                prompt_tokens,
                completion_tokens,
                total_tokens,
                latency_ms,
                estimated_cost_usd,
                usage_source
            ],
        )?;
        Ok(())
    }

    fn finalize_failed_request(
        &self,
        connection: &Connection,
        request_id: &str,
        latency_ms: i64,
        error_message: String,
    ) -> Result<(), DatabaseError> {
        let finished_at = now_iso();
        connection.execute(
            "
            UPDATE request_records
            SET status = 'failed', finished_at = ?2, error_message = ?3
            WHERE id = ?1
            ",
            params![request_id, finished_at, error_message],
        )?;
        connection.execute(
            "
            INSERT INTO usage_records
            (request_id, prompt_tokens, completion_tokens, total_tokens, latency_ms, estimated_cost_usd, usage_source)
            VALUES (?1, NULL, NULL, NULL, ?2, 0, 'unknown')
            ON CONFLICT(request_id) DO UPDATE SET
              latency_ms = excluded.latency_ms,
              estimated_cost_usd = excluded.estimated_cost_usd,
              usage_source = excluded.usage_source
            ",
            params![request_id, latency_ms],
        )?;
        Ok(())
    }

    fn finalize_cancelled_request(
        &self,
        connection: &Connection,
        request_id: &str,
        latency_ms: i64,
    ) -> Result<(), DatabaseError> {
        let finished_at = now_iso();
        connection.execute(
            "
            UPDATE request_records
            SET status = 'cancelled', finished_at = ?2, error_message = NULL
            WHERE id = ?1
            ",
            params![request_id, finished_at],
        )?;
        connection.execute(
            "
            INSERT INTO usage_records
            (request_id, prompt_tokens, completion_tokens, total_tokens, latency_ms, estimated_cost_usd, usage_source)
            VALUES (?1, NULL, NULL, NULL, ?2, 0, 'unknown')
            ON CONFLICT(request_id) DO UPDATE SET
              latency_ms = excluded.latency_ms,
              estimated_cost_usd = excluded.estimated_cost_usd,
              usage_source = excluded.usage_source
            ",
            params![request_id, latency_ms],
        )?;
        Ok(())
    }

    fn touch_conversation(
        &self,
        connection: &Connection,
        conversation_id: &str,
        updated_at: &str,
    ) -> Result<(), DatabaseError> {
        connection.execute(
            "UPDATE conversations SET updated_at = ?2 WHERE id = ?1",
            params![conversation_id, updated_at],
        )?;
        Ok(())
    }

    fn conversation_exists(
        &self,
        connection: &Connection,
        conversation_id: &str,
    ) -> Result<bool, DatabaseError> {
        let count: i64 = connection.query_row(
            "SELECT COUNT(*) FROM conversations WHERE id = ?1",
            params![conversation_id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    fn build_provider_messages(
        &self,
        connection: &Connection,
        conversation_id: &str,
        memory_policy: &str,
    ) -> Result<Vec<Value>, DatabaseError> {
        let mut statement = connection.prepare(
            "SELECT role, content FROM messages WHERE conversation_id = ?1 ORDER BY created_at ASC",
        )?;
        let rows = statement.query_map(params![conversation_id], |row| {
            let role: String = row.get(0)?;
            let content: String = row.get(1)?;
            Ok(json!({ "role": role, "content": content }))
        })?;
        let mut messages = rows.collect::<Result<Vec<_>, _>>()?;

        if memory_policy == "none" {
            if let Some(last) = messages.pop() {
                return Ok(vec![last]);
            }

            return Ok(Vec::new());
        }

        if messages.len() > 12 {
            messages = messages.split_off(messages.len() - 12);
        }

        Ok(messages)
    }

    fn recover_pending_requests(&self, connection: &Connection) -> Result<(), DatabaseError> {
        let mut statement = connection.prepare(
            "SELECT id FROM request_records WHERE status = 'pending' ORDER BY started_at ASC",
        )?;
        let request_ids = statement
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;

        for request_id in request_ids {
            self.finalize_failed_request(
                connection,
                &request_id,
                0,
                "应用在上次请求完成前退出，系统已在重启时将该请求标记为失败。".to_string(),
            )?;
        }

        Ok(())
    }

    fn read_setting(&self, connection: &Connection, key: &str) -> Result<String, DatabaseError> {
        let value = connection.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )?;
        Ok(value)
    }

    fn upsert_setting(
        &self,
        connection: &Connection,
        key: &str,
        value: &str,
    ) -> Result<(), DatabaseError> {
        connection.execute(
            "
            INSERT INTO settings (key, value)
            VALUES (?1, ?2)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            ",
            params![key, value],
        )?;

        Ok(())
    }

    fn ensure_request_record_columns(
        &self,
        connection: &Connection,
    ) -> Result<(), DatabaseError> {
        let mut statement = connection.prepare("PRAGMA table_info(request_records)")?;
        let rows = statement.query_map([], |row| row.get::<_, String>(1))?;
        let columns = rows.collect::<Result<Vec<_>, _>>()?;

        if !columns.iter().any(|column| column == "temperature") {
            connection.execute("ALTER TABLE request_records ADD COLUMN temperature REAL", [])?;
        }
        if !columns.iter().any(|column| column == "top_p") {
            connection.execute("ALTER TABLE request_records ADD COLUMN top_p REAL", [])?;
        }
        if !columns.iter().any(|column| column == "max_output_tokens") {
            connection.execute(
                "ALTER TABLE request_records ADD COLUMN max_output_tokens INTEGER",
                [],
            )?;
        }
        if !columns.iter().any(|column| column == "base_url") {
            connection.execute("ALTER TABLE request_records ADD COLUMN base_url TEXT", [])?;
        }

        Ok(())
    }

    async fn execute_streaming_request(
        &self,
        app: &AppHandle,
        context: ExecuteRequestContext,
    ) -> Result<SendMessageResultDto, DatabaseError> {
        let history = {
            let connection = self.connect()?;
            self.build_provider_messages(
                &connection,
                &context.conversation_id,
                &context.settings.memory_policy,
            )?
        };
        let request_body = json!({
            "model": context.settings.model,
            "messages": history,
            "temperature": context.settings.temperature,
            "top_p": context.settings.top_p,
            "max_tokens": context.settings.max_output_tokens,
            "stream": true,
            "stream_options": {
                "include_usage": true
            }
        });

        let client = reqwest::Client::new();
        let started_at_instant = SystemTime::now();
        let response_result = client
            .post(format!(
                "{}/chat/completions",
                context.global_base_url.trim_end_matches('/')
            ))
            .header(CONTENT_TYPE, "application/json")
            .header(AUTHORIZATION, format!("Bearer {}", context.api_key))
            .json(&request_body)
            .send()
            .await;

        let latency_ms = elapsed_millis(started_at_instant);

        match response_result {
            Ok(response) => {
                let status = response.status();

                if !status.is_success() {
                    let body_text = response.text().await.unwrap_or_default();
                    let body = serde_json::from_str::<Value>(&body_text).unwrap_or(Value::Null);
                    let error_message = provider_error_message(&body).unwrap_or_else(|| {
                        format!("Provider 请求失败，HTTP {}", status.as_u16())
                    });
                    let connection = self.connect()?;
                    self.finalize_failed_request(
                        &connection,
                        &context.request_id,
                        latency_ms,
                        error_message.clone(),
                    )?;
                    app.emit(
                        STREAM_FAILED_EVENT,
                        StreamFailedEventDto {
                            conversation_id: context.conversation_id.clone(),
                            request_id: context.request_id.clone(),
                            error_message: error_message.clone(),
                        },
                    )
                    .ok();

                    return Ok(SendMessageResultDto {
                        user_message: context.user_message,
                        assistant_message: None,
                        latest_request: self.latest_request_summary(&connection)?,
                        conversation_updated_at: context.started_at,
                    });
                }

                let mut response_stream = response.bytes_stream();
                let mut stream_buffer = String::new();
                let mut accumulated_text = String::new();
                let mut prompt_tokens = 0_i64;
                let mut completion_tokens = 0_i64;
                let mut total_tokens = 0_i64;
                let mut usage_source = "unknown".to_string();

                while let Some(chunk_result) = response_stream.next().await {
                    if context.cancel_flag.load(Ordering::SeqCst) {
                        let connection = self.connect()?;
                        self.finalize_cancelled_request(
                            &connection,
                            &context.request_id,
                            elapsed_millis(started_at_instant),
                        )?;
                        app.emit(
                            STREAM_CANCELLED_EVENT,
                            StreamCancelledEventDto {
                                conversation_id: context.conversation_id.clone(),
                                request_id: context.request_id.clone(),
                            },
                        )
                        .ok();

                        return Ok(SendMessageResultDto {
                            user_message: context.user_message,
                            assistant_message: None,
                            latest_request: self.latest_request_summary(&connection)?,
                            conversation_updated_at: context.started_at,
                        });
                    }

                    let chunk = match chunk_result {
                        Ok(chunk) => chunk,
                        Err(error) => {
                            let error_message = error.to_string();
                            let connection = self.connect()?;
                            self.finalize_failed_request(
                                &connection,
                                &context.request_id,
                                elapsed_millis(started_at_instant),
                                error_message.clone(),
                            )?;
                            app.emit(
                                STREAM_FAILED_EVENT,
                                StreamFailedEventDto {
                                    conversation_id: context.conversation_id.clone(),
                                    request_id: context.request_id.clone(),
                                    error_message: error_message.clone(),
                                },
                            )
                            .ok();

                            return Ok(SendMessageResultDto {
                                user_message: context.user_message,
                                assistant_message: None,
                                latest_request: self.latest_request_summary(&connection)?,
                                conversation_updated_at: context.started_at,
                            });
                        }
                    };
                    let chunk_text = String::from_utf8_lossy(&chunk);
                    stream_buffer.push_str(&chunk_text);

                    while let Some(newline_index) = stream_buffer.find('\n') {
                        let line = stream_buffer[..newline_index].trim().to_string();
                        stream_buffer = stream_buffer[newline_index + 1..].to_string();

                        if line.is_empty() || !line.starts_with("data:") {
                            continue;
                        }

                        let payload = line.trim_start_matches("data:").trim();
                        if payload == "[DONE]" {
                            continue;
                        }

                        let body = serde_json::from_str::<Value>(payload).unwrap_or(Value::Null);
                        let delta_text = extract_stream_delta_content(&body);

                        if !delta_text.is_empty() {
                            accumulated_text.push_str(&delta_text);
                            app.emit(
                                STREAM_CHUNK_EVENT,
                                StreamChunkEventDto {
                                    conversation_id: context.conversation_id.clone(),
                                    request_id: context.request_id.clone(),
                                    delta_text,
                                    accumulated_text: accumulated_text.clone(),
                                    model: context.settings.model.clone(),
                                },
                            )
                            .ok();
                        }

                        if let Some(usage) = body.get("usage") {
                            prompt_tokens = usage
                                .get("prompt_tokens")
                                .and_then(|value| value.as_i64())
                                .unwrap_or(prompt_tokens);
                            completion_tokens = usage
                                .get("completion_tokens")
                                .and_then(|value| value.as_i64())
                                .unwrap_or(completion_tokens);
                            total_tokens = usage
                                .get("total_tokens")
                                .and_then(|value| value.as_i64())
                                .unwrap_or(total_tokens);
                            usage_source = "provider-reported".to_string();
                        }
                    }
                }

                if context.cancel_flag.load(Ordering::SeqCst) {
                    let connection = self.connect()?;
                    self.finalize_cancelled_request(
                        &connection,
                        &context.request_id,
                        elapsed_millis(started_at_instant),
                    )?;
                    app.emit(
                        STREAM_CANCELLED_EVENT,
                        StreamCancelledEventDto {
                            conversation_id: context.conversation_id.clone(),
                            request_id: context.request_id.clone(),
                        },
                    )
                    .ok();

                    return Ok(SendMessageResultDto {
                        user_message: context.user_message,
                        assistant_message: None,
                        latest_request: self.latest_request_summary(&connection)?,
                        conversation_updated_at: context.started_at,
                    });
                }

                let assistant_content = if accumulated_text.trim().is_empty() {
                    "模型返回了空响应。".to_string()
                } else {
                    accumulated_text.clone()
                };
                let assistant_message = MessageDto {
                    id: format!("msg-{}", now_millis() + 1),
                    conversation_id: context.conversation_id.clone(),
                    role: "assistant".to_string(),
                    content: assistant_content,
                    created_at: now_iso(),
                };
                let connection = self.connect()?;
                self.insert_message(&connection, &assistant_message)?;
                self.touch_conversation(
                    &connection,
                    &context.conversation_id,
                    &assistant_message.created_at,
                )?;

                if usage_source != "provider-reported" {
                    total_tokens = 0;
                }
                let estimated_cost_usd = estimate_cost(
                    &context.settings.model,
                    prompt_tokens,
                    completion_tokens,
                );

                self.finalize_completed_request(
                    &connection,
                    &context.request_id,
                    latency_ms,
                    prompt_tokens,
                    completion_tokens,
                    total_tokens,
                    estimated_cost_usd,
                    &usage_source,
                )?;

                app.emit(
                    STREAM_COMPLETED_EVENT,
                    StreamCompletedEventDto {
                        conversation_id: context.conversation_id.clone(),
                        request_id: context.request_id.clone(),
                        assistant_message_id: assistant_message.id.clone(),
                        full_text: assistant_message.content.clone(),
                    },
                )
                .ok();

                Ok(SendMessageResultDto {
                    user_message: context.user_message,
                    assistant_message: Some(assistant_message.clone()),
                    latest_request: self.latest_request_summary(&connection)?,
                    conversation_updated_at: assistant_message.created_at,
                })
            }
            Err(error) => {
                let error_message = error.to_string();
                let connection = self.connect()?;
                self.finalize_failed_request(
                    &connection,
                    &context.request_id,
                    latency_ms,
                    error_message.clone(),
                )?;
                app.emit(
                    STREAM_FAILED_EVENT,
                    StreamFailedEventDto {
                        conversation_id: context.conversation_id.clone(),
                        request_id: context.request_id.clone(),
                        error_message,
                    },
                )
                .ok();

                Ok(SendMessageResultDto {
                    user_message: context.user_message,
                    assistant_message: None,
                    latest_request: self.latest_request_summary(&connection)?,
                    conversation_updated_at: context.started_at,
                })
            }
        }
    }
}

fn extract_stream_delta_content(body: &Value) -> String {
    body.get("choices")
        .and_then(|choices| choices.as_array())
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("delta"))
        .and_then(|delta| delta.get("content"))
        .map(|content| {
            if let Some(text) = content.as_str() {
                return text.to_string();
            }

            if let Some(parts) = content.as_array() {
                return parts
                    .iter()
                    .filter_map(|part| {
                        part.get("text")
                            .and_then(|value| value.as_str())
                            .map(ToString::to_string)
                    })
                    .collect::<Vec<_>>()
                    .join("");
            }

            String::new()
        })
        .unwrap_or_default()
}

fn provider_error_message(body: &Value) -> Option<String> {
    body.get("error")
        .and_then(|error| error.get("message"))
        .and_then(|message| message.as_str())
        .map(ToString::to_string)
}

fn estimate_cost(model: &str, prompt_tokens: i64, completion_tokens: i64) -> f64 {
    let (input_per_million, output_per_million) = match model {
        "gpt-4.1-mini" => (0.40, 1.60),
        "gpt-4.1" => (2.00, 8.00),
        "gpt-4o-mini" => (0.15, 0.60),
        "gpt-4o" => (2.50, 10.00),
        _ => (0.0, 0.0),
    };

    ((prompt_tokens as f64 / 1_000_000.0) * input_per_million)
        + ((completion_tokens as f64 / 1_000_000.0) * output_per_million)
}

fn elapsed_millis(started_at: SystemTime) -> i64 {
    SystemTime::now()
        .duration_since(started_at)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

fn now_iso() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| now_millis().to_string())
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}
