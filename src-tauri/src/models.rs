use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsSnapshotDto {
    pub base_url: String,
    pub model: String,
    pub temperature: f64,
    pub top_p: f64,
    pub max_output_tokens: i64,
    pub memory_policy: String,
    pub has_api_key: bool,
    pub price_preset: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationSettingsDto {
    pub conversation_id: String,
    pub model: String,
    pub temperature: f64,
    pub top_p: f64,
    pub max_output_tokens: i64,
    pub memory_policy: String,
    pub inherits_default: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSettingsInput {
    pub base_url: String,
    pub model: String,
    pub temperature: f64,
    pub top_p: f64,
    pub max_output_tokens: i64,
    pub memory_policy: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationDto {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageDto {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapWorkspacePayload {
    pub settings: SettingsSnapshotDto,
    pub conversations: Vec<ConversationDto>,
    pub messages_by_conversation_id: HashMap<String, Vec<MessageDto>>,
    pub conversation_settings_by_id: HashMap<String, ConversationSettingsDto>,
    pub latest_request: LatestRequestSummaryDto,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LatestRequestSummaryDto {
    pub status: String,
    pub conversation_id: Option<String>,
    pub request_id: Option<String>,
    pub model: Option<String>,
    pub memory_policy: Option<String>,
    pub request_count: i64,
    pub prompt_tokens: Option<i64>,
    pub completion_tokens: Option<i64>,
    pub request_total_tokens: Option<i64>,
    pub cumulative_total_tokens: i64,
    pub latency_ms: i64,
    pub estimated_cost_usd: f64,
    pub usage_source: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageInput {
    pub conversation_id: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageResultDto {
    pub user_message: MessageDto,
    pub assistant_message: Option<MessageDto>,
    pub latest_request: LatestRequestSummaryDto,
    pub conversation_updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RetryMessageResultDto {
    pub prompt_message: MessageDto,
    pub assistant_message: Option<MessageDto>,
    pub latest_request: LatestRequestSummaryDto,
    pub conversation_updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamChunkEventDto {
    pub conversation_id: String,
    pub request_id: String,
    pub delta_text: String,
    pub accumulated_text: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamCompletedEventDto {
    pub conversation_id: String,
    pub request_id: String,
    pub assistant_message_id: String,
    pub full_text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamFailedEventDto {
    pub conversation_id: String,
    pub request_id: String,
    pub error_message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamCancelledEventDto {
    pub conversation_id: String,
    pub request_id: String,
}
