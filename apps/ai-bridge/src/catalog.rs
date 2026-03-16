use restflow_core::AIModel;
use restflow_core::auth::AuthProvider;

use crate::types::{ProviderCapability, ProviderModel};

struct ProviderDefinition {
    id: &'static str,
    label: &'static str,
    kind: &'static str,
    models: &'static [AIModel],
    auth_providers: &'static [AuthProvider],
    required_command: Option<&'static str>,
}

const OPENAI_MODELS: &[AIModel] = &[AIModel::Gpt5, AIModel::Gpt5Mini];
const ANTHROPIC_MODELS: &[AIModel] = &[AIModel::ClaudeSonnet4_5, AIModel::ClaudeOpus4_6];
const GOOGLE_MODELS: &[AIModel] = &[AIModel::Gemini25Pro];
const CODEX_MODELS: &[AIModel] = &[AIModel::Gpt5Codex, AIModel::CodexCli];
const CLAUDE_CODE_MODELS: &[AIModel] = &[AIModel::ClaudeCodeSonnet, AIModel::ClaudeCodeOpus];
const GEMINI_CLI_MODELS: &[AIModel] = &[AIModel::GeminiCli];

const PROVIDERS: &[ProviderDefinition] = &[
    ProviderDefinition {
        id: "openai",
        label: "OpenAI",
        kind: "api",
        models: OPENAI_MODELS,
        auth_providers: &[AuthProvider::OpenAI],
        required_command: None,
    },
    ProviderDefinition {
        id: "anthropic",
        label: "Anthropic",
        kind: "api",
        models: ANTHROPIC_MODELS,
        auth_providers: &[AuthProvider::Anthropic],
        required_command: None,
    },
    ProviderDefinition {
        id: "google",
        label: "Google",
        kind: "api",
        models: GOOGLE_MODELS,
        auth_providers: &[AuthProvider::Google],
        required_command: None,
    },
    ProviderDefinition {
        id: "codex-cli",
        label: "Codex CLI",
        kind: "cli",
        models: CODEX_MODELS,
        auth_providers: &[AuthProvider::OpenAICodex],
        required_command: Some("codex"),
    },
    ProviderDefinition {
        id: "claude-code",
        label: "Claude Code",
        kind: "cli",
        models: CLAUDE_CODE_MODELS,
        auth_providers: &[AuthProvider::ClaudeCode],
        required_command: Some("claude"),
    },
    ProviderDefinition {
        id: "gemini-cli",
        label: "Gemini CLI",
        kind: "cli",
        models: GEMINI_CLI_MODELS,
        auth_providers: &[AuthProvider::Google],
        required_command: Some("gemini"),
    },
];

pub fn provider_capabilities() -> Vec<ProviderCapability> {
    PROVIDERS
        .iter()
        .map(|provider| {
            let command_ready = provider
                .required_command
                .map(|command| which::which(command).is_ok())
                .unwrap_or(true);
            let status = if command_ready {
                "ready".to_string()
            } else {
                format!(
                    "missing_command:{}",
                    provider.required_command.unwrap_or("unknown")
                )
            };

            ProviderCapability {
                id: provider.id.to_string(),
                label: provider.label.to_string(),
                kind: provider.kind.to_string(),
                available: command_ready,
                status,
                models: provider
                    .models
                    .iter()
                    .map(|model| ProviderModel {
                        id: model.as_serialized_str().to_string(),
                        label: model.display_name().to_string(),
                        provider: provider.id.to_string(),
                        supports_temperature: model.supports_temperature(),
                    })
                    .collect(),
                auth_providers: provider
                    .auth_providers
                    .iter()
                    .map(auth_provider_id)
                    .map(str::to_string)
                    .collect(),
            }
        })
        .collect()
}

pub fn auth_provider_id(provider: &AuthProvider) -> &'static str {
    match provider {
        AuthProvider::Anthropic => "anthropic",
        AuthProvider::ClaudeCode => "claude_code",
        AuthProvider::OpenAI => "openai",
        AuthProvider::OpenAICodex => "openai_codex",
        AuthProvider::Google => "google",
        AuthProvider::Other => "other",
    }
}

pub fn parse_auth_provider(value: &str) -> Option<AuthProvider> {
    match value {
        "anthropic" => Some(AuthProvider::Anthropic),
        "claude_code" => Some(AuthProvider::ClaudeCode),
        "openai" => Some(AuthProvider::OpenAI),
        "openai_codex" => Some(AuthProvider::OpenAICodex),
        "google" => Some(AuthProvider::Google),
        "other" => Some(AuthProvider::Other),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_expected_provider_catalog() {
        let providers = provider_capabilities();
        let ids = providers
            .iter()
            .map(|provider| provider.id.as_str())
            .collect::<Vec<_>>();

        assert!(ids.contains(&"openai"));
        assert!(ids.contains(&"anthropic"));
        assert!(ids.contains(&"google"));
        assert!(ids.contains(&"codex-cli"));
        assert!(ids.contains(&"claude-code"));
        assert!(ids.contains(&"gemini-cli"));
    }

    #[test]
    fn parses_supported_auth_provider_ids() {
        assert_eq!(parse_auth_provider("openai"), Some(AuthProvider::OpenAI));
        assert_eq!(
            parse_auth_provider("anthropic"),
            Some(AuthProvider::Anthropic)
        );
        assert_eq!(parse_auth_provider("google"), Some(AuthProvider::Google));
        assert_eq!(
            parse_auth_provider("openai_codex"),
            Some(AuthProvider::OpenAICodex)
        );
        assert_eq!(
            parse_auth_provider("claude_code"),
            Some(AuthProvider::ClaudeCode)
        );
        assert_eq!(parse_auth_provider("unknown"), None);
    }
}
