use hap_models::{ProviderCapability, ProviderModel};
use restflow_core::AIModel;
use restflow_core::auth::AuthProvider;
use serde::Deserialize;
use std::path::PathBuf;
use std::process::Command;
#[cfg(test)]
use std::sync::{Mutex, OnceLock};

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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ClaudeCodeCliStatus {
    Ready,
    MissingCommand,
    NotLoggedIn,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClaudeAuthStatus {
    logged_in: bool,
}

pub fn provider_capabilities() -> Vec<ProviderCapability> {
    PROVIDERS
        .iter()
        .map(|provider| {
            let (command_ready, status) = provider_status(provider);

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

fn provider_status(provider: &ProviderDefinition) -> (bool, String) {
    if provider.id == "claude-code" {
        return match claude_code_cli_status() {
            ClaudeCodeCliStatus::Ready => (true, "ready".to_string()),
            ClaudeCodeCliStatus::MissingCommand => (false, "missing_command:claude".to_string()),
            ClaudeCodeCliStatus::NotLoggedIn => (false, "not_logged_in".to_string()),
        };
    }

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

    (command_ready, status)
}

pub(crate) fn resolve_claude_executable() -> Option<PathBuf> {
    if let Ok(raw) = std::env::var("RESTFLOW_CLAUDE_BIN") {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            let path = PathBuf::from(trimmed);
            if path.is_file() {
                return Some(path);
            }
        }
    }

    which::which("claude").ok()
}

pub(crate) fn claude_code_cli_status() -> ClaudeCodeCliStatus {
    let Some(executable) = resolve_claude_executable() else {
        return ClaudeCodeCliStatus::MissingCommand;
    };

    let output = Command::new(executable).arg("auth").arg("status").output();

    let Ok(output) = output else {
        return ClaudeCodeCliStatus::NotLoggedIn;
    };

    if !output.status.success() {
        return ClaudeCodeCliStatus::NotLoggedIn;
    }

    serde_json::from_slice::<ClaudeAuthStatus>(&output.stdout)
        .ok()
        .filter(|status| status.logged_in)
        .map(|_| ClaudeCodeCliStatus::Ready)
        .unwrap_or(ClaudeCodeCliStatus::NotLoggedIn)
}

#[cfg(test)]
pub(crate) fn claude_env_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(())).lock().unwrap()
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
    use std::os::unix::fs::PermissionsExt;
    use uuid::Uuid;

    fn write_test_claude_script(name: &str, body: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("{name}-{}.sh", Uuid::new_v4()));
        std::fs::write(&path, body).unwrap();
        let mut permissions = std::fs::metadata(&path).unwrap().permissions();
        permissions.set_mode(0o755);
        std::fs::set_permissions(&path, permissions).unwrap();
        path
    }

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
    fn marks_claude_code_ready_when_auth_status_is_logged_in() {
        let _lock = claude_env_lock();
        let script = write_test_claude_script(
            "claude-ready",
            r#"#!/bin/sh
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
  echo '{"loggedIn":true}'
  exit 0
fi
exit 1
"#,
        );
        unsafe {
            std::env::set_var("RESTFLOW_CLAUDE_BIN", &script);
        }

        let provider = provider_capabilities()
            .into_iter()
            .find(|provider| provider.id == "claude-code")
            .unwrap();

        assert!(provider.available);
        assert_eq!(provider.status, "ready");

        unsafe {
            std::env::remove_var("RESTFLOW_CLAUDE_BIN");
        }
    }

    #[test]
    fn marks_claude_code_not_logged_in_when_auth_status_is_false() {
        let _lock = claude_env_lock();
        let script = write_test_claude_script(
            "claude-logged-out",
            r#"#!/bin/sh
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
  echo '{"loggedIn":false}'
  exit 0
fi
exit 1
"#,
        );
        unsafe {
            std::env::set_var("RESTFLOW_CLAUDE_BIN", &script);
        }

        let provider = provider_capabilities()
            .into_iter()
            .find(|provider| provider.id == "claude-code")
            .unwrap();

        assert!(!provider.available);
        assert_eq!(provider.status, "not_logged_in");

        unsafe {
            std::env::remove_var("RESTFLOW_CLAUDE_BIN");
        }
    }

    #[test]
    fn marks_claude_code_missing_when_override_path_is_invalid() {
        let _lock = claude_env_lock();
        unsafe {
            std::env::set_var("RESTFLOW_CLAUDE_BIN", "/tmp/does-not-exist-claude");
        }

        let provider = provider_capabilities()
            .into_iter()
            .find(|provider| provider.id == "claude-code")
            .unwrap();

        assert!(!provider.available);
        assert_eq!(provider.status, "missing_command:claude");

        unsafe {
            std::env::remove_var("RESTFLOW_CLAUDE_BIN");
        }
    }
}
