//! Locally managed extensions.
//!
//! Extensions are app-private binaries (currently FFmpeg). They live under the
//! app data directory, never in the global PATH, and can be installed/removed
//! from Settings → 扩展管理.

use crate::core::error::AppError;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const FFMPEG_LICENSE: &str = "GPL-2.0-or-later";
const FFMPEG_DOWNLOAD_SIZE: u64 = 20 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
pub struct ExtensionStatus {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub installed: bool,
    pub installed_version: Option<String>,
    pub path: Option<String>,
    pub size_bytes: Option<u64>,
    pub download_size: u64,
    pub license: String,
    pub can_install: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExtensionProgress {
    pub id: String,
    pub stage: String,
    pub received: u64,
    pub total: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
struct InstalledManifest {
    version: String,
    installed_at: u64,
    source: String,
}

struct ExtensionDef {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    version: &'static str,
}

const CATALOG: &[ExtensionDef] = &[ExtensionDef {
    id: "ffmpeg",
    name: "FFmpeg",
    description: "视频封装与 HLS 下载。",
    version: "6.1.1",
}];

fn find_def(id: &str) -> Option<&'static ExtensionDef> {
    CATALOG.iter().find(|item| item.id == id)
}

pub fn extension_root(app: &AppHandle) -> Result<PathBuf, AppError> {
    if let Ok(dir) = std::env::var("DIGBEAR_EXTENSIONS_DIR")
        .or_else(|_| std::env::var("CRAWLBear_EXTENSIONS_DIR"))
    {
        return Ok(PathBuf::from(dir));
    }
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::new("extension_failed", format!("无法定位扩展目录: {error}")))?
        .join("extensions");
    Ok(dir)
}

/// Executable name of the managed FFmpeg build.
fn ffmpeg_file_name() -> &'static str {
    if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" }
}

pub fn ffmpeg_binary(app: &AppHandle) -> Option<PathBuf> {
    let path = extension_root(app)
        .ok()?
        .join("ffmpeg")
        .join("bin")
        .join(ffmpeg_file_name());
    path.is_file().then_some(path)
}

fn download_url() -> &'static str {
    // eugeneware/ffmpeg-static publishes one Windows build; it covers x64,
    // which is the only architecture the Windows installer targets.
    if cfg!(target_os = "windows") {
        "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64.gz"
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-darwin-arm64.gz"
        } else {
            "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-darwin-x64.gz"
        }
    } else if cfg!(target_arch = "aarch64") {
        "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-arm64.gz"
    } else {
        "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64.gz"
    }
}

fn status_for(app: &AppHandle, def: &ExtensionDef) -> ExtensionStatus {
    let root = extension_root(app).ok();
    let bin = root
        .as_ref()
        .map(|dir| dir.join(def.id).join("bin").join(ffmpeg_file_name()));
    let installed = bin.as_ref().map(|path| path.is_file()).unwrap_or(false);
    let manifest_path = root
        .as_ref()
        .map(|dir| dir.join(def.id).join("manifest.json"));
    let manifest = manifest_path
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|raw| serde_json::from_str::<InstalledManifest>(&raw).ok());
    let size_bytes = if installed {
        bin.as_ref()
            .and_then(|path| std::fs::metadata(path).ok())
            .map(|meta| meta.len())
    } else {
        None
    };
    ExtensionStatus {
        id: def.id.to_string(),
        name: def.name.to_string(),
        description: def.description.to_string(),
        version: def.version.to_string(),
        installed,
        installed_version: manifest.map(|value| value.version),
        path: bin.map(|path| path.to_string_lossy().to_string()),
        size_bytes,
        download_size: FFMPEG_DOWNLOAD_SIZE,
        license: FFMPEG_LICENSE.to_string(),
        can_install: cfg!(any(target_os = "macos", target_os = "windows")),
    }
}

pub fn list(app: &AppHandle) -> Vec<ExtensionStatus> {
    CATALOG.iter().map(|def| status_for(app, def)).collect()
}

