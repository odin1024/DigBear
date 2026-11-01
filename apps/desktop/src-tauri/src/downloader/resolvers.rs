//! Pluggable page-video resolvers.
//!
//! A site that needs a custom extraction protocol implements
//! [`PageVideoResolver`] and is added to [`registry`].  The first resolver that
//! supports a URL wins; when it fails, later resolvers can act as fallbacks.
//! New sites never need to touch the generic download pipeline.

use crate::core::net;
use crate::downloader::youtube::YoutubeResolver;
use crate::extensions;
use async_trait::async_trait;
use std::path::Path;
use std::process::Stdio;
use std::time::Duration;
use tauri::AppHandle;
use tokio::io::AsyncWriteExt;

#[derive(Debug, Clone)]
pub struct StreamAsset {
    pub url: String,
    pub size: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct ResolvedMedia {
    /// Page that the streams belong to (used as Referer).
    pub page_url: String,
    /// Video stream, or a progressive stream that already contains audio.
    pub video: StreamAsset,
    /// Separate audio stream when the video track is video-only.
    pub audio: Option<StreamAsset>,
    /// Container extension for the saved file.
    pub container: String,
}

#[async_trait]
pub trait PageVideoResolver: Send + Sync {
    /// Stable identifier shown in diagnostics.
    fn id(&self) -> &'static str;
    /// Cheap host/path check; must not perform network requests.
    fn supports(&self, url: &str) -> bool;
    /// Extract direct stream URLs. Downloads and muxing are shared.
    ///
    /// The app handle lets a resolver read cookies from the in-app sign-in
    /// session: some sites (YouTube) reject anonymous requests as bots.
    async fn resolve(&self, app: &tauri::AppHandle, url: &str) -> Result<ResolvedMedia, String>;
}

/// Ordered resolver chain. Add new (or replacement) resolvers at the front.
fn registry() -> Vec<Box<dyn PageVideoResolver>> {
    vec![Box::new(YoutubeResolver)]
}

/// Whether any built-in resolver can handle this URL (used for UI badges).
pub fn supports(url: &str) -> bool {
    registry().iter().any(|resolver| resolver.supports(url))
}

/// Resolve a page video, falling through to the next supporting resolver on failure.
pub async fn resolve(
    app: &tauri::AppHandle,
    url: &str,
) -> Option<Result<(String, ResolvedMedia), String>> {
    let mut matched = false;
    let mut last_error = String::new();
    for resolver in registry() {
        if !resolver.supports(url) {
            continue;
        }
        matched = true;
        match resolver.resolve(app, url).await {
            Ok(media) => return Some(Ok((resolver.id().to_string(), media))),
            Err(error) => {
                eprintln!("[digbear] resolver {} failed: {error}", resolver.id());
                last_error = error;
            }
        }
    }
    matched.then_some(Err(last_error))
}

async fn download_asset(
    client: &reqwest::Client,
    asset: &StreamAsset,
    referer: &str,
    target: &Path,
    offset: u64,
    overall_total: Option<u64>,
    progress: &(impl Fn(u64, Option<u64>) + Send + Sync),
) -> Result<(), String> {
    let mut response = client
        .get(&asset.url)
        .header("Referer", referer)
        .header("Accept", "*/*")
        .send()
        .await
        .map_err(|error| format!("视频流请求失败: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("视频流返回 HTTP {}。", response.status()));
    }

    let total = response.content_length().or(asset.size).or(overall_total);
    let mut received = 0u64;
    let mut file = tokio::fs::File::create(target)
        .await
        .map_err(|error| format!("无法创建临时文件: {error}"))?;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("读取视频流失败: {error}"))?
    {
        received += chunk.len() as u64;
        progress(offset + received, total);
        file.write_all(&chunk)
            .await
            .map_err(|error| format!("写入临时文件失败: {error}"))?;
    }
    file.flush()
        .await
        .map_err(|error| format!("写入临时文件失败: {error}"))?;
    Ok(())
}

/// Download and (if needed) mux a resolved page video into `target`.
pub async fn download(
    app: &AppHandle,
    media: &ResolvedMedia,
    target: &Path,
    progress: impl Fn(u64, Option<u64>) + Send + Sync,
) -> Result<(), String> {
    let client = net::client_with_user_agent(
        crate::core::webview::BROWSER_USER_AGENT,
        Duration::from_secs(1800),
    )?;

    let parent = target.parent().unwrap_or_else(|| Path::new("."));
    let base = target
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "video".to_string());
    let video_part = parent.join(format!("{base}.video.part"));
    let audio_part = parent.join(format!("{base}.audio.part"));

    let cleanup = || {
        let video_part = video_part.clone();
        let audio_part = audio_part.clone();
        async move {
            let _ = tokio::fs::remove_file(video_part).await;
            let _ = tokio::fs::remove_file(audio_part).await;
        }
    };

    let audio_size = media.audio.as_ref().and_then(|asset| asset.size);
    let overall_total = media
        .video
        .size
        .map(|video| video + audio_size.unwrap_or(0))
        .filter(|total| *total > 0);

    if let Err(error) = download_asset(
        &client,
        &media.video,
        &media.page_url,
        &video_part,
        0,
        overall_total,
        &progress,
    )
    .await
    {
        cleanup().await;
        return Err(error);
    }

    if let Some(audio) = &media.audio {
        if let Err(error) = download_asset(
            &client,
            audio,
            &media.page_url,
            &audio_part,
            media.video.size.unwrap_or(0),
            overall_total,
            &progress,
        )
        .await
        {
            cleanup().await;
            return Err(error);
        }
        let ffmpeg = extensions::ffmpeg_binary(app).ok_or_else(|| {
            "请先在「设置 → 扩展管理」安装 FFmpeg，用于合并视频与音频轨。".to_string()
        })?;
        let output = tokio::process::Command::new(ffmpeg)
            .arg("-nostdin")
            .arg("-y")
            .arg("-loglevel")
            .arg("error")
            .arg("-i")
            .arg(&video_part)
            .arg("-i")
            .arg(&audio_part)
            .arg("-c")
            .arg("copy")
            .arg("-movflags")
            .arg("+faststart")
            .arg(target)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|error| format!("无法启动 FFmpeg: {error}"))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            cleanup().await;
            return Err(format!(
                "合并音视频失败：{}",
                stderr.lines().last().unwrap_or("FFmpeg 执行失败").trim()
            ));
        }
        cleanup().await;
        return Ok(());
    }

    if let Err(error) = tokio::fs::rename(&video_part, target).await {
        cleanup().await;
        return Err(format!("保存视频失败：{error}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn youtube_resolver_is_registered() {
        assert!(supports("https://www.youtube.com/watch?v=abc"));
        assert!(!supports("https://example.com/video.mp4"));
    }
}