pub async fn install(app: &AppHandle, id: &str) -> Result<ExtensionStatus, AppError> {
    let def = find_def(id)
        .ok_or_else(|| AppError::new("extension_not_found", "没有找到这个扩展。"))?;
    if !cfg!(any(target_os = "macos", target_os = "windows")) {
        return Err(AppError::new(
            "extension_unsupported",
            "当前扩展只提供 macOS 和 Windows 版本。",
        ));
    }

    let root = extension_root(app)?;
    let dir = root.join(def.id);
    let bin_dir = dir.join("bin");
    tokio::fs::create_dir_all(&bin_dir)
        .await
        .map_err(|error| AppError::new("extension_failed", format!("无法创建扩展目录: {error}")))?;

    let temp = dir.join("ffmpeg-download.gz");
    let client = crate::core::net::client(Duration::from_secs(1800))
        .map_err(|error| AppError::new("extension_failed", error))?;
    let mut received = 0u64;
    let mut total: Option<u64> = None;
    let mut complete = false;
    for attempt in 0..5 {
        if attempt > 0 {
            tokio::time::sleep(Duration::from_millis(600)).await;
        }
        let existing = tokio::fs::metadata(&temp)
            .await
            .map(|meta| meta.len())
            .unwrap_or(0);
        let mut request = client.get(download_url());
        if existing > 0 {
            request = request.header(reqwest::header::RANGE, format!("bytes={existing}-"));
        }
        let mut response = match request.send().await {
            Ok(response) => response,
            Err(error) => {
                eprintln!("[digbear] extension download retry {attempt}: {error}");
                continue;
            }
        };
        let status = response.status();
        let partial = status == reqwest::StatusCode::PARTIAL_CONTENT && existing > 0;
        if !status.is_success() && !partial {
            return Err(AppError::new(
                "extension_failed",
                format!("下载 FFmpeg 失败：HTTP {status}。"),
            ));
        }
        total = if partial {
            response.content_length().map(|remaining| existing + remaining)
        } else {
            response.content_length().or(Some(FFMPEG_DOWNLOAD_SIZE))
        };
        received = if partial { existing } else { 0 };
        if !partial {
            let _ = tokio::fs::remove_file(&temp).await;
        }
        let mut file = tokio::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .append(partial)
            .truncate(!partial)
            .open(&temp)
            .await
            .map_err(|error| AppError::new("extension_failed", format!("无法写入扩展文件: {error}")))?;
        let _ = app.emit(
            "extension-progress",
            ExtensionProgress {
                id: def.id.to_string(),
                stage: "downloading".to_string(),
                received,
                total,
            },
        );

        let mut stream_error = None;
        loop {
            match response.chunk().await {
                Ok(Some(chunk)) => {
                    use tokio::io::AsyncWriteExt;
                    file.write_all(&chunk).await.map_err(|error| {
                        AppError::new("extension_failed", format!("写入扩展失败: {error}"))
                    })?;
                    received += chunk.len() as u64;
                    let _ = app.emit(
                        "extension-progress",
                        ExtensionProgress {
                            id: def.id.to_string(),
                            stage: "downloading".to_string(),
                            received,
                            total,
                        },
                    );
                }
                Ok(None) => break,
                Err(error) => {
                    stream_error = Some(error);
                    break;
                }
            }
        }
        use tokio::io::AsyncWriteExt;
        file.flush()
            .await
            .map_err(|error| AppError::new("extension_failed", format!("写入扩展失败: {error}")))?;
        if let Some(error) = stream_error {
            eprintln!("[digbear] extension download interrupted at {received} bytes: {error}");
            continue;
        }
        complete = true;
        break;
    }
    if !complete {
        return Err(AppError::new(
            "extension_failed",
            "下载 FFmpeg 多次中断，请检查网络或代理后重试。",
        ));
    }

    let _ = app.emit(
        "extension-progress",
        ExtensionProgress {
            id: def.id.to_string(),
            stage: "installing".to_string(),
            received,
            total,
        },
    );

    let gz_path = temp.clone();
    let bin_path = bin_dir.join(ffmpeg_file_name());
    let bin_path_for_task = bin_path.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let compressed = std::fs::File::open(&gz_path).map_err(|error| error.to_string())?;
        let mut decoder = flate2::read::GzDecoder::new(compressed);
        let mut output = std::fs::File::create(&bin_path_for_task).map_err(|error| error.to_string())?;
        std::io::copy(&mut decoder, &mut output).map_err(|error| error.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = std::fs::metadata(&bin_path_for_task)
                .map_err(|error| error.to_string())?
                .permissions();
            permissions.set_mode(0o755);
            std::fs::set_permissions(&bin_path_for_task, permissions).map_err(|error| error.to_string())?;
        }
        let _ = std::fs::remove_file(&gz_path);
        Ok(())
    })
    .await
    .map_err(|error| AppError::new("extension_failed", format!("解压扩展失败: {error}")))?
    .map_err(|error| AppError::new("extension_failed", format!("解压 FFmpeg 失败: {error}")))?;

    let version_output = tokio::process::Command::new(&bin_path)
        .arg("-version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await;
    let verified = version_output.as_ref().map(|output| output.status.success()).unwrap_or(false);
    if !verified {
        let _ = tokio::fs::remove_file(&bin_path).await;
        return Err(AppError::new(
            "extension_failed",
            "FFmpeg 已下载但无法运行，可能下载不完整，请重试。",
        ));
    }
    let actual_version = version_output
        .ok()
        .map(|output| String::from_utf8_lossy(&output.stdout).to_string())
        .and_then(|text| {
            text.lines()
                .next()
                .and_then(|line| line.strip_prefix("ffmpeg version "))
                .and_then(|rest| rest.split_whitespace().next())
                .map(str::to_string)
        })
        .unwrap_or_else(|| def.version.to_string());

    let installed_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or(0);
    let manifest = InstalledManifest {
        version: actual_version,
        installed_at,
        source: download_url().to_string(),
    };
    tokio::fs::write(
        dir.join("manifest.json"),
        serde_json::to_vec_pretty(&manifest)
            .map_err(|error| AppError::internal(format!("写入扩展元数据失败: {error}")))?,
    )
    .await
    .map_err(|error| AppError::new("extension_failed", format!("写入扩展元数据失败: {error}")))?;

    let _ = app.emit(
        "extension-progress",
        ExtensionProgress {
            id: def.id.to_string(),
            stage: "done".to_string(),
            received,
            total,
        },
    );
    Ok(status_for(app, def))
}

pub fn remove(app: &AppHandle, id: &str) -> Result<Vec<ExtensionStatus>, AppError> {
    let def = find_def(id)
        .ok_or_else(|| AppError::new("extension_not_found", "没有找到这个扩展。"))?;
    let dir = extension_root(app)?.join(def.id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir)
            .map_err(|error| AppError::new("extension_failed", format!("删除扩展失败: {error}")))?;
    }
    Ok(list(app))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn catalog_has_ffmpeg() {
        assert!(find_def("ffmpeg").is_some());
        assert!(download_url().ends_with(".gz"));
    }
}
